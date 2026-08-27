/**
 * Motor de ameacas.
 *
 * Responde duas perguntas:
 *   1. Quem ameaca ESTE Pokemon, ordenado por usage no ladder;
 *   2. Quem ameaca o TIME inteiro, destacando o que ninguem responde.
 *
 * O ponto que a maioria das ferramentas erra e tratar "mais rapido" como
 * sinonimo de "age primeiro". O caso classico do Champions: Basculegion supera
 * Kingambit em Speed, mas Sucker Punch tem prioridade +1 e mata antes. Aqui a
 * ordem de acao e resolvida por prioridade primeiro e Speed depois, e golpes de
 * prioridade que matam ganham um destaque proprio.
 */

import type { MetaEntry } from '../api/types';
import type { ChampionsSet } from '../data/set';
import { getMove, getSpecies } from '../data/dex';
import { bestMoveAgainst, calcDamage, effectiveSpeed, type CalcOutput, type FieldOptions } from './calc';
import { presumedSetCached, type SetProvenance } from './presume';

export type Verdict = 'perde-feio' | 'desfavoravel' | 'equilibrado' | 'favoravel' | 'domina';

export const VERDICT_LABEL: Record<Verdict, string> = {
  'perde-feio': 'Perde feio',
  desfavoravel: 'Desfavoravel',
  equilibrado: 'Equilibrado',
  favoravel: 'Favoravel',
  domina: 'Domina',
};

