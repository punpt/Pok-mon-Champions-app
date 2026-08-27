/**
 * Normalizacao tolerante de payloads externos.
 *
 * A API publica de battle data nao tem contrato versionado e nomes de campo
 * variam entre rotas ("usage" / "percent" / "pct", "moves" / "movesets" /
 * "top_moves"). Em vez de fixar um formato e quebrar no primeiro dia em que ele
 * mudar, aceitamos um conjunto de formas conhecidas e registramos um aviso
 * quando algo nao encaixa, para o painel de diagnostico mostrar.
 */

import { makeSpread, SP_MAX_PER_STAT, SP_TOTAL, type SpSpread, type StatID, STAT_IDS } from '../data/stats';
import type { MetaSpread, WeightedName } from './types';

export type Json = Record<string, unknown>;

export function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Primeiro valor nao vazio entre varias chaves candidatas (case-insensitive). */
export function pick(obj: unknown, keys: string[]): unknown {
  if (!isObject(obj)) return undefined;
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) lower.set(k.toLowerCase().replace(/[_\-\s]/g, ''), v);
  for (const key of keys) {
    const v = lower.get(key.toLowerCase().replace(/[_\-\s]/g, ''));
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

export function pickString(obj: unknown, keys: string[]): string | null {
  const v = pick(obj, keys);
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null;
}

export function pickNumber(obj: unknown, keys: string[]): number | null {
  const v = pick(obj, keys);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace('%', '').trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Converte porcentagens para fracao de 0 a 1.
 * Se qualquer valor da lista passa de 1.5, assumimos escala 0-100.
 */
function rescale(pairs: { name: string; usage: number }[]): WeightedName[] {
  const max = pairs.reduce((m, p) => Math.max(m, p.usage), 0);
  const div = max > 1.5 ? 100 : 1;
  return pairs
    .map((p) => ({ name: p.name, usage: clamp01(p.usage / div) }))
    .filter((p) => p.name)
    .sort((a, b) => b.usage - a.usage);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

const NAME_KEYS = ['name', 'move', 'item', 'ability', 'pokemon', 'species', 'teammate', 'label', 'key', 'id'];
const USAGE_KEYS = ['usage', 'percent', 'pct', 'percentage', 'rate', 'frequency', 'freq', 'value', 'count', 'weight', 'share'];

/**
 * Aceita as formas conhecidas de lista ponderada:
 *   [{name, usage}] | [{move, percent}] | {"Protect": 0.7} | [["Protect", 70]]
 */
export function toWeightedNames(value: unknown): WeightedName[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    const pairs: { name: string; usage: number }[] = [];
    for (const item of value) {
      if (typeof item === 'string') {
        pairs.push({ name: item, usage: 0 });
      } else if (Array.isArray(item) && item.length >= 2) {
        pairs.push({ name: String(item[0]), usage: Number(item[1]) || 0 });
      } else if (isObject(item)) {
        const name = pickString(item, NAME_KEYS);
        const usage = pickNumber(item, USAGE_KEYS);
        if (name) pairs.push({ name, usage: usage ?? 0 });
      }
    }
    // Lista de nomes sem peso: distribui pesos decrescentes so para preservar a ordem.
    if (pairs.length && pairs.every((p) => p.usage === 0)) {
      return pairs.map((p, i) => ({ name: p.name, usage: Math.max(0, 1 - i * 0.05) }));
    }
    return rescale(pairs);
  }

  if (isObject(value)) {
    const pairs: { name: string; usage: number }[] = [];
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'number') pairs.push({ name: k, usage: v });
      else if (isObject(v)) {
        const usage = pickNumber(v, USAGE_KEYS);
        if (usage !== null) pairs.push({ name: k, usage });
      }
    }
    return rescale(pairs);
  }

  return [];
}

/**
 * Interpreta uma distribuicao de stats.
 *
 * O Champions usa Stat Points (0-32 por stat, 66 no total), mas varias fontes
 * ainda publicam em EVs por herança do Showdown. Distinguimos pela escala:
 * qualquer componente acima de 32 so pode ser EV.
 */
export function toSpSpread(value: unknown): SpSpread | null {
  let nums: number[] | null = null;

  if (typeof value === 'string') {
    const parts = value.split(/[\/,\s]+/).map((p) => Number(p.trim())).filter((n) => Number.isFinite(n));
    if (parts.length >= 6) nums = parts.slice(0, 6);
  } else if (Array.isArray(value) && value.length >= 6) {
    nums = value.slice(0, 6).map((n) => Number(n) || 0);
  } else if (isObject(value)) {
    const out = makeSpread();
    let found = false;
    for (const id of STAT_IDS) {
      const n = pickNumber(value, [id, statAlias(id)]);
      if (n !== null) {
        out[id] = n;
        found = true;
      }
    }
    if (!found) return null;
    nums = STAT_IDS.map((id) => out[id]);
  }

  if (!nums) return null;

  const max = Math.max(...nums);
  const total = nums.reduce((a, b) => a + b, 0);
  const looksLikeEvs = max > SP_MAX_PER_STAT || total > SP_TOTAL * 1.5;
  const scaled = looksLikeEvs ? nums.map((n) => Math.round(n / 8)) : nums;

  const spread = makeSpread();
  STAT_IDS.forEach((id, i) => {
    spread[id] = Math.max(0, Math.min(SP_MAX_PER_STAT, Math.round(scaled[i] ?? 0)));
  });
  return spread;
}

function statAlias(id: StatID): string {
  switch (id) {
    case 'hp': return 'health';
    case 'atk': return 'attack';
    case 'def': return 'defense';
    case 'spa': return 'specialattack';
    case 'spd': return 'specialdefense';
    case 'spe': return 'speed';
  }
}

/**
 * Spreads costumam vir como "Adamant:0/252/0/0/4/252" ou
 * {nature, evs|sp|spread, usage}.
 */
export function toMetaSpreads(value: unknown): MetaSpread[] {
  const out: MetaSpread[] = [];

  const consume = (nature: string, spreadValue: unknown, usage: number) => {
    const sp = toSpSpread(spreadValue);
    if (sp) out.push({ nature: nature || 'Serious', sp, usage });
  };

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        const [nature, rest] = splitNatureSpread(item);
        consume(nature, rest, 0);
      } else if (isObject(item)) {
        const nature = pickString(item, ['nature', 'natureName']) ?? '';
        const usage = pickNumber(item, USAGE_KEYS) ?? 0;
        const spreadValue = pick(item, ['sp', 'statpoints', 'stat_points', 'evs', 'spread', 'stats']) ?? item;
        if (typeof spreadValue === 'string' && !nature) {
          const [n, rest] = splitNatureSpread(spreadValue);
          consume(n, rest, usage);
        } else {
          consume(nature, spreadValue, usage);
        }
      }
    }
  } else if (isObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      const [nature, rest] = splitNatureSpread(k);
      const usage = typeof v === 'number' ? v : pickNumber(v, USAGE_KEYS) ?? 0;
      consume(nature, rest || v, usage);
    }
  }

  const max = out.reduce((m, s) => Math.max(m, s.usage), 0);
  const div = max > 1.5 ? 100 : 1;
  return out
    .map((s) => ({ ...s, usage: clamp01(s.usage / div) }))
    .sort((a, b) => b.usage - a.usage);
}

function splitNatureSpread(text: string): [string, string] {
  const m = /^\s*([A-Za-z]+)\s*[:|]\s*(.+)$/.exec(text);
  if (m) return [m[1], m[2]];
  return ['', text];
}
