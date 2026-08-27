/** Modelo de um Pokemon montado no builder. */

import { makeSpread, type SpSpread } from './stats';
import { getItem, getSpecies, isMega, megasOf, abilitiesOf, type Specie } from './dex';

export interface ChampionsSet {
  /** Identificador do slot no time. */
  uid: string;
  /** ID Showdown da especie base (nunca da Mega — a Mega vem da pedra). */
  species: string;
  ability: string;
  item: string;
  nature: string;
  sp: SpSpread;
  moves: string[];
  /**
   * Fracao do ladder que carrega cada golpe, quando a API informa.
   *
   * Um set do meta nao e uma certeza: se Rock Slide esta em 50% dos Garchomp,
   * metade deles simplesmente nao tem como derrubar um Charizard-Mega-Y.
   * Tratar os quatro golpes mais jogados como se fossem garantidos infla toda
   * ameaca que depende de um golpe de nicho.
   */
  moveOdds?: Record<string, number>;
  nickname?: string;
  notes?: string;
}

let counter = 0;
export function newUid(): string {
  counter += 1;
  return `set-${Date.now().toString(36)}-${counter}`;
}

export function emptySet(speciesId = ''): ChampionsSet {
  const species = speciesId ? getSpecies(speciesId) : null;
  return {
    uid: newUid(),
    species: species ? species.id : '',
    ability: species ? abilitiesOf(species)[0] ?? '' : '',
    item: '',
    nature: 'Serious',
    sp: makeSpread(),
    moves: [],
  };
}

/**
 * Especie que realmente entra em campo.
 *
 * No Champions a Mega Evolucao acontece por segurar a pedra, entao a forma de
 * batalha e derivada do item. O @smogon/calc nao faz essa resolucao sozinho.
 */
export function battleSpecies(set: ChampionsSet): Specie | null {
  const base = getSpecies(set.species);
  if (!base) return null;
  if (!set.item) return base;

  const item = getItem(set.item);
  if (!item) return base;

  const mega = megasOf(base).find(
    (m) => String(m.requiredItem).toLowerCase() === item.name.toLowerCase(),
  );
  return mega ?? base;
}

/** O set esta segurando a pedra que o mega-evolui? */
export function willMegaEvolve(set: ChampionsSet): boolean {
  const s = battleSpecies(set);
  return Boolean(s && isMega(s));
}

/** Pedras que mega-evoluem esta especie, para o seletor de item. */
export function megaStonesFor(speciesId: string): string[] {
  const base = getSpecies(speciesId);
  if (!base) return [];
  return megasOf(base)
    .map((m) => String(m.requiredItem))
    .filter(Boolean);
}

/**
 * Ability efetiva em campo. Megas trocam de ability ao evoluir
 * (Charizard Blaze -> Mega Y Drought, por exemplo).
 */
export function battleAbility(set: ChampionsSet): string {
  const s = battleSpecies(set);
  if (!s) return set.ability;
  if (isMega(s)) return abilitiesOf(s)[0] ?? set.ability;
  return set.ability;
}
