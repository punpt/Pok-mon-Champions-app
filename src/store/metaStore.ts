/**
 * Estado do recorte de meta.
 *
 * Live-first: toda carga tenta a rede primeiro. O snapshot em cache so entra em
 * cena se a rede falhar, e nesse caso a interface marca claramente que o dado e
 * antigo e de quando ele e.
 */

import { create } from 'zustand';
import { loadMetaDetail, loadMetaIndex, DEFAULT_BASE_URL } from '../api/championsBattleData';
import { readCachedSnapshot, writeCachedSnapshot, clearCachedSnapshot } from '../api/cache';
import { MetaFetchError, type MetaEntry, type MetaSnapshot, type SourceDiagnostics } from '../api/types';
import { activeRegulation } from '../data/rules';

const BASE_URL_KEY = 'champions-lab:baseUrl';

function storedBaseUrl(): string {
  try {
    return localStorage.getItem(BASE_URL_KEY) || DEFAULT_BASE_URL;
  } catch {
    return DEFAULT_BASE_URL;
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

export const useMetaStore = create<MetaState>((set, get) => ({
  status: 'ocioso',
  snapshot: null,
  fromCache: false,
  error: null,
  diagnostics: null,
  baseUrl: storedBaseUrl(),
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

  async load(force = false) {
    const { status, snapshot } = get();
    if (status === 'carregando') return;
    if (snapshot && !force) return;

    set({ status: 'carregando', error: null });
    const format = activeRegulation().apiFormat;

    try {
      const live = await loadMetaIndex({ baseUrl: get().baseUrl, format });
      await writeCachedSnapshot(live);
      set((prev) => ({
        snapshot: live,
        status: 'ao-vivo',
        fromCache: false,
        error: null,
        diagnostics: null,
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

    const alvos = snapshot.entries
      .slice(0, count)
      .map((e) => e.id)
      .filter((id) => !get().enriched.has(id));
    if (!alvos.length) return;

    set({ enriching: true });
    const format = snapshot.format;
    const baseUrl = get().baseUrl;
    const detalhes = new Map<string, Partial<MetaEntry>>();

    try {
      // Sequencial de proposito: uma rajada de dezenas de requests derruba a
      // rede do celular. Os resultados sao acumulados e aplicados de uma vez
      // so — aplicar um a um faria as telas de ameacas e sinergia recomecarem
      // o calculo a cada detalhe que chega.
      for (const id of alvos) {
        const detail = await loadMetaDetail(id, { baseUrl, format });
        if (detail) detalhes.set(id, detail);
      }
    } finally {
      set((prev) => {
        const enriched = new Set(prev.enriched);
        for (const id of alvos) enriched.add(id);
        if (!prev.snapshot || !detalhes.size) {
          return { enriched, enriching: false };
        }
        const entries = prev.snapshot.entries.map((e) => {
          const detail = detalhes.get(e.id);
          return detail ? mergeDetail(e, e.id, detail) : e;
        });
        return {
          snapshot: { ...prev.snapshot, entries },
          enriched,
          enriching: false,
          revision: prev.revision + 1,
        };
      });
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
