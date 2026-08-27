/**
 * Motor de dano.
 *
 * Envolve o @smogon/calc traduzindo o sistema do Champions:
 *   - Stat Points viram EVs na proporcao 1 SP = 8 EVs (o calc nao impoe o teto
 *     de 510, entao um spread completo de 66 SP passa intacto);
 *   - a forma de batalha e resolvida a partir da Mega Stone antes de montar o
 *     Pokemon, porque o calc nao mega-evolui pelo item;
 *   - o campo e sempre Doubles, entao spread moves ja saem com o corte de 25%.
 */

import { calculate, Field, Generations, Move, Pokemon, type Side } from '@smogon/calc';
import type { ChampionsSet } from '../data/set';
import { battleAbility, battleSpecies } from '../data/set';
import { spToEvs, type StatID } from '../data/stats';
import { getMove, getSpecies, normalizeId } from '../data/dex';

const gen = Generations.get(9);

export interface FieldOptions {
  weather?: 'Sun' | 'Rain' | 'Sand' | 'Snow' | null;
  terrain?: 'Electric' | 'Grassy' | 'Misty' | 'Psychic' | null;
  attackerTailwind?: boolean;
  defenderTailwind?: boolean;
  reflect?: boolean;
  lightScreen?: boolean;
  helpingHand?: boolean;
  /** Numero de aliados caidos, para Supreme Overlord do Kingambit. */
  alliesFainted?: number;
  isCritical?: boolean;
}

export interface CalcInput {
  attacker: ChampionsSet;
  defender: ChampionsSet;
  move: string;
  attackerBoosts?: Partial<Record<StatID, number>>;
  defenderBoosts?: Partial<Record<StatID, number>>;
  field?: FieldOptions;
}

export interface CalcOutput {
  move: string;
  /** Menor e maior rolagem em pontos de HP. */
  damage: [number, number];
  /** As 16 rolagens de dano, para medir "sobrevive quantos por cento das vezes". */
  rolls: number[];
  /** Menor e maior rolagem como fracao do HP maximo (0 a 1+). */
  percent: [number, number];
  defenderMaxHp: number;
  /** n = 1 significa OHKO; 0 significa que nao mata. */
  koHits: number;
  koText: string;
  /** Chance de matar em n golpes, de 0 a 1, quando o calc informa. */
  koChance: number;
  desc: string;
  /** Multiplicador de tipo do golpe contra o defensor. */
  effectiveness: number;
}

function toSide(opts: FieldOptions, side: 'attacker' | 'defender'): Partial<Side> {
  return {
    isTailwind: side === 'attacker' ? Boolean(opts.attackerTailwind) : Boolean(opts.defenderTailwind),
    isReflect: side === 'defender' ? Boolean(opts.reflect) : false,
    isLightScreen: side === 'defender' ? Boolean(opts.lightScreen) : false,
    isHelpingHand: side === 'attacker' ? Boolean(opts.helpingHand) : false,
  };
}

export function buildField(opts: FieldOptions = {}): Field {
  return new Field({
    gameType: 'Doubles',
    weather: opts.weather ?? undefined,
    terrain: opts.terrain ?? undefined,
    attackerSide: toSide(opts, 'attacker'),
    defenderSide: toSide(opts, 'defender'),
  });
}

/** Converte um set do builder em um Pokemon do @smogon/calc. */
export function toCalcPokemon(
  set: ChampionsSet,
  boosts?: Partial<Record<StatID, number>>,
  opts: FieldOptions = {},
): Pokemon | null {
  const species = battleSpecies(set);
  if (!species) return null;

  return new Pokemon(gen, species.name, {
    level: 50,
    nature: set.nature || 'Serious',
    evs: spToEvs(set.sp),
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    item: set.item || undefined,
    ability: battleAbility(set) || undefined,
    boosts: boosts as Record<string, number> | undefined,
    alliesFainted: opts.alliesFainted ?? 0,
  });
}

