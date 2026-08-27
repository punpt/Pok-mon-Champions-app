/**
 * Motor de sinergia.
 *
 * Clicando em qualquer Pokemon — do seu time ou da lista de ameacas — o app
 * responde duas coisas: quem joga bem AO LADO dele e quem joga bem CONTRA ele.
 *
 * A parte que diferencia isto de uma tabela de tipos e a cobertura de ameacas.
 * Em vez de "Sneasler resiste ao que Basculegion sofre", a pergunta e "quem
 * resolve o Kingambit, que e o que mata o meu Basculegion". Primeiro
 * levantamos as ameacas reais do ancora, depois procuramos quem responde
 * justamente a essas ameacas — sem abrir um buraco novo no processo.
 */

import type { MetaEntry } from '../api/types';
import type { ChampionsSet } from '../data/set';
import { battleSpecies } from '../data/set';
import { BATTLE_TYPES, defensiveProfile, getSpecies, type TypeName } from '../data/dex';
import { evaluateMatchup, scanThreatsFor, usageWeight, type Matchup, type ThreatScanOptions } from './threats';
import { presumedSetCached } from './presume';
import type { FieldOptions } from './calc';

export interface TypeSynergy {
  /** Fraquezas do ancora que o parceiro cobre. */
  covers: TypeName[];
  /** Fraquezas do parceiro que o ancora cobre. */
  covered: TypeName[];
  /** Tipos em que os dois sao fracos: empilhar isso perde partida. */
  shared: TypeName[];
  /** 0 a 1. */
  score: number;
}

function weaknessesOf(types: readonly TypeName[]): TypeName[] {
  const profile = defensiveProfile(types);
  return BATTLE_TYPES.filter((t) => profile[t] > 1);
}

function resistancesOf(types: readonly TypeName[]): TypeName[] {
  const profile = defensiveProfile(types);
  return BATTLE_TYPES.filter((t) => profile[t] < 1);
}

/** Complementaridade defensiva entre duas tipagens. */
export function typeSynergy(a: readonly TypeName[], b: readonly TypeName[]): TypeSynergy {
  const weakA = weaknessesOf(a);
  const weakB = weaknessesOf(b);
  const resistA = new Set(resistancesOf(a));
  const resistB = new Set(resistancesOf(b));

  const covers = weakA.filter((t) => resistB.has(t));
  const covered = weakB.filter((t) => resistA.has(t));
  const shared = weakA.filter((t) => weakB.includes(t));

  const coverRatio = weakA.length ? covers.length / weakA.length : 1;
  const coveredRatio = weakB.length ? covered.length / weakB.length : 1;
  const sharedPenalty = shared.length / Math.max(1, Math.max(weakA.length, weakB.length));

  const score = Math.max(0, Math.min(1, (coverRatio * 0.5 + coveredRatio * 0.3) - sharedPenalty * 0.4 + 0.2));

  return { covers, covered, shared, score };
}

export interface CoveredThreat {
  id: string;
  name: string;
  usage: number;
  /** Como o ancora se sai contra ela (alto = ruim para o ancora). */
  dangerToAnchor: number;
  /** Como o candidato se sai contra ela (baixo = candidato resolve). */
  dangerToPartner: number;
}

export interface PartnerSuggestion {
  id: string;
  name: string;
  usage: number;
  /** Quanto das ameacas do ancora este parceiro resolve, de 0 a 1. */
  threatCoverage: number;
  coveredThreats: CoveredThreat[];
  typeSynergy: TypeSynergy;
  /** Co-ocorrencia real no ladder, quando a API informa. */
  usageSynergy: number;
  score: number;
  reasons: string[];
}

export interface PartnerWeights {
  threats: number;
  types: number;
  usage: number;
}

export const DEFAULT_PARTNER_WEIGHTS: PartnerWeights = { threats: 0.5, types: 0.28, usage: 0.22 };

