/**
 * Importacao manual de dados de meta.
 *
 * Existe porque o caminho automatico depende de uma API comunitaria sem
 * contrato versionado, e quando ela muda ou sai do ar o app fica sem os numeros
 * que dao sentido a ele. O navegador do jogador alcanca fontes que este app nao
 * alcanca sozinho — por CORS, por autenticacao, ou porque a informacao esta numa
 * pagina e nao num endpoint. Colar o JSON e o caminho que nunca quebra.
 *
 * O que entra aqui passa pelo mesmo normalizador do caminho ao vivo, entao
 * qualquer formato que a API saberia ler tambem vale colado.
 */

import { isObject, pick, pickNumber, pickString, toMetaSpreads, toWeightedNames, decideUsageScale } from './normalize';
import type { MetaEntry, MetaSnapshot } from './types';
import { getSpecies, normalizeId } from '../data/dex';
import { activeRegulation } from '../data/rules';

export interface ImportResult {
  ok: boolean;
  snapshot: MetaSnapshot | null;
  /** Quantos Pokemon foram reconhecidos. */
  reconhecidos: number;
  /** Entradas que nao casaram com nenhuma especie conhecida. */
  ignorados: string[];
  /** Quantos trouxeram moveset, item e spread. */
  comDetalhe: { moves: number; items: number; abilities: number; spreads: number };
  /** Topo por usage depois de normalizar, para conferir contra outra fonte. */
  amostra: string[];
  erro?: string;
  avisos: string[];
}

const ID_KEYS = ['pokemon_id', 'showdownid', 'showdown_id', 'id', 'slug', 'key', 'pokemon', 'species', 'name'];
const USAGE_KEYS = ['usage_rate', 'usage', 'usagepercent', 'percent', 'pct', 'rate', 'share', 'pickrate', 'pick_rate'];
const WIN_KEYS = ['win_rate', 'winrate', 'wins'];

/** Encontra a lista de Pokemon dentro de um envelope de forma desconhecida. */
function acharLista(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (!isObject(body)) return null;

  const direto = pick(body, ['pokemon', 'data', 'entries', 'results', 'list', 'stats', 'usage', 'rows', 'items']);
  if (Array.isArray(direto)) return direto;
  if (isObject(direto)) {
    return Object.entries(direto).map(([k, v]) => (isObject(v) ? { id: k, ...v } : { id: k, usage: v }));
  }

  const valores = Object.values(body);
  if (valores.length > 5 && valores.every((v) => isObject(v))) {
    return Object.entries(body).map(([k, v]) => ({ id: k, ...(v as object) }));
  }
  return null;
}

export function importarMeta(texto: string): ImportResult {
  const vazio: ImportResult = {
    ok: false,
    snapshot: null,
    reconhecidos: 0,
    ignorados: [],
    comDetalhe: { moves: 0, items: 0, abilities: 0, spreads: 0 },
    amostra: [],
    avisos: [],
  };

  let body: unknown;
  try {
    body = JSON.parse(texto);
  } catch (e) {
    return { ...vazio, erro: `Nao e JSON valido: ${e instanceof Error ? e.message : String(e)}` };
  }

  const lista = acharLista(body);
  if (!lista) {
    return {
      ...vazio,
      erro: 'JSON valido, mas nao encontrei uma lista de Pokemon dentro dele. Cole o objeto que contem a lista, ou a lista em si.',
    };
  }

  const entries: MetaEntry[] = [];
  const ignorados: string[] = [];
  const avisos: string[] = [];
  const comDetalhe = { moves: 0, items: 0, abilities: 0, spreads: 0 };

  for (const bruto of lista) {
    if (!isObject(bruto)) continue;
    const rawId = pickString(bruto, ID_KEYS);
    if (!rawId) continue;

    const species = getSpecies(normalizeId(rawId));
    if (!species) {
      ignorados.push(rawId);
      continue;
    }

    // Os numeros podem vir em fracao (0.385) ou percentual (38.5).
    const usageBruto = pickNumber(bruto, USAGE_KEYS);
    const usage = usageBruto === null ? 0 : usageBruto > 1.5 ? usageBruto / 100 : usageBruto;

    const moves = toWeightedNames(pick(bruto, ['top_moves', 'moves', 'moveset', 'movesets']));
    const items = toWeightedNames(pick(bruto, ['top_items', 'items', 'item', 'helditems']));
    const abilities = toWeightedNames(pick(bruto, ['top_abilities', 'abilities', 'ability']));
    const spreads = toMetaSpreads(pick(bruto, ['spreads', 'spread', 'stat_spread', 'statpoints', 'evs', 'natures']));

    if (moves.length) comDetalhe.moves++;
    if (items.length) comDetalhe.items++;
    if (abilities.length) comDetalhe.abilities++;
    if (spreads.length) comDetalhe.spreads++;

    const winRate = pickNumber(bruto, WIN_KEYS);

    entries.push({
      id: species.id,
      name: species.name,
      usage: Math.min(1, Math.max(0, usage)),
      rank: pickNumber(bruto, ['rank', 'position']) ?? entries.length + 1,
      abilities,
      items,
      moves,
      teammates: toWeightedNames(pick(bruto, ['teammates', 'common_teammates', 'partners'])),
      spreads,
      ...(winRate !== null ? { winRate: winRate > 1.5 ? winRate / 100 : winRate } : {}),
    });
  }

  if (entries.length < 5) {
    return {
      ...vazio,
      ignorados,
      erro: `So reconheci ${entries.length} Pokemon. Confira se o JSON tem um campo de nome ou id por entrada.`,
    };
  }

  // Mesma deteccao de escala do caminho ao vivo: uma fonte pode publicar
  // participacao por slot em vez de por time.
  const reg = activeRegulation();
  const escala = decideUsageScale(entries.map((e) => e.usage), reg.teamSize);
  if (escala.factor !== 1) {
    for (const e of entries) e.usage = Math.min(1, e.usage * escala.factor);
    avisos.push(
      `Os usages somavam ${(escala.rawSum * 100).toFixed(0)}%, tipico de escala por slot. Multipliquei por ${escala.factor} para a escala por time.`,
    );
  }

  if (entries.every((e) => e.usage === 0)) {
    avisos.push('Nenhuma entrada trouxe usage. O ranking vai seguir a ordem do arquivo.');
    entries.forEach((e, i) => (e.usage = Math.max(0.001, (entries.length - i) / entries.length / 10)));
  }

  entries.sort((a, b) => b.usage - a.usage);
  entries.forEach((e, i) => (e.rank = i + 1));

  if (ignorados.length) {
    avisos.push(
      `${ignorados.length} entrada(s) nao casaram com nenhuma especie: ${ignorados.slice(0, 5).join(', ')}${
        ignorados.length > 5 ? '...' : ''
      }`,
    );
  }

  return {
    ok: true,
    reconhecidos: entries.length,
    ignorados,
    comDetalhe,
    avisos,
    amostra: entries.slice(0, 5).map((e) => `${e.name} ${(e.usage * 100).toFixed(1)}%`),
    snapshot: {
      format: reg.apiFormat,
      regulationId: pickString(body, ['regulation', 'regulation_set', 'reg']) ?? reg.id,
      label: pickString(body, ['label', 'snapshot', 'folder', 'date', 'updated']) ?? 'importado',
      source: 'importado manualmente',
      fetchedAt: Date.now(),
      entries,
    },
  };
}