export function calcDamage(input: CalcInput): CalcOutput | null {
  const atk = toCalcPokemon(input.attacker, input.attackerBoosts, input.field);
  const def = toCalcPokemon(input.defender, input.defenderBoosts, input.field);
  const moveData = getMove(input.move);
  if (!atk || !def || !moveData) return null;

  const move = new Move(gen, moveData.name, {
    isCrit: input.field?.isCritical ?? false,
  });

  let result;
  try {
    result = calculate(gen, atk, def, move, buildField(input.field));
  } catch {
    // Alguns golpes de mecanica exotica quebram o calc; tratamos como 0 de dano.
    return null;
  }

  const maxHp = def.maxHP();
  const rolls = flattenRolls(result.damage);
  const range = normalizeRange(result.damage);
  // kochance() do @smogon/calc lanca excecao quando o dano e zero (imunidade,
  // golpe sem efeito). Zero de dano e uma resposta legitima aqui, nao um erro.
  const ko = range[1] > 0 ? safeKoChance(result) : { n: 0, text: 'nao causa dano' };

  return {
    move: moveData.name,
    damage: range,
    rolls,
    percent: [range[0] / maxHp, range[1] / maxHp],
    defenderMaxHp: maxHp,
    koHits: typeof ko.n === 'number' ? ko.n : 0,
    koText: ko.text ?? '',
    koChance: parseKoChance(ko.text ?? '', ko.n),
    desc: safeDesc(result),
    effectiveness: typeEffectivenessOfMove(moveData.name, def),
  };
}

function safeKoChance(result: { kochance(): { n?: number; text?: string } }): { n?: number; text?: string } {
  try {
    return result.kochance();
  } catch {
    return { n: 0, text: '' };
  }
}

function safeDesc(result: { desc(): string }): string {
  try {
    return result.desc();
  } catch {
    return '';
  }
}

/**
 * As 16 rolagens individuais. Golpes de multiplos hits vem como matriz; nesse
 * caso somamos por golpe para obter o dano total de cada rolagem.
 */
function flattenRolls(damage: unknown): number[] {
  if (typeof damage === 'number') return [damage];
  if (!Array.isArray(damage)) return [];
  if (damage.every((d) => typeof d === 'number')) return damage as number[];
  const hits = (damage as unknown[][]).filter(Array.isArray) as number[][];
  if (!hits.length) return [];
  const len = Math.min(...hits.map((h) => h.length));
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    out.push(hits.reduce((sum, h) => sum + (h[i] ?? 0), 0));
  }
  return out;
}

function normalizeRange(damage: unknown): [number, number] {
  if (typeof damage === 'number') return [damage, damage];
  if (Array.isArray(damage)) {
    const flat = damage.flat(2).filter((n): n is number => typeof n === 'number');
    if (!flat.length) return [0, 0];
    return [Math.min(...flat), Math.max(...flat)];
  }
  return [0, 0];
}

/**
 * kochance() devolve texto como "87.5% chance to 2HKO" ou "guaranteed OHKO".
 * Extraimos a probabilidade para poder ordenar ameacas numericamente.
 */
function parseKoChance(text: string, n: number | undefined): number {
  if (!text) return 0;
  if (/guaranteed/i.test(text)) return 1;
  const m = /([\d.]+)%\s*chance/i.exec(text);
  if (m) return Math.min(1, Number(m[1]) / 100);
  if (/possible/i.test(text)) return 0.05;
  return n === 1 ? 1 : 0;
}

function typeEffectivenessOfMove(moveName: string, def: Pokemon): number {
  const move = getMove(moveName);
  if (!move || move.category === 'Status') return 1;
  let mult = 1;
  for (const t of def.types) {
    const chart = gen.types.get(t as never);
    if (!chart) continue;
    const taken = (chart as unknown as { damageTaken: Record<string, number> }).damageTaken[move.type];
    if (taken === 1) mult *= 2;
    else if (taken === 2) mult *= 0.5;
    else if (taken === 3) return 0;
  }
  return mult;
}

