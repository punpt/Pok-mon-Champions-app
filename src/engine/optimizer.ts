/**
 * Otimizador de Stat Points.
 *
 * Voce diz o que precisa aguentar, o que precisa matar e quem precisa superar
 * em Speed; ele devolve a menor distribuicao de SP que cumpre tudo, e joga o
 * que sobrar onde voce mandar. O objetivo e nao gastar um ponto a mais de bulk
 * do que o benchmark exige.
 *
 * O truque que torna isso rapido o bastante para rodar no celular: dano so
 * depende do stat defensivo, e sobreviver so depende do HP. Entao, em vez de
 * chamar o calculo para cada combinacao de (HP, Def, SpD) — mais de 35 mil —
 * pre-computamos a curva de dano para os 33 valores possiveis de cada stat
 * defensivo e depois resolvemos a alocacao em aritmetica pura.
 */

import type { ChampionsSet } from '../data/set';
import { battleSpecies } from '../data/set';
import {
  championsStat,
  makeSpread,
  natureModifier,
  SP_MAX_PER_STAT,
  SP_TOTAL,
  STAT_IDS,
  STAT_LABEL,
  type SpSpread,
  type StatID,
} from '../data/stats';
import { baseStatsOf, getMove, natureByName, NATURES } from '../data/dex';
import { calcDamage, effectiveSpeed, type FieldOptions, type SpeedContext } from './calc';

export type SurviveStrictness = 'sempre' | 'quase-sempre';

export interface SurviveBenchmark {
  kind: 'sobreviver';
  id: string;
  /** Set do atacante (normalmente o set presumido de uma ameaca do meta). */
  attacker: ChampionsSet;
  move: string;
  attackerBoosts?: Partial<Record<StatID, number>>;
  /** "sempre" = nem a rolagem maxima mata. "quase-sempre" = no maximo 1 de 16 mata. */
  strictness: SurviveStrictness;
  field?: FieldOptions;
}

export interface KoBenchmark {
  kind: 'matar';
  id: string;
  defender: ChampionsSet;
  move: string;
  /** 1 = OHKO, 2 = 2HKO. */
  hits: number;
  /** "sempre" = a rolagem minima ja mata. */
  strictness: SurviveStrictness;
  field?: FieldOptions;
}

export interface SpeedBenchmark {
  kind: 'velocidade';
  id: string;
  target: ChampionsSet;
  /** Superar, empatar ou ficar logo abaixo (para Trick Room). */
  mode: 'superar' | 'empatar' | 'ficar-abaixo';
  ctx?: SpeedContext;
  myCtx?: SpeedContext;
}

export type Benchmark = SurviveBenchmark | KoBenchmark | SpeedBenchmark;

export type LeftoverPolicy = 'bulk' | 'ofensivo' | 'velocidade' | StatID;

export interface OptimizeRequest {
  set: ChampionsSet;
  benchmarks: Benchmark[];
  leftover: LeftoverPolicy;
  /** Deixa o otimizador testar outras natures em busca de um spread mais barato. */
  searchNature?: boolean;
  /** SP que voce quer reservar manualmente (fica fora da otimizacao). */
  locked?: Partial<SpSpread>;
}

export interface BenchmarkResult {
  id: string;
  label: string;
  satisfied: boolean;
  /** Custo em SP atribuido a este benchmark. */
  detail: string;
}

