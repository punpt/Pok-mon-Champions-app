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
  /**
   * Diagnostico da carga bem sucedida.
   *
   * Fica no snapshot de proposito: o caso dificil nao e a API falhar, e ela
   * responder com numeros noutra escala. Sem isso, a unica forma de perceber
   * seria comparar na mao com outro site.
   */
  diagnostics?: SourceDiagnostics;
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
  /**
   * Como o usage foi interpretado. Serve para conferir de fora quando os
   * numeros nao batem com o que os sites de meta mostram.
   */
  usage?: {
    mode: 'times' | 'slots';
    factor: number;
    rawSum: number;
    automatic: boolean;
    amostra: string[];
  };
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
