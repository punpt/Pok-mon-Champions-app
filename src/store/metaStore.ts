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

  setBaseUrl(url: string): void;
  load(force?: boolean): Promise<void>;
  enrich(id: string): Promise<void>;
  enrichTop(count: number): Promise<void>;
  clearCache(): Promise<void>;
  entry(id: string): MetaEntry | null;
}

export const useMetaStore = create<MetaState>((set, get) => ({
  status: 'ocioso',
  snapshot: null,
  fromCache: false,
  error: null,
  diagnostics: null,
  baseUrl: storedBaseUrl(),
  enriched: new Set<string>(),

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
      set({
        snapshot: live,
        status: 'ao-vivo',
        fromCache: false,
        error: null,
        diagnostics: null,
        enriched: new Set<string>(),
      });
    } catch (err) {
      const diagnostics = err instanceof MetaFetchError ? err.diagnostics : null;
      const message = err instanceof Error ? err.message : String(err);
      const cached = await readCachedSnapshot(format);

      if (cached) {
        set({
          snapshot: cached,
          status: 'cache',
          fromCache: true,
          error: message,
          diagnostics,
          enriched: new Set<string>(),
        });
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
    const nextEnriched = new Set(enriched).add(id);
    if (!detail) {
      set({ enriched: nextEnriched });
      return;
    }

    const entries = snapshot.entries.map((e) =>
      e.id === id
        ? {
            ...e,
            ...detail,
            // Nao deixamos o detalhe zerar campos que o indice ja tinha.
            moves: detail.moves?.length ? detail.moves : e.moves,
            items: detail.items?.length ? detail.items : e.items,
            abilities: detail.abilities?.length ? detail.abilities : e.abilities,
            teammates: detail.teammates?.length ? detail.teammates : e.teammates,
            spreads: detail.spreads?.length ? detail.spreads : e.spreads,
          }
        : e,
    );

    set({ snapshot: { ...snapshot, entries }, enriched: nextEnriched });
  },

  async enrichTop(count) {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    const alvos = snapshot.entries.slice(0, count).map((e) => e.id);
    // Sequencial de proposito: rajada de dezenas de requests derruba a rede do celular.
    for (const id of alvos) {
      if (get().enriched.has(id)) continue;
      await get().enrich(id);
    }
  },

  async clearCache() {
    const format = get().snapshot?.format ?? activeRegulation().apiFormat;
    await clearCachedSnapshot(format);
    set({ snapshot: null, status: 'ocioso', fromCache: false, enriched: new Set<string>() });
  },

  entry(id) {
    return get().snapshot?.entries.find((e) => e.id === id) ?? null;
  },
}));
