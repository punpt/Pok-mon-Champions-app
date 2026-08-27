/**
 * Adaptador para a API publica de battle data do Pokemon Champions.
 *
 * Rotas conhecidas (documentadas publicamente em /api_guide):
 *   GET /api/battle/Doubles/{showdownId}   -> dados de um Pokemon
 *   GET /api/battle/Singles/{showdownId}
 * O indice com o roster e os usages tem caminho menos estavel, entao tentamos
 * uma lista de candidatos em ordem e ficamos com o primeiro que produzir um
 * indice utilizavel. Cada tentativa vai para o painel de diagnostico, entao
 * quando a API mudar da para ver exatamente o que voltou sem sair do app.
 */

import { fetchJson } from './client';
import {
  decideUsageScale,
  isObject,
  pick,
  pickNumber,
  pickString,
  toMetaSpreads,
  toWeightedNames,
  type UsageScale,
} from './normalize';
import type { MetaEntry, MetaSnapshot, SourceDiagnostics } from './types';
import { MetaFetchError } from './types';
import { normalizeId, getSpecies } from '../data/dex';
import { activeRegulation } from '../data/rules';

export const DEFAULT_BASE_URL = 'https://championsbattledata.com';

/** Caminhos candidatos para o indice, do mais provavel para o menos. */
const INDEX_PATHS = (format: string): string[] => [
  `/api/stats/${format}`,
  `/api/usage/${format}`,
  `/api/battle/${format}`,
  `/api/pokemon?format=${format}`,
  `/api/stats_list?format=${format}`,
  `/api/index?format=${format}`,
  `/api/pokemon`,
  `/api/index`,
];