/** Melhor golpe do atacante contra o defensor, medido pelo dano maximo. */
export function bestMoveAgainst(
  attacker: ChampionsSet,
  defender: ChampionsSet,
  field?: FieldOptions,
  boosts?: Partial<Record<StatID, number>>,
): CalcOutput | null {
  let best: CalcOutput | null = null;
  for (const moveName of attacker.moves) {
    const move = getMove(moveName);
    if (!move || move.category === 'Status') continue;
    const out = calcDamage({ attacker, defender, move: moveName, field, attackerBoosts: boosts });
    if (!out) continue;
    if (!best || out.percent[1] > best.percent[1]) best = out;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Velocidade
// ---------------------------------------------------------------------------

const SPEED_ABILITIES: Record<string, { weather?: string; multiplier: number }> = {
  swiftswim: { weather: 'Rain', multiplier: 2 },
  chlorophyll: { weather: 'Sun', multiplier: 2 },
  sandrush: { weather: 'Sand', multiplier: 2 },
  slushrush: { weather: 'Snow', multiplier: 2 },
  unburden: { multiplier: 2 },
  quickfeet: { multiplier: 1.5 },
};

export interface SpeedContext extends FieldOptions {
  boost?: number;
  /** Unburden ja ativou (item consumido). */
  unburdenActive?: boolean;
  trickRoom?: boolean;
}

/** Velocidade efetiva em campo, considerando item, ability, boosts e Tailwind. */
export function effectiveSpeed(set: ChampionsSet, ctx: SpeedContext = {}): number {
  const p = toCalcPokemon(set);
  if (!p) return 0;

  let speed = p.rawStats.spe;

  const boost = ctx.boost ?? 0;
  if (boost > 0) speed = Math.floor((speed * (2 + boost)) / 2);
  else if (boost < 0) speed = Math.floor((speed * 2) / (2 - boost));

  const abilityId = normalizeId(battleAbility(set));
  const rule = SPEED_ABILITIES[abilityId];
  if (rule) {
    const weatherOk = !rule.weather || ctx.weather === rule.weather;
    const unburdenOk = abilityId !== 'unburden' || ctx.unburdenActive;
    if (weatherOk && unburdenOk) speed = Math.floor(speed * rule.multiplier);
  }

  const itemId = normalizeId(set.item);
  if (itemId === 'choicescarf') speed = Math.floor(speed * 1.5);
  else if (itemId === 'ironball' || itemId === 'machobrace') speed = Math.floor(speed * 0.5);

  if (ctx.attackerTailwind) speed = Math.floor(speed * 2);

  return speed;
}

/**
 * Quem age primeiro. Considera prioridade do golpe e Trick Room, que e o que
 * faz o caso "sou mais rapido mas morro assim mesmo" existir.
 */
export function movesFirst(
  a: { set: ChampionsSet; move?: string; ctx?: SpeedContext },
  b: { set: ChampionsSet; move?: string; ctx?: SpeedContext },
  trickRoom = false,
): 'a' | 'b' | 'tie' {
  const pa = a.move ? getMove(a.move)?.priority ?? 0 : 0;
  const pb = b.move ? getMove(b.move)?.priority ?? 0 : 0;
  if (pa !== pb) return pa > pb ? 'a' : 'b';

  const sa = effectiveSpeed(a.set, a.ctx);
  const sb = effectiveSpeed(b.set, b.ctx);
  if (sa === sb) return 'tie';
  const faster = sa > sb ? 'a' : 'b';
  if (!trickRoom) return faster;
  return faster === 'a' ? 'b' : 'a';
}

export function speciesExists(id: string): boolean {
  return Boolean(getSpecies(id));
}
