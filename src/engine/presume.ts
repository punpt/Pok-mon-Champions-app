/**
 * Reconstrucao do set provavel de um Pokemon do meta.
 *
 * Quando a API ja devolveu o detalhe daquele Pokemon usamos os dados reais
 * (moves, item, ability e spread mais jogados). Quando ainda nao devolveu — ou
 * quando o Pokemon nem aparece no recorte — derivamos um set plausivel do
 * movepool. Assim o motor de ameacas continua respondendo em vez de ficar em
 * branco, e a interface marca de onde veio cada set.
 */

import type { MetaEntry } from '../api/types';
import { emptySet, type ChampionsSet } from '../data/set';
import { abilitiesOf, baseStatsOf, getMove, getSpecies, learnsetOf, normalizeId } from '../data/dex';
import { makeSpread, SP_MAX_PER_STAT, SP_TOTAL, type SpSpread } from '../data/stats';

export type SetProvenance = 'meta' | 'derivado';

export interface PresumedSet {
  set: ChampionsSet;
  provenance: SetProvenance;
  /** Quanto do set veio de dados reais, de 0 a 1. */
  confidence: number;
}

/** Nature padrao a partir do perfil ofensivo da especie. */
function defaultNature(speciesId: string): string {
  const s = getSpecies(speciesId);
  if (!s) return 'Serious';
  const bs = baseStatsOf(s);
  const physical = bs.atk >= bs.spa;
  const fast = bs.spe >= 90;
  if (physical) return fast ? 'Jolly' : 'Adamant';
  return fast ? 'Timid' : 'Modest';
}

/** Spread padrao: 32 no stat ofensivo principal, 32 em Speed, resto em HP. */
function defaultSpread(speciesId: string): SpSpread {
  const s = getSpecies(speciesId);
  const spread = makeSpread();
  if (!s) return spread;
  const bs = baseStatsOf(s);
  const offensive = bs.atk >= bs.spa ? 'atk' : 'spa';
  spread[offensive] = SP_MAX_PER_STAT;
  spread.spe = SP_MAX_PER_STAT;
  spread.hp = Math.max(0, SP_TOTAL - SP_MAX_PER_STAT * 2);
  return spread;
}

/**
 * Penalidade de um golpe pelos seus efeitos colaterais.
 *
 * Base power sozinho e um criterio ruim: Hyper Beam tem 150 e ninguem joga,
 * porque perde o turno seguinte. Head Smash tem 150 e cobra metade do dano
 * causado de volta. Solar Beam e Phantom Force gastam um turno carregando, o
 * que em doubles com timer de 45s costuma significar tomar dois ataques de
 * graca. Wave Crash, com 33% de recuo, e jogadissimo — a penalidade precisa ser
 * proporcional ao custo, nao um corte seco.
 *
 * Devolve um multiplicador de 0 a 1, onde 0 descarta o golpe.
 */
function penalidade(move: NonNullable<ReturnType<typeof getMove>>, temPowerHerb: boolean): number {
  const flags = (move.flags ?? {}) as Record<string, number | undefined>;
  let fator = 1;

  // Perder o turno seguinte e inaceitavel num formato de partidas curtas.
  if (flags.recharge) return 0;
  // Sacrificar o proprio Pokemon so faz sentido em set dedicado.
  if (move.selfdestruct) return 0;
  // Carregar um turno so compensa com Power Herb.
  if (flags.charge && !temPowerHerb) return 0;

  // Recuo em faixas, nao proporcional. A curva linear punia demais a faixa de
  // um terco e fazia o Basculegion trocar Wave Crash por Liquidation — o
  // oposto do que se joga. Um terco e caro porem corrente; metade quase nunca
  // compensa.
  const recoil = (move as unknown as { recoil?: [number, number] }).recoil;
  if (recoil) {
    const fracao = recoil[0] / recoil[1];
    if (fracao <= 0.34) fator *= 0.85;
    else if (fracao <= 0.5) fator *= 0.55;
    else fator *= 0.35;
  }

  // Steel Beam e afins cobram metade do HP maximo.
  if ((move as unknown as { mindBlownRecoil?: boolean }).mindBlownRecoil) fator *= 0.5;

  // Queda de stat proprio (Make It Rain, Overheat): custa, mas nao inviabiliza.
  const selfBoosts = (move.self as { boosts?: Record<string, number> } | undefined)?.boosts;
  if (selfBoosts && Object.values(selfBoosts).some((v) => v < 0)) fator *= 0.85;

  // Precisao entra como valor esperado, nao como corte.
  const acc = move.accuracy;
  if (typeof acc === 'number' && acc < 100) fator *= acc / 100;

  return fator;
}