function join(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Encontra a lista de Pokemon dentro de um envelope de formato desconhecido. */
function findEntryArray(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (!isObject(body)) return null;

  const direct = pick(body, ['pokemon', 'data', 'entries', 'results', 'list', 'stats', 'usage', 'items', 'rows']);
  if (Array.isArray(direct)) return direct;
  if (isObject(direct)) {
    // Mapa id -> objeto: transforma em lista preservando a chave como id.
    return Object.entries(direct).map(([k, v]) => (isObject(v) ? { id: k, ...v } : { id: k, usage: v }));
  }

  // Ultimo recurso: o proprio corpo e um mapa id -> objeto.
  const values = Object.values(body);
  if (values.length > 20 && values.every((v) => isObject(v))) {
    return Object.entries(body).map(([k, v]) => ({ id: k, ...(v as object) }));
  }
  return null;
}

const ID_KEYS = ['showdownid', 'showdown_id', 'id', 'slug', 'key', 'pokemon', 'species', 'name'];
const USAGE_KEYS = ['usage', 'usagepercent', 'percent', 'pct', 'usage_rate', 'rate', 'share'];

function parseEntry(raw: unknown, fallbackIndex: number): MetaEntry | null {
  if (!isObject(raw)) return null;

  const rawId = pickString(raw, ID_KEYS);
  if (!rawId) return null;
  const id = normalizeId(rawId);
  if (!id) return null;

  // Se o Showdown nao conhece o ID, e ruido do indice (cabecalho, agregado etc).
  const species = getSpecies(id);
  if (!species) return null;

  const usageRaw = pickNumber(raw, USAGE_KEYS);
  const usage = usageRaw === null ? 0 : usageRaw > 1.5 ? usageRaw / 100 : usageRaw;

  return {
    id,
    name: species.name,
    usage: Math.min(1, Math.max(0, usage)),
    rank: pickNumber(raw, ['rank', 'position', 'place']) ?? fallbackIndex + 1,
    abilities: toWeightedNames(pick(raw, ['abilities', 'ability', 'topabilities'])),
    items: toWeightedNames(pick(raw, ['items', 'item', 'heldItems', 'topitems'])),
    moves: toWeightedNames(pick(raw, ['moves', 'moveset', 'movesets', 'topmoves'])),
    teammates: toWeightedNames(pick(raw, ['teammates', 'teammate', 'partners', 'commonteammates'])),
    spreads: toMetaSpreads(pick(raw, ['spreads', 'spread', 'statpoints', 'evs', 'natures'])),
  };
}

/** O Pokemon pertence a um grupo banido na regulation vigente? */
function violatesBans(id: string): boolean {
  const species = getSpecies(id);
  if (!species) return false;
  const reg = activeRegulation();
  const tags = (species.tags ?? []) as string[];
  if (reg.bans.restricted && tags.includes('Restricted Legendary')) return true;
  if (reg.bans.paradox && tags.includes('Paradox')) return true;
  if (reg.bans.mythical && tags.includes('Mythical')) return true;
  if (reg.bans.treasuresOfRuin && ['chiyu', 'chienpao', 'tinglu', 'wochien'].includes(species.id)) return true;
  return false;
}

function sample(raw: string): string {
  return raw.length > 1200 ? `${raw.slice(0, 1200)}\n... (${raw.length} bytes no total)` : raw;
}

export interface LoadOptions {
  baseUrl?: string;
  format?: string;
  signal?: AbortSignal;
  /** Caminho fixo de indice, quando voce ja sabe qual funciona. */
  indexPath?: string | null;
  /** Como interpretar os numeros de usage da fonte. */
  usageScale?: UsageScale;
}

/** Busca o indice de meta ao vivo. Lanca MetaFetchError com diagnostico se falhar. */
export async function loadMetaIndex(opts: LoadOptions = {}): Promise<MetaSnapshot> {
  const baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).trim();
  const format = opts.format || 'Doubles';
  const diagnostics: SourceDiagnostics = {
    baseUrl,
    attempts: [],
    chosenUrl: null,
    entriesParsed: 0,
    warnings: [],
  };

  const paths = opts.indexPath ? [opts.indexPath, ...INDEX_PATHS(format)] : INDEX_PATHS(format);

  for (const path of paths) {
    if (opts.signal?.aborted) break;
    const url = join(baseUrl, path);
    const res = await fetchJson(url, { signal: opts.signal, retries: 0 });

    const attempt = {
      url,
      ok: res.ok,
      status: res.status,
      ms: res.ms,
      error: res.error,
      sample: res.raw ? sample(res.raw) : undefined,
    };
    diagnostics.attempts.push(attempt);

    if (!res.ok) continue;

    const arr = findEntryArray(res.body);
    if (!arr) {
      attempt.error = 'JSON valido, mas nao encontrei uma lista de Pokemon dentro dele';
      continue;
    }

    const entries = arr
      .map((item, i) => parseEntry(item, i))
      .filter((e): e is MetaEntry => e !== null);

    if (entries.length < 10) {
      attempt.error = `so ${entries.length} entradas reconhecidas — provavelmente nao e o indice`;
      continue;
    }

    // Rede de seguranca: o indice pode nao estar recortado pela regulation
    // vigente. Se vier Pokemon de um grupo banido, e sinal de que estamos
    // olhando um recorte errado — removemos e avisamos, em vez de deixar a
    // analise inteira apoiada num roster que nao existe no jogo.
    const ilegais = entries.filter((e) => violatesBans(e.id));
    if (ilegais.length) {
      const nomes = ilegais.slice(0, 5).map((e) => e.name).join(', ');
      diagnostics.warnings.push(
        `O indice trouxe ${ilegais.length} Pokemon de grupos banidos em ${activeRegulation().label} ` +
          `(${nomes}${ilegais.length > 5 ? ', ...' : ''}). Foram removidos, mas isso sugere que este ` +
          `endpoint nao esta recortado pela regulation atual.`,
      );
      for (const bad of ilegais) {
        const idx = entries.indexOf(bad);
        if (idx >= 0) entries.splice(idx, 1);
      }
    }

    // Sem usage nenhum o ranking vira ordem de chegada; avisamos em vez de fingir.
    if (entries.every((e) => e.usage === 0)) {
      diagnostics.warnings.push(
        'O indice nao trouxe percentuais de usage. O ranking esta usando a ordem devolvida pela API.',
      );
      entries.forEach((e, i) => {
        e.usage = Math.max(0.001, (entries.length - i) / entries.length / 10);
      });
    }

    // A fonte pode publicar usage por time (~600% somados) ou por slot (~100%).
    // Convertemos para a escala por time, que e a que o jogador reconhece.
    const reg = activeRegulation();
    const escala = decideUsageScale(
      entries.map((e) => e.usage),
      reg.teamSize,
      opts.usageScale ?? 'auto',
    );
    if (escala.factor !== 1) {
      for (const e of entries) e.usage = Math.min(1, e.usage * escala.factor);
    }
    diagnostics.usage = {
      mode: escala.mode,
      factor: escala.factor,
      rawSum: escala.rawSum,
      automatic: escala.automatic,
      amostra: entries
        .slice()
        .sort((a, b) => b.usage - a.usage)
        .slice(0, 5)
        .map((e) => `${e.name} ${(e.usage * 100).toFixed(1)}%`),
    };

    entries.sort((a, b) => b.usage - a.usage);
    entries.forEach((e, i) => (e.rank = i + 1));

    diagnostics.chosenUrl = url;
    diagnostics.entriesParsed = entries.length;

    return {
      format,
      regulationId: pickString(res.body, ['regulation', 'regulationId', 'reg']) ?? null,
      label: pickString(res.body, ['label', 'snapshot', 'folder', 'date', 'updated']) ?? null,
      source: baseUrl,
      fetchedAt: Date.now(),
      entries,
      diagnostics,
    };
  }

  throw new MetaFetchError(
    `Nenhum endpoint de indice respondeu em ${baseUrl}. Abra Ajustes > Diagnostico para ver o que cada tentativa devolveu.`,
    diagnostics,
  );
}

