/** Modelo normalizado de dados de meta. Toda fonte externa e traduzida para ca. */

import type { SpSpread } from '../data/stats';

export interface WeightedName {
  name: string;
  /** Fracao de 0 a 1. */
  usage: number;
}

export interface MetaSpread {
  nature: string;
  sp: SpSpread;
  usage: number;
}

export interface MetaEntry {
  /** ID interno do Showdown, ex.: garchomp, basculegionf, charizardmegay. */
  id: string;
  /** Nome canonico do Showdown, ex.: Charizard-Mega-Y. */
  name: string;
  /** Usage no ladder, de 0 a 1. */
  usage: number;
  rank: number;
  abilities: WeightedName[];
  items: WeightedName[];
  moves: WeightedName[];
  teammates: WeightedName[];
  spreads: MetaSpread[];
}

export interface MetaSnapshot {
  /** Doubles ou Singles. */
  format: string;
  /** ID da regulation a que este recorte pertence, quando a fonte informa. */
  regulationId: string | null;
  /** Identificador legivel do recorte, ex.: "M5/26_08_2026". */
  label: string | null;
  /** Host de onde veio. */
  source: string;
  /** Epoch ms em que buscamos. */
  fetchedAt: number;
  entries: MetaEntry[];
}

export interface SourceDiagnostics {
  baseUrl: string;
  attempts: {
    url: string;
    ok: boolean;
    status: number | null;
    ms: number;
    error?: string;
    /** Amostra crua do corpo, para depurar mapeamento sem sair do app. */
    sample?: string;
  }[];
  chosenUrl: string | null;
  entriesParsed: number;
  warnings: string[];
}

export class MetaFetchError extends Error {
  constructor(
    message: string,
    readonly diagnostics: SourceDiagnostics,
  ) {
    super(message);
    this.name = 'MetaFetchError';
  }
}