/**
 * Relevancia competitiva de um golpe para uma especie.
 *
 * Usada tanto para montar um set derivado quanto para ordenar os seletores da
 * interface quando a API nao informou o usage daquele Pokemon. Sem isso a lista
 * sai em ordem alfabetica, e o jogador rola por Agility, Aqua Jet e Bite antes
 * de chegar em Sucker Punch.
 */
export function moveRelevance(speciesId: string, moveName: string, item = ''): number {
  const species = getSpecies(speciesId);
  const move = getMove(moveName);
  if (!species || !move) return 0;

  const bs = baseStatsOf(species);
  const physical = bs.atk >= bs.spa;
  const temPowerHerb = normalizeId(item) === 'powerherb';

  if (move.category === 'Status') {
    // Utilidades que decidem doubles valem mais que um ataque fraco qualquer.
    const uteis: Record<string, number> = {
      protect: 95, fakeout: 90, tailwind: 88, trickroom: 86, ragepowder: 86,
      followme: 86, spore: 85, willowisp: 70, thunderwave: 70, helpinghand: 68,
      icywind: 68, taunt: 60, encore: 60, swordsdance: 58, nastyplot: 58,
      lightscreen: 50, reflect: 50, calmmind: 50, dragondance: 55, partingshot: 65,
      knockoff: 75, wideguard: 60, allyswitch: 45,
    };
    return uteis[normalizeId(move.name)] ?? 20;
  }

  const fator = penalidade(move, temPowerHerb);
  if (fator === 0) return 0;

  const rightSide = physical ? move.category === 'Physical' : move.category === 'Special';
  const stab = (species.types as readonly string[]).includes(move.type) ? 1.5 : 1;
  let score = (move.basePower ?? 0) * stab * fator;
  if (!rightSide) score *= 0.45;
  if ((move.priority ?? 0) > 0) score += 45;
  if (move.target === 'allAdjacentFoes' || move.target === 'allAdjacent') score += 20;
  return score;
}

/**
 * Escolhe ate quatro golpes plausiveis do movepool.
 *
 * Isto e um recurso de ultimo caso: quando a API do ladder informa os golpes
 * mais jogados, sao eles que valem. Aqui montamos algo que um jogador
 * reconheceria — STAB do lado ofensivo certo, cobertura de tipos distintos,
 * prioridade e spread moves valendo mais do que a base power sugere, e Protect,
 * que esta em quase todo set de doubles.
 */
export async function deriveMoves(speciesId: string, item = ''): Promise<string[]> {
  const species = getSpecies(speciesId);
  if (!species) return [];
  const bs = baseStatsOf(species);
  const physical = bs.atk >= bs.spa;
  const pool = await learnsetOf(speciesId);
  const temPowerHerb = normalizeId(item) === 'powerherb';

  const chosen: string[] = [];

  // Protect ocupa um slot em praticamente todo set de doubles: compra turno,
  // informacao e sobrevive a foco duplo.
  const protect = pool.find((n) => normalizeId(n) === 'protect');
  if (protect) chosen.push(protect);

  const scored = pool
    .map((name) => getMove(name))
    .filter((m): m is NonNullable<ReturnType<typeof getMove>> => m !== null && m.category !== 'Status')
    .filter((m) => (m.basePower ?? 0) > 0)
    .map((m) => {
      const fator = penalidade(m, temPowerHerb);
      if (fator === 0) return null;

      const rightSide = physical ? m.category === 'Physical' : m.category === 'Special';
      const stab = (species.types as readonly string[]).includes(m.type) ? 1.5 : 1;
      let score = (m.basePower ?? 0) * stab * fator;
      if (!rightSide) score *= 0.45;
      if ((m.priority ?? 0) > 0) score += 45;
      if (m.target === 'allAdjacentFoes' || m.target === 'allAdjacent') score += 20;
      return { name: String(m.name), type: String(m.type), score };
    })
    .filter((x) => x !== null)
    .map((x) => x as { name: string; type: string; score: number })
    .sort((a, b) => b.score - a.score);

  const usedTypes = new Set<string>();
  for (const m of scored) {
    if (chosen.length >= 4) break;
    // Segundo golpe do mesmo tipo so entra se ainda sobrar espaco de sobra.
    if (usedTypes.has(m.type) && chosen.length < 3) continue;
    chosen.push(m.name);
    usedTypes.add(m.type);
  }
  for (const m of scored) {
    if (chosen.length >= 4) break;
    if (!chosen.includes(m.name)) chosen.push(m.name);
  }
  return chosen.slice(0, 4);
}

