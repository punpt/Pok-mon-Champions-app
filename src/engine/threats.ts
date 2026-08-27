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
import { bestMoveAgainst, calcDamage, effectiveSpeed, rankedMovesAgainst, type CalcOutput, type FieldOptions } from './calc';
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
  /**
   * Fracao do ladder que carrega o golpe decisivo dele. Menor que 1 significa
   * que parte dos exemplares desse Pokemon nao tem como executar essa ameaca.
   */
  decisiveMoveOdds: number;
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

/** Acima disto consideramos que o Pokemon nao mata em tempo util de doubles. */
const HIT_CAP = 6;

/** Golpes necessarios para derrubar, dado o percentual de dano por golpe. */
function hitsToKO(pct: number): number {
  if (pct <= 0) return HIT_CAP;
  return Math.min(HIT_CAP, Math.ceil(1 / pct));
}

/**
 * Perigo de um confronto, medido pela troca de golpes e nao pelo dano bruto.
 *
 * A pergunta que decide um 1x1 e "quem cai primeiro", nao "quem bate mais
 * forte". Se eu ajo antes e derrubo em um golpe, o dano que o oponente teria
 * causado nunca acontece — ele pode ter o ataque mais forte do formato e ainda
 * assim nao ser ameaca nenhuma. O caso que expos isso: Garchomp com Rock Slide
 * derruba Charizard-Mega-Y de um golpe (Rock e 4x em Fogo/Voador) e ainda e
 * mais rapido, entao o Mega Y nao ameaca coisa alguma.
 *
 * Comparamos entao quantos golpes cada lado precisa, com meio ponto de
 * vantagem para quem age primeiro, e passamos a diferenca por uma sigmoide.
 *
 * As rolagens sao lidas pelo lado pessimista de proposito: o dano que EU sofro
 * usa a rolagem maxima e o dano que EU causo usa a minima. Uma lista de ameacas
 * deve errar para o lado do cuidado.
 */
function exchangeDanger(
  incomingMax: number,
  outgoingMin: number,
  theyActFirst: boolean,
  hasPriorityKO: boolean,
): { danger: number; theirHits: number; myHits: number } {
  const theirHits = hasPriorityKO ? 1 : hitsToKO(incomingMax);
  const myHits = hitsToKO(outgoingMin);

  // Quem age primeiro ganha meia troca: com o mesmo numero de golpes, decide.
  const initiative = theyActFirst || hasPriorityKO ? -0.75 : 0.75;
  const margin = theirHits - myHits + initiative;

  let danger = 1 / (1 + Math.exp(margin * 2.5));

  // Quem nao derruba em tempo util nao e ameaca, por mais lento que eu seja.
  if (theirHits >= HIT_CAP) danger = Math.min(danger, 0.25);

  return { danger, theirHits, myHits };
}

/**
 * Assinatura de um set para fins de cache. So o que muda o resultado entra.
 *
 * As odds dos golpes fazem parte: dois sets com o mesmo moveset mas usages
 * diferentes produzem perigos diferentes, e omiti-las aqui fazia um colidir
 * com o outro.
 */
function setSignature(set: ChampionsSet): string {
  const odds = set.moveOdds
    ? Object.entries(set.moveOdds)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v.toFixed(3)}`)
        .join(',')
    : '';
  return [
    set.species,
    set.item,
    set.ability,
    set.nature,
    set.sp.hp, set.sp.atk, set.sp.def, set.sp.spa, set.sp.spd, set.sp.spe,
    set.moves.join(','),
    odds,
  ].join('|');
}

const matchupCache = new Map<string, Matchup>();

/** Limpa o cache de confrontos. Chamar quando o recorte de meta mudar. */
export function clearMatchupCache(): void {
  matchupCache.clear();
}

/**
 * Avalia um confronto 1x1 entre o meu set e o set presumido de um oponente.
 *
 * O resultado e memorizado: o motor de sinergia reavalia o mesmo par muitas
 * vezes ao cruzar candidatos com ameacas, e trocar de aba refaz a tela inteira.
 */
export function evaluateMatchup(
  mine: ChampionsSet,
  opponent: ChampionsSet,
  meta: { id: string; name: string; usage: number; rank: number; provenance: SetProvenance },
  field: FieldOptions = {},
): Matchup {
  const key = `${setSignature(mine)}#${setSignature(opponent)}#${JSON.stringify(field)}`;
  const hit = matchupCache.get(key);
  // O usage muda entre chamadas sem mudar o confronto em si, entao ele e
  // reaplicado por cima do resultado memorizado.
  if (hit) return { ...hit, usage: meta.usage, rank: meta.rank, name: meta.name };

  const fresh = computeMatchup(mine, opponent, meta, field);
  // Teto para o cache nao crescer sem limite numa sessao longa.
  if (matchupCache.size > 20_000) matchupCache.clear();
  matchupCache.set(key, fresh);
  return fresh;
}

