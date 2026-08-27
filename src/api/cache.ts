/**
 * Cache do ultimo snapshot bem sucedido.
 *
 * O app e live-first: toda abertura tenta a rede primeiro. Este cache existe
 * so para o app nao abrir vazio quando voce esta sem sinal — e a interface
 * sempre marca quando o que voce esta vendo veio do cache e de quando ele e.
 */

import { get, set, del } from 'idb-keyval';
import type { MetaEntry, MetaSnapshot } from './types';

const KEY_PREFIX = 'champions-lab:meta:';
const DETAIL_PREFIX = 'champions-lab:detail:';

function key(format: string): string {
  return `${KEY_PREFIX}${format}`;
}

export async function readCachedSnapshot(format: string): Promise<MetaSnapshot | null> {
  try {
    const v = await get<MetaSnapshot>(key(format));
    return v ?? null;
  } catch {
    return null;
  }
}

export async function writeCachedSnapshot(snapshot: MetaSnapshot): Promise<void> {
  try {
    await set(key(snapshot.format), snapshot);
  } catch {
    // Cota estourada ou modo privativo: seguir sem cache e aceitavel.
  }
}

export async function clearCachedSnapshot(format: string): Promise<void> {
  try {
    await del(key(format));
  } catch {
    /* nada a fazer */
  }
}

/**
 * Cache dos detalhes por Pokemon.
 *
 * Buscar o moveset de 30 Pokemon custa 30 idas a rede. Guardando por recorte,
 * a segunda abertura do app nao paga nada disso — e o recorte entra na chave,
 * entao quando a API publica um novo dia os dados velhos sao ignorados
 * sozinhos, sem precisar limpar nada.
 */
function detailKey(format: string, label: string | null): string {
  return `${DETAIL_PREFIX}${format}:${label ?? 'atual'}`;
}

export async function readCachedDetails(
  format: string,
  label: string | null,
): Promise<Record<string, Partial<MetaEntry>>> {
  try {
    return (await get<Record<string, Partial<MetaEntry>>>(detailKey(format, label))) ?? {};
  } catch {
    return {};
  }
}

export async function writeCachedDetails(
  format: string,
  label: string | null,
  details: Record<string, Partial<MetaEntry>>,
): Promise<void> {
  try {
    const atual = await readCachedDetails(format, label);
    await set(detailKey(format, label), { ...atual, ...details });
  } catch {
    /* sem espaco: seguimos sem cache */
  }
}

export function snapshotAgeLabel(snapshot: MetaSnapshot): string {
  const mins = Math.round((Date.now() - snapshot.fetchedAt) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `ha ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `ha ${hours}h`;
  return `ha ${Math.round(hours / 24)} dia(s)`;
}