/** Item plausivel quando a API nao informou. */
function defaultItem(speciesId: string): string {
  const s = getSpecies(speciesId);
  if (!s) return '';
  const bs = baseStatsOf(s);
  if (bs.spe >= 100) return 'Focus Sash';
  return 'Assault Vest';
}

export async function presumeSet(
  speciesId: string,
  entry: MetaEntry | null,
): Promise<PresumedSet> {
  const species = getSpecies(speciesId);
  const set = emptySet(speciesId);
  if (!species) return { set, provenance: 'derivado', confidence: 0 };

  let signals = 0;
  const total = 4;

  // Ability
  const metaAbility = entry?.abilities?.[0]?.name;
  const legalAbilities = abilitiesOf(species);
  if (metaAbility && legalAbilities.some((a) => normalizeId(a) === normalizeId(metaAbility))) {
    set.ability = legalAbilities.find((a) => normalizeId(a) === normalizeId(metaAbility))!;
    signals++;
  } else {
    set.ability = legalAbilities[0] ?? '';
  }

  // Item
  const metaItem = entry?.items?.[0]?.name;
  if (metaItem) {
    set.item = metaItem;
    signals++;
  } else {
    set.item = defaultItem(speciesId);
  }

  // Spread e nature
  const metaSpread = entry?.spreads?.[0];
  if (metaSpread) {
    set.nature = metaSpread.nature || defaultNature(speciesId);
    set.sp = metaSpread.sp;
    signals++;
  } else {
    set.nature = defaultNature(speciesId);
    set.sp = defaultSpread(speciesId);
  }

  // Odds de cada golpe, para o motor de ameacas ponderar em vez de assumir.
  const odds: Record<string, number> = {};
  for (const m of entry?.moves ?? []) {
    const move = getMove(m.name);
    if (move) odds[move.name] = Math.min(1, Math.max(0, m.usage));
  }
  if (Object.keys(odds).length) set.moveOdds = odds;

  // Moves
  const metaMoves = (entry?.moves ?? [])
    .map((m) => getMove(m.name))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .map((m) => m.name);
  if (metaMoves.length >= 3) {
    set.moves = metaMoves.slice(0, 4);
    signals++;
  } else {
    const derived = await deriveMoves(speciesId);
    // Preserva o que veio do meta e completa com o derivado.
    const merged: string[] = [...metaMoves];
    for (const m of derived) {
      if (merged.length >= 4) break;
      if (!merged.includes(m)) merged.push(m);
    }
    set.moves = merged.slice(0, 4);
    if (metaMoves.length) signals += 0.5;
  }

  const confidence = signals / total;
  return {
    set,
    provenance: confidence >= 0.75 ? 'meta' : 'derivado',
    confidence,
  };
}

/** Cache de sets presumidos, para nao recalcular movepool a cada render. */
const cache = new Map<string, Promise<PresumedSet>>();

export function presumedSetCached(speciesId: string, entry: MetaEntry | null): Promise<PresumedSet> {
  const key = `${speciesId}|${entry?.moves?.length ?? 0}|${entry?.items?.[0]?.name ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = presumeSet(speciesId, entry);
  cache.set(key, p);
  return p;
}

export function clearPresumeCache(): void {
  cache.clear();
}