function computeMatchup(
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

  // Dano garantido que eu causo (rolagem minima) contra o dano maximo que sofro.
  const outgoingMin = outgoing ? outgoing.percent[0] : 0;

  // O golpe mais letal dele pode ser de nicho. Em vez de assumir que todo
  // exemplar carrega, pesamos dois cenarios pelo usage do golpe: ele tem, ou
  // ele fica com o melhor golpe que provavelmente tem.
  const ranked = rankedMovesAgainst(opponent, mine, field);
  const decisive = ranked[0] ?? null;
  const decisiveMoveOdds = decisive ? decisive.odds : 1;
  const fallback = ranked.slice(1).find((r) => r.odds >= 0.5) ?? ranked[1] ?? null;

  const comGolpe = exchangeDanger(incomingPct, outgoingMin, theyActFirst, Boolean(priorityKO));
  const semGolpe = fallback
    ? exchangeDanger(fallback.out.percent[1], outgoingMin, theyActFirst, false)
    : exchangeDanger(0, outgoingMin, theyActFirst, false);

  const p = Math.min(1, Math.max(0, decisiveMoveOdds));
  const danger = comGolpe.danger * p + semGolpe.danger * (1 - p);
  const theirHits = comGolpe.theirHits;
  const myHits = comGolpe.myHits;

  const reasons: string[] = [];
  if (priorityKO) {
    reasons.push(`Mata com ${priorityKO.move} (prioridade) — velocidade nao te salva.`);
  }
  if (incoming) {
    if (incomingPct >= 1) {
      reasons.push(`OHKO com ${incoming.move} (${pct(incoming.percent[0])}–${pct(incomingPct)}).`);
    } else if (theirHits < HIT_CAP) {
      reasons.push(
        `${incoming.move} tira ${pct(incoming.percent[0])}–${pct(incomingPct)}: derruba em ${theirHits}.`,
      );
    } else {
      reasons.push(`Nao te derruba em tempo util: ${incoming.move} so tira ${pct(incomingPct)}.`);
    }
  } else {
    reasons.push('Nao tem golpe de ataque relevante contra voce.');
  }

  if (decisive && decisiveMoveOdds < 0.85 && incomingPct >= 0.5) {
    reasons.push(
      `Mas so ${pct(decisiveMoveOdds)} dos ${meta.name} carregam ${decisive.out.move}` +
        (fallback ? `; sem ele o melhor e ${fallback.out.move} (${pct(fallback.out.percent[1])}).` : '.'),
    );
  }

  if (outgoing) {
    if (outgoingMin >= 1) {
      reasons.push(`Voce derruba de um golpe com ${outgoing.move}.`);
    } else if (myHits < HIT_CAP) {
      reasons.push(`Voce derruba em ${myHits} com ${outgoing.move} (${pct(outgoingMin)}–${pct(outgoingPct)}).`);
    } else {
      reasons.push(`Voce nao derruba em tempo util: ${outgoing.move} so tira ${pct(outgoingPct)}.`);
    }
  } else {
    reasons.push('Voce nao tem golpe de ataque neste set — sem isso o confronto nao da para julgar.');
  }

  if (!priorityKO) {
    const quem = theyActFirst ? 'Ele age primeiro' : 'Voce age primeiro';
    reasons.push(`${quem} (${mySpeed} contra ${theirSpeed} de Speed).`);
  }

  // A frase que fecha o raciocinio: quem ganha a troca e por que.
  if (myHits < theirHits || (myHits === theirHits && !theyActFirst && !priorityKO)) {
    reasons.push(`Resultado: voce vence a troca (${myHits} golpe(s) contra ${theirHits} dele).`);
  } else if (theirHits < myHits || theyActFirst || priorityKO) {
    reasons.push(`Resultado: ele vence a troca (${theirHits} golpe(s) contra ${myHits} seus).`);
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
    decisiveMoveOdds,
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
  /**
   * Recebe a lista parcial ja ordenada durante o calculo.
   *
   * Como os Pokemon sao avaliados na ordem de usage, os primeiros resultados
   * ja sao os que mais importam. Entregar em lotes deixa a tela util em
   * fracao do tempo, em vez de ficar em branco ate o fim.
   */
  onPartial?: (parcial: Matchup[]) => void;
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
      opts.onPartial?.([...out].sort((a, b) => b.weighted - a.weighted));
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