export interface DetailProbe {
  url: string;
  ok: boolean;
  status: number | null;
  ms: number;
  error?: string;
  /** Chaves do objeto devolvido, para ver como a API nomeia os campos. */
  chaves: string[];
  /** Quantos itens cada campo que nos interessa trouxe. */
  encontrado: { moves: number; items: number; abilities: number; spreads: number; teammates: number };
  amostra: string;
}

/**
 * Testa o endpoint de detalhe de um Pokemon e devolve o que aconteceu.
 *
 * Existe porque a falha silenciosa e a pior: quando o detalhe nao vem, o app
 * cai para um set derivado do movepool e continua funcionando, so que sem os
 * dados do ladder — e nada na tela diz que a ordenacao por usage parou de valer.
 */
export async function probeDetail(id: string, opts: LoadOptions = {}): Promise<DetailProbe> {
  const baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).trim();
  const format = opts.format || 'Doubles';
  const url = join(baseUrl, `/api/battle/${format}/${normalizeId(id)}`);
  const res = await fetchJson(url, { retries: 0 });

  const vazio = { moves: 0, items: 0, abilities: 0, spreads: 0, teammates: 0 };
  if (!res.ok || !isObject(res.body)) {
    return {
      url,
      ok: false,
      status: res.status,
      ms: res.ms,
      error: res.error ?? 'resposta nao e um objeto JSON',
      chaves: [],
      encontrado: vazio,
      amostra: sample(res.raw),
    };
  }

  const inner = (['data', 'pokemon', 'result', 'battle'] as const)
    .map((k) => (res.body as Record<string, unknown>)[k])
    .find((v) => isObject(v)) as Record<string, unknown> | undefined;
  const body = inner ?? (res.body as Record<string, unknown>);

  return {
    url,
    ok: true,
    status: res.status,
    ms: res.ms,
    chaves: Object.keys(body),
    encontrado: {
      moves: toWeightedNames(pick(body, ['moves', 'moveset', 'movesets', 'topmoves'])).length,
      items: toWeightedNames(pick(body, ['items', 'item', 'helditems', 'topitems'])).length,
      abilities: toWeightedNames(pick(body, ['abilities', 'ability', 'topabilities'])).length,
      spreads: toMetaSpreads(pick(body, ['spreads', 'spread', 'statpoints', 'evs', 'natures'])).length,
      teammates: toWeightedNames(pick(body, ['teammates', 'teammate', 'partners', 'commonteammates'])).length,
    },
    amostra: sample(res.raw),
  };
}

/** Detalhe de um Pokemon: moves, itens, abilities, teammates e spreads. */
export async function loadMetaDetail(
  id: string,
  opts: LoadOptions = {},
): Promise<Partial<MetaEntry> | null> {
  const baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).trim();
  const format = opts.format || 'Doubles';
  const url = join(baseUrl, `/api/battle/${format}/${normalizeId(id)}`);
  const res = await fetchJson(url, { signal: opts.signal, retries: 1 });
  if (!res.ok || !isObject(res.body)) return null;

  // O corpo pode vir embrulhado em data/pokemon/result.
  const inner = (['data', 'pokemon', 'result', 'battle'] as const)
    .map((k) => (res.body as Record<string, unknown>)[k])
    .find((v) => isObject(v)) as Record<string, unknown> | undefined;
  const body = inner ?? (res.body as Record<string, unknown>);

  const usageRaw = pickNumber(body, USAGE_KEYS);

  return {
    id: normalizeId(id),
    ...(usageRaw !== null ? { usage: usageRaw > 1.5 ? usageRaw / 100 : usageRaw } : {}),
    abilities: toWeightedNames(pick(body, ['abilities', 'ability', 'topabilities'])),
    items: toWeightedNames(pick(body, ['items', 'item', 'helditems', 'topitems'])),
    moves: toWeightedNames(pick(body, ['moves', 'moveset', 'movesets', 'topmoves'])),
    teammates: toWeightedNames(pick(body, ['teammates', 'teammate', 'partners', 'commonteammates'])),
    spreads: toMetaSpreads(pick(body, ['spreads', 'spread', 'statpoints', 'evs', 'natures'])),
  };
}
