/**
 * Itens legais para uma especie.
 *
 * O dex da gen 9 traz 583 itens, mas a maioria e resto de campanha: Poke Balls,
 * cristais Z de geracoes passadas, pedras de evolucao, itens travados numa
 * especie so. Oferecer tudo isso num seletor de time transforma a busca num
 * campo minado.
 *
 * Ficamos com os 224 itens padrao da geracao, mais as Mega Stones da propria
 * especie (que sao marcadas como de outra geracao justamente por terem voltado
 * em Legends Z-A), e escondemos os itens presos a um dono que nao e este
 * Pokemon.
 */

import { dex, getSpecies, isMega, megasOf, normalizeId, type Item, type Specie } from './dex';

function stonesFor(species: Specie | null): Set<string> {
  if (!species) return new Set();
  return new Set(
    megasOf(species)
      .map((m) => String(m.requiredItem))
      .filter(Boolean),
  );
}

/** O item esta preso a um dono especifico que nao e esta especie? */
function lockedToAnotherSpecies(item: Item, species: Specie | null): boolean {
  const donos = (item as unknown as { itemUser?: string[] }).itemUser;
  if (!donos || !donos.length) return false;
  if (!species) return true;
  const nomes = new Set(donos.map(normalizeId));
  // Basta a forma base bater: Ogerpon-Wellspring pode segurar a mascara dela.
  return !nomes.has(normalizeId(species.name)) && !nomes.has(normalizeId(species.baseSpecies || species.name));
}

export interface LegalItem {
  item: Item;
  /** E a Mega Stone desta especie. */
  isMegaStone: boolean;
}

export function legalItemsFor(speciesId: string): LegalItem[] {
  const species = getSpecies(speciesId);
  const stones = stonesFor(species);

  return dex.items
    .all()
    .filter((item) => {
      if (!item.exists) return false;
      if (stones.has(item.name)) return true;
      if (item.isNonstandard !== null) return false;
      if (item.isPokeball) return false;
      if ((item as unknown as { zMove?: unknown }).zMove) return false;
      if (item.megaStone) return false;
      if (lockedToAnotherSpecies(item, species)) return false;
      return true;
    })
    .map((item) => ({ item, isMegaStone: stones.has(item.name) }))
    .sort((a, b) => {
      if (a.isMegaStone !== b.isMegaStone) return a.isMegaStone ? -1 : 1;
      return a.item.name.localeCompare(b.item.name);
    });
}

/** Uma especie so pode segurar Eviolite se ainda tiver evolucao pela frente. */
export function itemMakesSense(item: Item, speciesId: string): boolean {
  const species = getSpecies(speciesId);
  if (!species) return true;
  if (normalizeId(item.name) === 'eviolite') return Boolean(species.evos?.length);
  if (isMega(species)) return true;
  return true;
}
