/**
 * Camada de dex do app.
 *
 * O @pkmn/data filtra as Mega Evolucoes para fora da gen 9, e o Champions
 * depende delas, entao trabalhamos direto sobre o Dex cru da gen 9. Ali as
 * Megas classicas (gen 6/7) aparecem como isNonstandard 'Past' e as Megas novas
 * introduzidas em Legends Z-A aparecem como 'Future' — as duas familias sao
 * legais no Champions.
 *
 * Divisao de responsabilidade importante: este modulo e a verdade sobre
 * *mecanica* (tipagem, base stats, moves, abilities, itens). Quem esta legal na
 * regulation vigente vem da API ao vivo, em src/api/. Os dois nunca se
 * misturam.
 */

import { Dex } from '@pkmn/dex';
import type { Species as Specie, Move, Item, Ability, TypeName } from '@pkmn/dex';
import type { StatID, StatTable } from './stats';

export const dex = Dex.forGen(9);

export type { Specie, Move, Item, Ability, TypeName };

/** Tipos usados no calculo defensivo. Stellar fica de fora: nao e tipo defensivo. */
export const BATTLE_TYPES: TypeName[] = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison',
  'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark',
  'Steel', 'Fairy',
];

/**
 * Abreviacoes de tres letras para as grades de tipo.
 *
 * Dezoito celulas numa tela de celular nao comportam "Fighting" nem
 * "Electric"; truncar com reticencias produz "FIGHT…" e "ELECT…", que o olho
 * tem de decifrar. Tres letras cabem inteiras e sao lidas de imediato.
 *
 * Ficam em ingles para casar com as capsulas de tipo dos cards e com o que o
 * jogador ja le no Showdown e nos sites de meta. Traduzir so aqui produziria o
 * mesmo tipo escrito de dois jeitos na mesma tela.
 */
export const TYPE_ABBR: Record<string, string> = {
  Normal: 'NOR', Fire: 'FIR', Water: 'WAT', Electric: 'ELE',
  Grass: 'GRA', Ice: 'ICE', Fighting: 'FIG', Poison: 'POI',
  Ground: 'GRO', Flying: 'FLY', Psychic: 'PSY', Bug: 'BUG',
  Rock: 'ROC', Ghost: 'GHO', Dragon: 'DRA', Dark: 'DAR',
  Steel: 'STE', Fairy: 'FAI',
};

export const TYPE_COLOR: Record<string, string> = {
  Normal: '#9fa19f', Fire: '#e8743a', Water: '#4a90d9', Electric: '#e3c934',
  Grass: '#5cb85c', Ice: '#5fc9d4', Fighting: '#c8443a', Poison: '#9b59b6',
  Ground: '#c9a54a', Flying: '#8aa9e0', Psychic: '#e8618c', Bug: '#8fb61f',
  Rock: '#b8a15a', Ghost: '#6a5acd', Dragon: '#5b56d6', Dark: '#5a5060',
  Steel: '#7a9aa8', Fairy: '#e08fc4',
};