export interface PartnerOptions extends ThreatScanOptions {
  /** Quantas ameacas do ancora considerar ao medir cobertura. */
  threatDepth?: number;
  /** Quantos candidatos avaliar. */
  candidateLimit?: number;
  weights?: PartnerWeights;
  /** Especies ja no time, para nao sugerir repetido. */
  exclude?: string[];
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/**
 * Sugere parceiros para um ancora.
 *
 * O ancora pode ser um set montado por voce ou o set presumido de qualquer
 * Pokemon do meta — e por isso que da para clicar tanto no seu time quanto na
 * lista de ameacas.
 */
export async function suggestPartners(
  anchor: ChampionsSet,
  meta: MetaEntry[],
  opts: PartnerOptions = {},
): Promise<PartnerSuggestion[]> {
  const weights = opts.weights ?? DEFAULT_PARTNER_WEIGHTS;
  const threatDepth = opts.threatDepth ?? 12;
  const candidateLimit = opts.candidateLimit ?? 50;
  const field: FieldOptions = opts.field ?? {};
  const exclude = new Set([anchor.species, ...(opts.exclude ?? [])]);

  // 1. Quais sao, de fato, os problemas do ancora.
  const anchorThreats = await scanThreatsFor(anchor, meta, {
    limit: opts.limit ?? 45,
    field,
    signal: opts.signal,
  });
  const topThreats = anchorThreats.filter((t) => t.danger >= 0.5).slice(0, threatDepth);

  // Peso total das ameacas, para normalizar a cobertura.
  const threatMass = topThreats.reduce((s, t) => s + usageWeight(t.usage) * t.danger, 0) || 1;

  const anchorSpecies = battleSpecies(anchor);
  const anchorTypes = (anchorSpecies?.types ?? []) as TypeName[];

  // Co-ocorrencia declarada pela API para o ancora.
  const anchorEntry = meta.find((m) => m.id === anchor.species);
  const teammateMap = new Map<string, number>();
  for (const t of anchorEntry?.teammates ?? []) {
    const s = getSpecies(t.name);
    if (s) teammateMap.set(s.id, t.usage);
  }

  const candidates = meta.slice(0, candidateLimit).filter((c) => !exclude.has(c.id) && getSpecies(c.id));
  const suggestions: PartnerSuggestion[] = [];

  for (let i = 0; i < candidates.length; i++) {
    if (opts.signal?.aborted) break;
    const cand = candidates[i];
    const presumed = await presumedSetCached(cand.id, cand);
    const candSpecies = battleSpecies(presumed.set);
    if (!candSpecies) continue;

    // 2. Quanto das ameacas do ancora este candidato resolve.
    const covered: CoveredThreat[] = [];
    let coverageMass = 0;

    for (const threat of topThreats) {
      const vs = evaluateMatchup(
        presumed.set,
        threat.opponentSet,
        {
          id: threat.id,
          name: threat.name,
          usage: threat.usage,
          rank: threat.rank,
          provenance: threat.provenance,
        },
        field,
      );
      // O candidato responde quando NAO esta em perigo contra aquela ameaca.
      if (vs.danger <= 0.4) {
        const w = usageWeight(threat.usage) * threat.danger;
        coverageMass += w;
        covered.push({
          id: threat.id,
          name: threat.name,
          usage: threat.usage,
          dangerToAnchor: threat.danger,
          dangerToPartner: vs.danger,
        });
      }
    }

    const threatCoverage = Math.min(1, coverageMass / threatMass);
    const types = typeSynergy(anchorTypes, candSpecies.types as TypeName[]);
    const usageSynergy = teammateMap.get(cand.id) ?? 0;

    const score =
      threatCoverage * weights.threats +
      types.score * weights.types +
      Math.min(1, usageSynergy * 2) * weights.usage;

    const reasons: string[] = [];
    if (covered.length) {
      const headline = covered
        .slice(0, 3)
        .map((c) => `${c.name} (${fmtPct(c.usage)} de usage)`)
        .join(', ');
      reasons.push(`Resolve ${headline}${covered.length > 3 ? ` e mais ${covered.length - 3}` : ''}.`);
    }
    if (types.covers.length) {
      reasons.push(`Cobre suas fraquezas a ${types.covers.join(', ')}.`);
    }
    if (types.shared.length) {
      reasons.push(`Atencao: os dois sao fracos a ${types.shared.join(', ')}.`);
    }
    if (usageSynergy > 0) {
      reasons.push(`Aparece junto em ${fmtPct(usageSynergy)} dos times do ladder.`);
    }
    if (!reasons.length) reasons.push('Sinergia fraca: entra so como preenchimento.');

    suggestions.push({
      id: cand.id,
      name: cand.name,
      usage: cand.usage,
      threatCoverage,
      coveredThreats: covered.sort((a, b) => b.usage - a.usage),
      typeSynergy: types,
      usageSynergy,
      score,
      reasons,
    });

    if (i % 6 === 5) {
      opts.onProgress?.(i + 1, candidates.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  return suggestions.sort((a, b) => b.score - a.score);
}

/**
 * Quem joga bem CONTRA este Pokemon.
 * E o mesmo motor de ameacas visto do outro lado: os melhores checks sao os
 * Pokemon com maior danger contra o ancora.
 */
export async function suggestCounters(
  anchor: ChampionsSet,
  meta: MetaEntry[],
  opts: ThreatScanOptions = {},
): Promise<Matchup[]> {
  const all = await scanThreatsFor(anchor, meta, opts);
  return all.filter((m) => m.danger >= 0.5).sort((a, b) => b.danger - a.danger);
}