export interface OptimizeResult {
  ok: boolean;
  spread: SpSpread;
  nature: string;
  used: number;
  remaining: number;
  results: BenchmarkResult[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Curvas pre-computadas
// ---------------------------------------------------------------------------

/** Para cada valor de SP no stat defensivo, a maior rolagem de dano recebida. */
interface DamageCurve {
  /** damage[sp] = maior rolagem (ou a segunda maior, se strictness afrouxa). */
  worst: number[];
  defStat: 'def' | 'spd';
  moveName: string;
  attackerName: string;
}

function defensiveStatFor(moveName: string): 'def' | 'spd' | null {
  const move = getMove(moveName);
  if (!move || move.category === 'Status') return null;
  // Body Press e afins usam Def do atacante, mas o lado defensivo segue a categoria.
  return move.category === 'Physical' ? 'def' : 'spd';
}

/**
 * Calcula, para cada nivel de investimento no stat defensivo, quanto dano o
 * golpe causa. O HP e mantido fixo porque nao altera o dano — so o limiar.
 */
function buildDamageCurve(
  bench: SurviveBenchmark,
  defenderSet: ChampionsSet,
  nature: string,
): DamageCurve | null {
  const defStat = defensiveStatFor(bench.move);
  if (!defStat) return null;

  const worst: number[] = [];
  for (let sp = 0; sp <= SP_MAX_PER_STAT; sp++) {
    const probe: ChampionsSet = {
      ...defenderSet,
      nature,
      sp: { ...defenderSet.sp, [defStat]: sp },
    };
    const out = calcDamage({
      attacker: bench.attacker,
      defender: probe,
      move: bench.move,
      attackerBoosts: bench.attackerBoosts,
      field: bench.field,
    });
    if (!out || !out.rolls.length) {
      worst.push(0);
      continue;
    }
    const sorted = [...out.rolls].sort((a, b) => b - a);
    // "quase sempre" tolera a pior rolagem entre 16; "sempre" nao tolera nenhuma.
    worst.push(bench.strictness === 'sempre' ? sorted[0] : sorted[1] ?? sorted[0]);
  }
  return { worst, defStat, moveName: bench.move, attackerName: bench.attacker.species };
}

/** Menor SP ofensivo que cumpre o KO pedido, ou null se nao der. */
function solveKo(bench: KoBenchmark, set: ChampionsSet, nature: string): { sp: number; stat: StatID } | null {
  const move = getMove(bench.move);
  if (!move || move.category === 'Status') return null;
  const stat: StatID = move.category === 'Physical' ? 'atk' : 'spa';

  for (let sp = 0; sp <= SP_MAX_PER_STAT; sp++) {
    const probe: ChampionsSet = { ...set, nature, sp: { ...set.sp, [stat]: sp } };
    const out = calcDamage({
      attacker: probe,
      defender: bench.defender,
      move: bench.move,
      field: bench.field,
    });
    if (!out || !out.rolls.length) continue;
    const sorted = [...out.rolls].sort((a, b) => a - b);
    const reference = bench.strictness === 'sempre' ? sorted[0] : sorted[1] ?? sorted[0];
    if (reference * bench.hits >= out.defenderMaxHp) return { sp, stat };
  }
  return null;
}

/** Menor SP de Speed que cumpre o benchmark de velocidade. */
function solveSpeed(
  bench: SpeedBenchmark,
  set: ChampionsSet,
  nature: string,
): { sp: number; targetSpeed: number } | null {
  const targetSpeed = effectiveSpeed(bench.target, bench.ctx);

  for (let sp = 0; sp <= SP_MAX_PER_STAT; sp++) {
    const probe: ChampionsSet = { ...set, nature, sp: { ...set.sp, spe: sp } };
    const mine = effectiveSpeed(probe, bench.myCtx);
    if (bench.mode === 'superar' && mine > targetSpeed) return { sp, targetSpeed };
    if (bench.mode === 'empatar' && mine >= targetSpeed) return { sp, targetSpeed };
    if (bench.mode === 'ficar-abaixo') {
      // Trick Room: quanto mais lento melhor, entao 0 SP ja resolve.
      if (mine < targetSpeed) return { sp: 0, targetSpeed };
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Alocacao
// ---------------------------------------------------------------------------

interface Allocation {
  hp: number;
  def: number;
  spd: number;
  cost: number;
}

/**
 * Menor combinacao de (HP, Def, SpD) que satisfaz todas as curvas de dano.
 *
 * Com as curvas ja em memoria isto e so aritmetica: percorremos os valores de
 * HP e, para cada um, o menor Def e o menor SpD que aguentam. HP e compartilhado
 * entre os dois lados, e e justamente por isso que resolver defesa fisica e
 * especial separadamente desperdica pontos.
 */
function solveBulk(
  curves: DamageCurve[],
  baseHp: number,
  budget: number,
  hpFloor: number,
  defFloor: number,
  spdFloor: number,
): Allocation | null {
  const physical = curves.filter((c) => c.defStat === 'def');
  const special = curves.filter((c) => c.defStat === 'spd');

  let best: Allocation | null = null;

  for (let hp = hpFloor; hp <= SP_MAX_PER_STAT; hp++) {
    const maxHp = championsStat(baseHp, hp, 'hp', 1);

    const def = minInvestment(physical, maxHp, defFloor);
    if (def === null) continue;
    const spd = minInvestment(special, maxHp, spdFloor);
    if (spd === null) continue;

    const cost = hp + def + spd;
    if (cost > budget) continue;
    if (!best || cost < best.cost) best = { hp, def, spd, cost };
    // Aumentar HP so encarece a partir daqui se ja nao precisa de defesa.
    if (def === defFloor && spd === spdFloor) break;
  }

  return best;
}

function minInvestment(curves: DamageCurve[], maxHp: number, floor: number): number | null {
  if (!curves.length) return floor;
  let need = floor;
  for (const curve of curves) {
    let found: number | null = null;
    for (let sp = need; sp <= SP_MAX_PER_STAT; sp++) {
      if (curve.worst[sp] < maxHp) {
        found = sp;
        break;
      }
    }
    if (found === null) return null;
    need = Math.max(need, found);
  }
  return need;
}

function distributeLeftover(spread: SpSpread, leftover: number, policy: LeftoverPolicy, set: ChampionsSet): SpSpread {
  const out = { ...spread };
  let remaining = leftover;
  const species = battleSpecies(set);
  const bs = species ? baseStatsOf(species) : null;

  const order: StatID[] = (() => {
    if (STAT_IDS.includes(policy as StatID)) return [policy as StatID];
    if (policy === 'velocidade') return ['spe', 'hp', 'def', 'spd'];
    if (policy === 'ofensivo') {
      const off: StatID = !bs || bs.atk >= bs.spa ? 'atk' : 'spa';
      return [off, 'spe', 'hp'];
    }
    return ['hp', 'def', 'spd'];
  })();

  // Distribui em rodadas para nao estourar o teto de um stat so.
  while (remaining > 0) {
    let placed = false;
    for (const id of order) {
      if (remaining <= 0) break;
      if (out[id] >= SP_MAX_PER_STAT) continue;
      out[id] += 1;
      remaining -= 1;
      placed = true;
    }
    if (!placed) break;
  }
  return out;
}

/** Natures candidatas quando o otimizador tem liberdade de trocar. */
function candidateNatures(set: ChampionsSet): string[] {
  const species = battleSpecies(set);
  if (!species) return [set.nature];
  const bs = baseStatsOf(species);
  const physical = bs.atk >= bs.spa;
  const useful = physical
    ? ['Adamant', 'Jolly', 'Careful', 'Impish', 'Brave']
    : ['Modest', 'Timid', 'Calm', 'Bold', 'Quiet'];
  const all = [set.nature, ...useful, 'Serious'];
  return [...new Set(all)].filter((n) => NATURES.some((x) => x.name === n));
}

export function optimize(req: OptimizeRequest): OptimizeResult {
  const warnings: string[] = [];
  const species = battleSpecies(req.set);
  if (!species) {
    return {
      ok: false,
      spread: makeSpread(),
      nature: req.set.nature,
      used: 0,
      remaining: SP_TOTAL,
      results: [],
      warnings: ['Escolha um Pokemon antes de otimizar.'],
    };
  }

  const bs = baseStatsOf(species);
  const locked = { ...makeSpread(), ...(req.locked ?? {}) };
  const lockedTotal = STAT_IDS.reduce((s, id) => s + locked[id], 0);
  if (lockedTotal > SP_TOTAL) {
    warnings.push('Os SP travados ja passam do total disponivel.');
  }

  const natures = req.searchNature ? candidateNatures(req.set) : [req.set.nature || 'Serious'];

  let best: { result: OptimizeResult; cost: number } | null = null;

  for (const nature of natures) {
    const working: ChampionsSet = { ...req.set, nature, sp: makeSpread() };
    const results: BenchmarkResult[] = [];
    const spread = makeSpread();
    for (const id of STAT_IDS) spread[id] = locked[id];

    let feasible = true;

    // 1. Velocidade e KO sao independentes entre si e do bulk.
    for (const bench of req.benchmarks) {
      if (bench.kind === 'velocidade') {
        const solved = solveSpeed(bench, working, nature);
        if (!solved) {
          feasible = false;
          results.push({
            id: bench.id,
            label: speedLabel(bench),
            satisfied: false,
            detail: `Inalcancavel: nem com 32 SP e nature de Speed voce chega la.`,
          });
          continue;
        }
        spread.spe = Math.max(spread.spe, solved.sp);
        results.push({
          id: bench.id,
          label: speedLabel(bench),
          satisfied: true,
          detail: `${solved.sp} SP em Speed (alvo esta em ${solved.targetSpeed}).`,
        });
      } else if (bench.kind === 'matar') {
        const solved = solveKo(bench, working, nature);
        if (!solved) {
          feasible = false;
          results.push({
            id: bench.id,
            label: koLabel(bench),
            satisfied: false,
            detail: 'Inalcancavel: nem com investimento maximo este golpe mata.',
          });
          continue;
        }
        spread[solved.stat] = Math.max(spread[solved.stat], solved.sp);
        results.push({
          id: bench.id,
          label: koLabel(bench),
          satisfied: true,
          detail: `${solved.sp} SP em ${STAT_LABEL[solved.stat]}.`,
        });
      }
    }

    // 2. Bulk resolvido em conjunto, porque HP e compartilhado.
    const surviveBenches = req.benchmarks.filter((b): b is SurviveBenchmark => b.kind === 'sobreviver');
    if (surviveBenches.length) {
      const curves = surviveBenches
        .map((b) => ({ bench: b, curve: buildDamageCurve(b, { ...working, sp: spread }, nature) }))
        .filter((c): c is { bench: SurviveBenchmark; curve: DamageCurve } => c.curve !== null);

      const spent = spread.atk + spread.spa + spread.spe;
      const budget = SP_TOTAL - spent;
      const alloc = solveBulk(
        curves.map((c) => c.curve),
        bs.hp,
        budget,
        locked.hp,
        locked.def,
        locked.spd,
      );

      if (!alloc) {
        feasible = false;
        for (const c of curves) {
          results.push({
            id: c.bench.id,
            label: surviveLabel(c.bench),
            satisfied: false,
            detail: 'Nao da para sobreviver a isto dentro dos 66 SP com este set.',
          });
        }
      } else {
        spread.hp = alloc.hp;
        spread.def = alloc.def;
        spread.spd = alloc.spd;
        for (const c of curves) {
          const invested = c.curve.defStat === 'def' ? alloc.def : alloc.spd;
          results.push({
            id: c.bench.id,
            label: surviveLabel(c.bench),
            satisfied: true,
            detail: `${alloc.hp} SP em HP + ${invested} SP em ${STAT_LABEL[c.curve.defStat]}.`,
          });
        }
      }
    }

    const used = STAT_IDS.reduce((s, id) => s + spread[id], 0);
    if (used > SP_TOTAL) {
      feasible = false;
      warnings.push(`Os benchmarks juntos pedem ${used} SP, mas voce so tem ${SP_TOTAL}.`);
    }

    const finalSpread = feasible
      ? distributeLeftover(spread, Math.max(0, SP_TOTAL - used), req.leftover, req.set)
      : spread;
    const finalUsed = STAT_IDS.reduce((s, id) => s + finalSpread[id], 0);

    const result: OptimizeResult = {
      ok: feasible,
      spread: finalSpread,
      nature,
      used: finalUsed,
      remaining: SP_TOTAL - finalUsed,
      results,
      warnings: [...warnings],
    };

    // Preferimos o spread viavel mais barato antes de distribuir a sobra.
    if (feasible && (!best || used < best.cost)) best = { result, cost: used };
    if (!best) best = { result, cost: Number.MAX_SAFE_INTEGER };
  }

  const chosen = best!.result;
  if (!chosen.ok && !chosen.warnings.length) {
    chosen.warnings.push('Algum benchmark nao cabe. Afrouxe para "quase sempre" ou troque de item.');
  }
  return chosen;
}

function surviveLabel(b: SurviveBenchmark): string {
  const boost = b.attackerBoosts?.atk || b.attackerBoosts?.spa;
  const boostText = boost ? ` ${boost > 0 ? '+' : ''}${boost}` : '';
  return `Sobreviver a ${b.move}${boostText} de ${b.attacker.species}`;
}

function koLabel(b: KoBenchmark): string {
  return `${b.hits === 1 ? 'OHKO' : `${b.hits}HKO`} em ${b.defender.species} com ${b.move}`;
}

function speedLabel(b: SpeedBenchmark): string {
  const verb = b.mode === 'superar' ? 'Superar' : b.mode === 'empatar' ? 'Empatar com' : 'Ficar abaixo de';
  return `${verb} ${b.target.species}`;
}

/** Ajuda a interface a mostrar quanto cada ponto de SP rende no stat. */
export function statPreview(set: ChampionsSet, stat: StatID): number[] {
  const species = battleSpecies(set);
  if (!species) return [];
  const bs = baseStatsOf(species);
  const nat = natureByName(set.nature);
  const mod = natureModifier(nat.plus, nat.minus, stat);
  return Array.from({ length: SP_MAX_PER_STAT + 1 }, (_, sp) => championsStat(bs[stat], sp, stat, mod));
}