export function normalizeId(name: string): string {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function getSpecies(nameOrId: string): Specie | null {
  if (!nameOrId) return null;
  const s = dex.species.get(nameOrId);
  return s && s.exists ? s : null;
}

export function getMove(nameOrId: string): Move | null {
  if (!nameOrId) return null;
  const m = dex.moves.get(nameOrId);
  return m && m.exists ? m : null;
}

export function getItem(nameOrId: string): Item | null {
  if (!nameOrId) return null;
  const i = dex.items.get(nameOrId);
  return i && i.exists ? i : null;
}

export function getAbility(nameOrId: string): Ability | null {
  if (!nameOrId) return null;
  const a = dex.abilities.get(nameOrId);
  return a && a.exists && a.id !== 'noability' ? a : null;
}

/** Uma forma e Mega quando exige uma Mega Stone para existir. */
export function isMega(s: Specie): boolean {
  return Boolean(s.requiredItem) && /-Mega/.test(s.name);
}

/** Nome da Mega Stone que destrava esta forma, se houver. */
export function megaStoneFor(s: Specie): string | null {
  return isMega(s) ? (s.requiredItem as string) : null;
}

/** Todas as Megas disponiveis para uma especie base. */
export function megasOf(base: Specie): Specie[] {
  const baseName = base.baseSpecies || base.name;
  return dex.species
    .all()
    .filter((s) => s.exists && isMega(s) && (s.baseSpecies || s.name) === baseName)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Especie base de uma Mega (ou ela mesma, se ja for base). */
export function baseFormOf(s: Specie): Specie {
  if (!s.baseSpecies || s.baseSpecies === s.name) return s;
  return getSpecies(s.baseSpecies) ?? s;
}

export function baseStatsOf(s: Specie): StatTable {
  const bs = s.baseStats as Record<StatID, number>;
  return { hp: bs.hp, atk: bs.atk, def: bs.def, spa: bs.spa, spd: bs.spd, spe: bs.spe };
}

export function abilitiesOf(s: Specie): string[] {
  const out: string[] = [];
  const a = s.abilities as unknown as Record<string, string | undefined>;
  for (const key of ['0', '1', 'H', 'S']) {
    const v = a[key];
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

const learnsetCache = new Map<string, Promise<string[]>>();

/**
 * Movepool completo de uma especie.
 *
 * Os learnsets do Showdown guardam so o que aquele estagio aprende por conta
 * propria: Sucker Punch aparece em Pawniard, nao em Kingambit, e um Kingambit
 * de verdade herda tudo que Pawniard e Bisharp aprendem. Formas alternativas e
 * Megas tambem apontam para um ancestral em vez de repetir a lista.
 *
 * Percorremos entao todos os ancestrais — pre-evolucoes (prevo), forma base
 * (baseSpecies) e forma de origem (changesFrom) — e unimos o que cada um
 * ensina. Sem isso o app escondia metade do movepool de todo Pokemon
 * completamente evoluido, que e justamente o que se joga no formato.
 *
 * No sentido oposto, cada golpe do learnset guarda em que geracoes ele pode
 * ser obtido ("9M" = TM da gen 9, "8L20" = nivel 20 na gen 8, e assim por
 * diante). Ficamos so com o que tem origem na gen 9: o Champions herda o
 * movepool de Scarlet/Violet, e golpes que so existiam em geracoes anteriores
 * apareceriam como opcao sem serem jogaveis. Indeedee, por exemplo, lista 57
 * golpes ao todo mas so 44 sao alcancaveis hoje.
 */
export function learnsetOf(nameOrId: string): Promise<string[]> {
  const id = normalizeId(nameOrId);
  const cached = learnsetCache.get(id);
  if (cached) return cached;

  const promise = (async () => {
    const inicial = getSpecies(id);
    if (!inicial) return [];

    const visitados = new Set<string>();
    const fila: Specie[] = [inicial];
    const moves = new Set<string>();

    while (fila.length) {
      const atual = fila.shift()!;
      if (visitados.has(atual.id)) continue;
      visitados.add(atual.id);

      try {
        const data = await dex.learnsets.get(atual.id);
        if (data?.learnset) {
          for (const [moveId, fontes] of Object.entries(data.learnset)) {
            if (fontes.some((fonte) => fonte.startsWith('9'))) moves.add(moveId);
          }
        }
      } catch {
        // Especie sem learnset proprio: os ancestrais respondem por ela.
      }

      for (const nome of [atual.prevo, atual.baseSpecies, atual.changesFrom]) {
        if (!nome || nome === atual.name) continue;
        const ancestral = getSpecies(nome);
        if (ancestral && !visitados.has(ancestral.id)) fila.push(ancestral);
      }
    }

    return [...moves]
      .map((mid) => getMove(mid))
      .filter((m): m is Move => m !== null && m.isNonstandard !== 'CAP')
      .map((m) => m.name)
      .sort((a, b) => a.localeCompare(b));
  })();

  learnsetCache.set(id, promise);
  return promise;
}

/**
 * Multiplicador de dano de um tipo atacante contra uma combinacao defensiva.
 * Considera imunidades (retorna 0).
 */
export function typeEffectiveness(attacking: TypeName, defending: readonly TypeName[]): number {
  let mult = 1;
  for (const d of defending) {
    // A tabela do Showdown e escrita da perspectiva do defensor:
    // damageTaken[atacante] -> 0 neutro, 1 super efetivo, 2 resistido, 3 imune.
    const chart = dex.types.get(d);
    if (!chart) continue;
    const taken = chart.damageTaken[attacking];
    if (taken === 1) mult *= 2;
    else if (taken === 2) mult *= 0.5;
    else if (taken === 3) return 0;
  }
  return mult;
}

/** Perfil defensivo completo: quanto cada tipo atacante causa nesta especie. */
export function defensiveProfile(types: readonly TypeName[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of BATTLE_TYPES) out[t] = typeEffectiveness(t, types);
  return out;
}

export const NATURES = dex.natures
  .all()
  .filter((n) => n.exists)
  .map((n) => ({
    name: n.name,
    plus: (n.plus ?? null) as StatID | null,
    minus: (n.minus ?? null) as StatID | null,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function natureByName(name: string) {
  return NATURES.find((n) => n.name.toLowerCase() === String(name).toLowerCase()) ?? NATURES.find((n) => n.name === 'Serious')!;
}

/** URL do sprite animado do Showdown, com fallback para a forma base. */
export function spriteUrl(s: Specie): string {
  const id = s.id;
  return `https://play.pokemonshowdown.com/sprites/gen5/${id}.png`;
}

export function spriteFallbackUrl(s: Specie): string {
  const base = baseFormOf(s);
  return `https://play.pokemonshowdown.com/sprites/gen5/${base.id}.png`;
}

export function itemSpriteStyle(item: Item): React.CSSProperties {
  const num = (item as unknown as { spritenum?: number }).spritenum ?? 0;
  const left = -(num % 16) * 24;
  const top = -Math.floor(num / 16) * 24;
  return {
    width: 24,
    height: 24,
    backgroundImage: 'url(https://play.pokemonshowdown.com/sprites/itemicons-sheet.png)',
    backgroundPosition: `${left}px ${top}px`,
  };
}
