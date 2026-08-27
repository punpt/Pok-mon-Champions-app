/**
 * Estado do recorte de meta.
 *
 * Live-first: toda carga tenta a rede primeiro. O snapshot em cache so entra em
 * cena se a rede falhar, e nesse caso a interface marca claramente que o dado e
 * antigo e de quando ele e.
 */

import { create } from 'zustand';
import { loadMetaDetail, loadMetaIndex, DEFAULT_BASE_URL } from '../api/championsBattleData';
import {
  readCachedSnapshot,
  writeCachedSnapshot,
  clearCachedSnapshot,
  readCachedDetails,
  writeCachedDetails,
} from '../api/cache';
import { mapWithConcurrency } from '../lib/pool';
import { MetaFetchError, type MetaEntry, type MetaSnapshot, type SourceDiagnostics } from '../api/types';
import type { UsageScale } from '../api/normalize';
import { activeRegulation } from '../data/rules';

const BASE_URL_KEY = 'champions-lab:baseUrl';
const USAGE_SCALE_KEY = 'champions-lab:usageScale';

function storedBaseUrl(): string {
  try {
    return localStorage.getItem(BASE_URL_KEY) || DEFAULT_BASE_URL;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

function storedUsageScale(): UsageScale {
  try {
    const v = localStorage.getItem(USAGE_SCALE_KEY);
    return v === 'times' || v === 'slots' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export type MetaStatus = 'ocioso' | 'carregando' | 'ao-vivo' | 'cache' | 'erro';

interface MetaState {
  status: MetaStatus;
  snapshot: MetaSnapshot | null;
  /** true quando o que esta na tela veio do cache, nao da rede. */
  fromCache: boolean;
  error: string | null;
  diagnostics: SourceDiagnostics | null;
  baseUrl: string;
  /** Como interpretar o usage da fonte. */
  usageScale: UsageScale;
  /** IDs cujo detalhe ja foi buscado. */
  enriched: Set<string>;
  /**
   * Sobe a cada mudanca relevante do recorte. As telas pesadas (ameacas,
   * sinergia) dependem disto em vez do objeto do snapshot, para nao
   * recomecarem o calculo a cada detalhe que chega.
   */
  revision: number;
  /** Evita que varios enrichTop concorrentes disparem a mesma rajada. */
  enriching: boolean;

  setBaseUrl(url: string): void;
  setUsageScale(scale: UsageScale): void;
  load(force?: boolean): Promise<void>;
  enrich(id: string): Promise<void>;
  enrichTop(count: number): Promise<void>;
  clearCache(): Promise<void>;
  entry(id: string): MetaEntry | null;
}

/** Aplica o detalhe sem deixar campos vazios apagarem o que o indice ja trouxe. */
function mergeDetail(entry: MetaEntry, id: string, detail: Partial<MetaEntry>): MetaEntry {
  if (entry.id !== id) return entry;
  return {
    ...entry,
    ...detail,
    moves: detail.moves?.length ? detail.moves : entry.moves,
    items: detail.items?.length ? detail.items : entry.items,
    abilities: detail.abilities?.length ? detail.abilities : entry.abilities,
    teammates: detail.teammates?.length ? detail.teammates : entry.teammates,
    spreads: detail.spreads?.length ? detail.spreads : entry.spreads,
  };
}

type SetState = (
  partial: Partial<MetaState> | ((prev: MetaState) => Partial<MetaState>),
) => void;

/** Aplica um lote de detalhes numa unica atualizacao de estado. */
function aplicarDetalhes(
  set: SetState,
  detalhes: Record<string, Partial<MetaEntry>>,
  visitados: string[],
): void {
  set((prev) => {
    const enriched = new Set(prev.enriched);
    for (const id of visitados) enriched.add(id);
    if (!prev.snapshot || !Object.keys(detalhes).length) return { enriched };
    const entries = prev.snapshot.entries.map((e) => {
      const detail = detalhes[e.id];
      return detail ? mergeDetail(e, e.id, detail) : e;
    });
    return {
      snapshot: { ...prev.snapshot, entries },
      enriched,
      revision: prev.revision + 1,
    };
  });
}

export const useMetaStore = create<MetaState>((set, get) => ({
  status: 'ocioso',
  snapshot: null,
  fromCache: false,
  error: null,
  diagnostics: null,
  baseUrl: storedBaseUrl(),
  usageScale: storedUsageScale(),
  enriched: new Set<string>(),
  revision: 0,
  enriching: false,

  setBaseUrl(url) {
    const clean = url.trim() || DEFAULT_BASE_URL;
    try {
      localStorage.setItem(BASE_URL_KEY, clean);
    } catch {
      /* modo privativo: segue so em memoria */
    }
    set({ baseUrl: clean });
  },

  setUsageScale(scale) {
    try {
      localStorage.setItem(USAGE_SCALE_KEY, scale);
    } catch {
      /* modo privativo: segue so em memoria */
    }
    set({ usageScale: scale });
  },

  async load(force = false) {
    const { status, snapshot } = get();
    if (status === 'carregando') return;
    if (snapshot && !force) return;

    set({ status: 'carregando', error: null });
    const format = activeRegulation().apiFormat;

    try {
      const live = await loadMetaIndex({
        baseUrl: get().baseUrl,
        format,
        usageScale: get().usageScale,
      });
      await writeCachedSnapshot(live);
      set((prev) => ({
        snapshot: live,
        status: 'ao-vivo',
        fromCache: false,
        error: null,
        diagnostics: live.diagnostics ?? null,
        enriched: new Set<string>(),
        revision: prev.revision + 1,
      }));
    } catch (err) {
      const diagnostics = err instanceof MetaFetchError ? err.diagnostics : null;
      const message = err instanceof Error ? err.message : String(err);
      const cached = await readCachedSnapshot(format);

      if (cached) {
        set((prev) => ({
          snapshot: cached,
          status: 'cache',
          fromCache: true,
          error: message,
          diagnostics,
          enriched: new Set<string>(),
          revision: prev.revision + 1,
        }));
      } else {
        set({ status: 'erro', fromCache: false, error: message, diagnostics });
      }
    }
  },

  async enrich(id) {
    const { snapshot, enriched, baseUrl } = get();
    if (!snapshot || enriched.has(id)) return;

    const detail = await loadMetaDetail(id, { baseUrl, format: snapshot.format });
    // Marcamos como visitado mesmo em falha, para nao repetir a chamada em loop.
    if (!detail) {
      set((prev) => ({ enriched: new Set(prev.enriched).add(id) }));
      return;
    }

    set((prev) => {
      if (!prev.snapshot) return {};
      return {
        snapshot: { ...prev.snapshot, entries: prev.snapshot.entries.map((e) => mergeDetail(e, id, detail)) },
        enriched: new Set(prev.enriched).add(id),
        revision: prev.revision + 1,
      };
    });
  },

  async enrichTop(count) {
    const { snapshot, enriching } = get();
    if (!snapshot || enriching) return;

    const candidatos = snapshot.entries.slice(0, count).map((e) => e.id);
    const faltando = candidatos.filter((id) => !get().enriched.has(id));
    if (!faltando.length) return;

    set({ enriching: true });
    const format = snapshot.format;
    const label = snapshot.label;
    const baseUrl = get().baseUrl;

    try {
      // 1. O que ja esta em disco entra na hora, sem tocar na rede.
      const doCache = await readCachedDetails(format, label);
      const daRede = faltando.filter((id) => !doCache[id]);
      const aplicarDoCache = Object.fromEntries(
        faltando.filter((id) => doCache[id]).map((id) => [id, doCache[id]]),
      );

      if (Object.keys(aplicarDoCache).length) {
        aplicarDetalhes(set, aplicarDoCache, Object.keys(aplicarDoCache));
      }

      if (!daRede.length) return;

      // 2. O resto vai em paralelo limitado. Em fila, 30 detalhes custam 30
      // latencias somadas — foi o que fazia as abas de Ameacas e Sinergia
      // demorarem tanto para ficarem completas.
      const novos: Record<string, Partial<MetaEntry>> = {};
      await mapWithConcurrency(daRede, 6, async (id) => {
        const detail = await loadMetaDetail(id, { baseUrl, format });
        if (detail) novos[id] = detail;
        return detail;
      });

      // A tela atualiza primeiro; a gravacao vem logo em seguida e e aguardada.
      // Como promessa solta, ela nao completava quando o app era fechado logo
      // apos abrir, e o cache nunca chegava a existir.
      aplicarDetalhes(set, novos, daRede);
      if (Object.keys(novos).length) {
        await writeCachedDetails(format, label, novos);
      }
    } finally {
      set({ enriching: false });
    }
  },

  async clearCache() {
    const format = get().snapshot?.format ?? activeRegulation().apiFormat;
    await clearCachedSnapshot(format);
    set((prev) => ({
      snapshot: null,
      status: 'ocioso',
      fromCache: false,
      enriched: new Set<string>(),
      revision: prev.revision + 1,
    }));
  },

  entry(id) {
    return get().snapshot?.entries.find((e) => e.id === id) ?? null;
  },
}));
