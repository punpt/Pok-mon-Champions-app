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
 * Escolhe quatro golpes de ataque plausiveis do movepool.
 * Prioriza STAB forte, cobertura de tipos distintos e golpes de prioridade,
 * que sao o que decide matchup em doubles.
 */
export async function deriveMoves(speciesId: string): Promise<string[]> {
  const species = getSpecies(speciesId);
  if (!species) return [];
  const bs = baseStatsOf(species);
  const physical = bs.atk >= bs.spa;
  const pool = await learnsetOf(speciesId);

  const scored = pool
    .map((name) => getMove(name))
    .filter((m): m is NonNullable<ReturnType<typeof getMove>> => m !== null && m.category !== 'Status')
    .filter((m) => (m.basePower ?? 0) > 0)
    .map((m) => {
      const rightSide = physical ? m.category === 'Physical' : m.category === 'Special';
      const stab = (species.types as readonly string[]).includes(m.type) ? 1.5 : 1;
      let score = (m.basePower ?? 0) * stab;
      if (!rightSide) score *= 0.45;
      // Golpes de prioridade valem mais do que a base power sugere.
      if ((m.priority ?? 0) > 0) score += 45;
      // Spread moves sao a moeda de doubles.
      if (m.target === 'allAdjacentFoes' || m.target === 'allAdjacent') score += 20;
      if ((m.accuracy as number | true) !== true && (m.accuracy as number) < 80) score *= 0.8;
      return { name: m.name, type: m.type, score };
    })
    .sort((a, b) => b.score - a.score);

  const chosen: string[] = [];
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
