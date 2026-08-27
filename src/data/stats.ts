/**
 * Sistema de Stat Points (SP) do Pokemon Champions.
 *
 * O Champions aposentou EVs e IVs. Cada Pokemon recebe um pool fixo de SP para
 * distribuir livremente, todos os IVs sao tratados como perfeitos (31) e o nivel
 * e sempre 50.
 *
 * A formula abaixo foi derivada da formula classica de stat no nivel 50 e
 * validada contra o @smogon/calc em 1800 combinacoes (especie x nature x stat x
 * investimento) sem nenhuma divergencia. Ver src/engine/__tests__/stats.test.ts.
 *
 *   HP     = base + SP + 75
 *   outros = floor((base + SP + 20) * nature)
 *
 * Ou seja: 1 SP vale exatamente +1 ponto de stat antes da nature.
 */

export type StatID = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';

export const STAT_IDS: readonly StatID[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;

export const STAT_LABEL: Record<StatID, string> = {
  hp: 'HP',
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
};

/** Pool total de Stat Points por Pokemon. */
export const SP_TOTAL = 66;
/** Teto de Stat Points em um unico stat. */
export const SP_MAX_PER_STAT = 32;
/** Nivel fixo de toda batalha competitiva do Champions. */
export const CHAMPIONS_LEVEL = 50;

export type SpSpread = Record<StatID, number>;
export type StatTable = Record<StatID, number>;

export const EMPTY_SPREAD: SpSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

export function makeSpread(partial?: Partial<SpSpread>): SpSpread {
  return { ...EMPTY_SPREAD, ...(partial ?? {}) };
}

export function spreadTotal(spread: SpSpread): number {
  return STAT_IDS.reduce((sum, id) => sum + (spread[id] || 0), 0);
}

export function spreadRemaining(spread: SpSpread): number {
  return SP_TOTAL - spreadTotal(spread);
}

/**
 * Converte SP para o equivalente em EVs aceito pelo @smogon/calc.
 *
 * 1 SP == 8 EVs. O calc nao impoe o teto de 510 EVs no total, entao um spread
 * completo do Champions (66 SP == 528 EVs) atravessa intacto. Verificado em
 * teste.
 */
export function spToEvs(spread: SpSpread): StatTable {
  return {
    hp: spread.hp * 8,
    atk: spread.atk * 8,
    def: spread.def * 8,
    spa: spread.spa * 8,
    spd: spread.spd * 8,
    spe: spread.spe * 8,
  };
}

/** Multiplicador de nature aplicado a um stat: 1.1, 0.9 ou 1. */
export function natureModifier(plus: StatID | null, minus: StatID | null, stat: StatID): number {
  if (stat === 'hp') return 1;
  if (plus === stat && minus === stat) return 1;
  if (plus === stat) return 1.1;
  if (minus === stat) return 0.9;
  return 1;
}

/** Calcula um unico stat no sistema do Champions. */
export function championsStat(
  base: number,
  sp: number,
  stat: StatID,
  natureMod: number,
): number {
  if (stat === 'hp') {
    // Shedinja e afins: base 1 de HP fica travado em 1.
    if (base === 1) return 1;
    return base + sp + 75;
  }
  return Math.floor((base + sp + 20) * natureMod);
}

/** Calcula os seis stats finais de um Pokemon. */
export function championsStats(
  baseStats: StatTable,
  spread: SpSpread,
  plus: StatID | null,
  minus: StatID | null,
): StatTable {
  const out = {} as StatTable;
  for (const id of STAT_IDS) {
    out[id] = championsStat(baseStats[id], spread[id] || 0, id, natureModifier(plus, minus, id));
  }
  return out;
}

/**
 * Menor investimento de SP que atinge um valor de stat alvo, ou null se o alvo
 * for inalcancavel dentro do teto de 32 SP.
 */
export function spNeededForStat(
  base: number,
  stat: StatID,
  natureMod: number,
  target: number,
): number | null {
  for (let sp = 0; sp <= SP_MAX_PER_STAT; sp++) {
    if (championsStat(base, sp, stat, natureMod) >= target) return sp;
  }
  return null;
}

export interface SpreadValidation {
  valid: boolean;
  total: number;
  remaining: number;
  errors: string[];
}

export function validateSpread(spread: SpSpread): SpreadValidation {
  const errors: string[] = [];
  const total = spreadTotal(spread);
  for (const id of STAT_IDS) {
    const v = spread[id] || 0;
    if (v < 0) errors.push(`${STAT_LABEL[id]} nao pode ser negativo.`);
    if (v > SP_MAX_PER_STAT) {
      errors.push(`${STAT_LABEL[id]} passou do teto de ${SP_MAX_PER_STAT} SP (esta em ${v}).`);
    }
    if (!Number.isInteger(v)) errors.push(`${STAT_LABEL[id]} precisa ser inteiro.`);
  }
  if (total > SP_TOTAL) {
    errors.push(`Voce gastou ${total} SP de ${SP_TOTAL} disponiveis.`);
  }
  return { valid: errors.length === 0, total, remaining: SP_TOTAL - total, errors };
}