export interface Matchup {
  /** ID Showdown do oponente avaliado. */
  id: string;
  name: string;
  usage: number;
  rank: number;
  provenance: SetProvenance;
  opponentSet: ChampionsSet;
  /** Melhor golpe do oponente contra o meu Pokemon. */
  incoming: CalcOutput | null;
  /** Melhor golpe do meu Pokemon contra ele. */
  outgoing: CalcOutput | null;
  /** Fracao maxima do meu HP que ele tira em um golpe. */
  incomingPct: number;
  outgoingPct: number;
  mySpeed: number;
  theirSpeed: number;
  /** Ele age antes de mim considerando prioridade do melhor golpe. */
  theyActFirst: boolean;
  /** Ele mata com golpe de prioridade mesmo sendo mais lento. */
  priorityKO: { move: string; pct: number } | null;
  /** 0 a 1: o quanto ele e perigoso para mim. */
  danger: number;
  /** danger ponderado pelo usage: e assim que a lista principal e ordenada. */
  weighted: number;
  verdict: Verdict;
  reasons: string[];
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/**
 * Procura o golpe de prioridade mais letal do oponente.
 * E separado do "melhor golpe" porque um Sucker Punch que mata muda o matchup
 * inteiro mesmo quando nao e o golpe de maior dano bruto.
 */
function findPriorityKO(
  opponent: ChampionsSet,
  mine: ChampionsSet,
  field: FieldOptions,
): { move: string; pct: number } | null {
  let best: { move: string; pct: number } | null = null;
  for (const moveName of opponent.moves) {
    const move = getMove(moveName);
    if (!move || move.category === 'Status') continue;
    if ((move.priority ?? 0) <= 0) continue;
    const out = calcDamage({ attacker: opponent, defender: mine, move: moveName, field });
    if (!out) continue;
    if (out.percent[1] >= 1 && (!best || out.percent[1] > best.pct)) {
      best = { move: move.name, pct: out.percent[1] };
    }
  }
  return best;
}

function classify(danger: number): Verdict {
  if (danger >= 0.8) return 'perde-feio';
  if (danger >= 0.6) return 'desfavoravel';
  if (danger >= 0.4) return 'equilibrado';
  if (danger >= 0.2) return 'favoravel';
  return 'domina';
}

/** Avalia um confronto 1x1 entre o meu set e o set presumido de um oponente. */
export function evaluateMatchup(
  mine: ChampionsSet,
  opponent: ChampionsSet,
  meta: { id: string; name: string; usage: number; rank: number; provenance: SetProvenance },
  field: FieldOptions = {},
): Matchup {
  const incoming = bestMoveAgainst(opponent, mine, field);
  const outgoing = bestMoveAgainst(mine, opponent, field);

  const incomingPct = incoming ? incoming.percent[1] : 0;
  const outgoingPct = outgoing ? outgoing.percent[1] : 0;

  const mySpeed = effectiveSpeed(mine, field);
  const theirSpeed = effectiveSpeed(opponent, field);

  const myPriority = outgoing ? getMove(outgoing.move)?.priority ?? 0 : 0;
  const theirPriority = incoming ? getMove(incoming.move)?.priority ?? 0 : 0;

  const theyActFirst =
    theirPriority !== myPriority ? theirPriority > myPriority : theirSpeed > mySpeed;

  const priorityKO = findPriorityKO(opponent, mine, field);

  // Perigo: quanto ele tira de mim, penalizado pelo que eu devolvo, e com peso
  // extra quando ele age primeiro (o dano dele acontece antes do meu).
  const initiative = theyActFirst || priorityKO ? 1 : 0.7;
  const raw = Math.min(1.4, incomingPct) * initiative - Math.min(1.2, outgoingPct) * 0.35;
  const danger = Math.max(0, Math.min(1, raw));

  const reasons: string[] = [];
  if (priorityKO) {
    reasons.push(
      `Mata com ${priorityKO.move} (prioridade) — velocidade nao te salva.`,
    );
  }
  if (incoming) {
    if (incomingPct >= 1) {
      reasons.push(`OHKO com ${incoming.move} (${pct(incoming.percent[0])}–${pct(incomingPct)}).`);
    } else if (incomingPct >= 0.5) {
      reasons.push(`${incoming.move} tira ${pct(incoming.percent[0])}–${pct(incomingPct)}: 2HKO.`);
    } else {
      reasons.push(`Melhor golpe dele: ${incoming.move}, ${pct(incomingPct)} no maximo.`);
    }
  } else {
    reasons.push('Nao tem golpe de ataque relevante contra voce.');
  }
  if (outgoing) {
    if (outgoingPct >= 1) reasons.push(`Voce mata de volta com ${outgoing.move}.`);
    else if (outgoingPct < 0.35) reasons.push(`Voce mal arranha: ${outgoing.move} so tira ${pct(outgoingPct)}.`);
  } else {
    reasons.push('Voce nao tem como machucar ele com este set.');
  }
  if (!priorityKO) {
    reasons.push(
      theyActFirst
        ? `Ele age primeiro (${theirSpeed} contra ${mySpeed} de Speed).`
        : `Voce age primeiro (${mySpeed} contra ${theirSpeed} de Speed).`,
    );
  }

  return {
    id: meta.id,
    name: meta.name,
    usage: meta.usage,
    rank: meta.rank,
    provenance: meta.provenance,
    opponentSet: opponent,
    incoming,
    outgoing,
    incomingPct,
    outgoingPct,
    mySpeed,
    theirSpeed,
    theyActFirst,
    priorityKO,
    danger,
    weighted: danger * usageWeight(meta.usage),
    verdict: classify(danger),
    reasons,
  };
}

/**
 * Peso de usage aplicado ao ranking.
 *
 * Usar o usage cru achata tudo: um Pokemon de 30% ficaria 30x acima de um de
 * 1%, escondendo ameacas reais porem menos populares. A raiz quadrada mantem a
 * ordem por popularidade sem apagar o resto do ladder.
 */
export function usageWeight(usage: number): number {
  return Math.sqrt(Math.max(0, usage));
}

async function yieldToUi(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

export interface ThreatScanOptions {
  /** Quantos Pokemon do topo do ladder avaliar. */
  limit?: number;
  field?: FieldOptions;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

/** Ameacas contra UM Pokemon, ordenadas por perigo ponderado pelo usage. */
export async function scanThreatsFor(
  mine: ChampionsSet,
  meta: MetaEntry[],
  opts: ThreatScanOptions = {},
): Promise<Matchup[]> {
  const limit = opts.limit ?? 60;
  const pool = meta.slice(0, limit);
  const out: Matchup[] = [];

  for (let i = 0; i < pool.length; i++) {
    if (opts.signal?.aborted) break;
    const entry = pool[i];
    if (!getSpecies(entry.id)) continue;
    if (entry.id === mine.species) continue;

    const presumed = await presumedSetCached(entry.id, entry);
    out.push(
      evaluateMatchup(
        mine,
        presumed.set,
        {
          id: entry.id,
          name: entry.name,
          usage: entry.usage,
          rank: entry.rank,
          provenance: presumed.provenance,
        },
        opts.field ?? {},
      ),
    );

    if (i % 8 === 7) {
      opts.onProgress?.(i + 1, pool.length);
      await yieldToUi();
    }
  }

  opts.onProgress?.(pool.length, pool.length);
  return out.sort((a, b) => b.weighted - a.weighted);
}

export interface TeamThreat {
  id: string;
  name: string;
  usage: number;
  rank: number;
  /** Confronto contra cada membro do time, na ordem do time. */
  perMember: Matchup[];
  /** Quantos membros ele vence. */
  beats: number;
  /** Membros que respondem a ele (uid do set). */
  answeredBy: string[];
  /** Ninguem no time tem matchup favoravel contra ele. */
  unanswered: boolean;
  /** 0 a 1: perigo agregado contra o time. */
  teamDanger: number;
  weighted: number;
}

export interface TeamThreatReport {
  threats: TeamThreat[];
  /** Ameacas sem resposta, ordenadas por usage ponderado. */
  unanswered: TeamThreat[];
  evaluated: number;
}

/** Ameacas contra o time inteiro. */
export async function scanTeamThreats(
  team: ChampionsSet[],
  meta: MetaEntry[],
  opts: ThreatScanOptions = {},
): Promise<TeamThreatReport> {
  const limit = opts.limit ?? 50;
  const members = team.filter((m) => m.species);
  const pool = meta.slice(0, limit);
  const threats: TeamThreat[] = [];

  for (let i = 0; i < pool.length; i++) {
    if (opts.signal?.aborted) break;
    const entry = pool[i];
    if (!getSpecies(entry.id)) continue;

    const presumed = await presumedSetCached(entry.id, entry);
    const perMember: Matchup[] = members.map((mine) =>
      evaluateMatchup(
        mine,
        presumed.set,
        {
          id: entry.id,
          name: entry.name,
          usage: entry.usage,
          rank: entry.rank,
          provenance: presumed.provenance,
        },
        opts.field ?? {},
      ),
    );

    const beats = perMember.filter((m) => m.danger >= 0.6).length;
    const answeredBy = members
      .filter((_, idx) => perMember[idx].danger <= 0.35)
      .map((m) => m.uid);
    const teamDanger = members.length
      ? perMember.reduce((s, m) => s + m.danger, 0) / members.length
      : 0;

    threats.push({
      id: entry.id,
      name: entry.name,
      usage: entry.usage,
      rank: entry.rank,
      perMember,
      beats,
      answeredBy,
      unanswered: answeredBy.length === 0 && members.length > 0,
      teamDanger,
      weighted: teamDanger * usageWeight(entry.usage),
    });

    if (i % 4 === 3) {
      opts.onProgress?.(i + 1, pool.length);
      await yieldToUi();
    }
  }

  opts.onProgress?.(pool.length, pool.length);
  threats.sort((a, b) => b.weighted - a.weighted);

  return {
    threats,
    unanswered: threats.filter((t) => t.unanswered),
    evaluated: threats.length,
  };
}
