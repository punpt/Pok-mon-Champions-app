/**
 * Cache do ultimo snapshot bem sucedido.
 *
 * O app e live-first: toda abertura tenta a rede primeiro. Este cache existe
 * so para o app nao abrir vazio quando voce esta sem sinal — e a interface
 * sempre marca quando o que voce esta vendo veio do cache e de quando ele e.
 */

import { get, set, del } from 'idb-keyval';
import type { MetaSnapshot } from './types';

const KEY_PREFIX = 'champions-lab:meta:';

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

export function snapshotAgeLabel(snapshot: MetaSnapshot): string {
  const mins = Math.round((Date.now() - snapshot.fetchedAt) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `ha ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `ha ${hours}h`;
  return `ha ${Math.round(hours / 24)} dia(s)`;
}
