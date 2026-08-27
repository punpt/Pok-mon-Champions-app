import type { MetaEntry } from '../../api/types';
import { makeSpread } from '../../data/stats';

/**
 * Recorte reduzido do meta de Regulation M-B, com os Pokemon e usages
 * publicados no ladder de agosto/2026. Serve so para os testes: em producao os
 * dados vem da API ao vivo.
 */
function entry(
  id: string,
  name: string,
  usage: number,
  rank: number,
  extra: Partial<MetaEntry> = {},
): MetaEntry {
  return {
    id,
    name,
    usage,
    rank,
    abilities: [],
    items: [],
    moves: [],
    teammates: [],
    spreads: [],
    ...extra,
  };
}

export const META_MB: MetaEntry[] = [
  entry('garchomp', 'Garchomp', 0.31, 1, {
    abilities: [{ name: 'Rough Skin', usage: 0.9 }],
    items: [{ name: 'Life Orb', usage: 0.4 }],
    moves: [
      { name: 'Earthquake', usage: 0.9 },
      { name: 'Dragon Claw', usage: 0.6 },
      { name: 'Protect', usage: 0.8 },
      { name: 'Rock Slide', usage: 0.5 },
    ],
    teammates: [{ name: 'Charizard-Mega-Y', usage: 0.163 }],
    spreads: [{ nature: 'Adamant', sp: makeSpread({ atk: 32, spe: 32, hp: 2 }), usage: 0.3 }],
  }),
  entry('sinistcha', 'Sinistcha', 0.24, 2, {
    abilities: [{ name: 'Hospitality', usage: 0.8 }],
    items: [{ name: 'Sitrus Berry', usage: 0.5 }],
    moves: [
      { name: 'Matcha Gotcha', usage: 0.95 },
      { name: 'Shadow Ball', usage: 0.6 },
      { name: 'Rage Powder', usage: 0.7 },
      { name: 'Trick Room', usage: 0.3 },
    ],
    spreads: [{ nature: 'Bold', sp: makeSpread({ hp: 32, def: 32, spd: 2 }), usage: 0.4 }],
  }),
  entry('basculegion', 'Basculegion', 0.21, 3, {
    abilities: [{ name: 'Swift Swim', usage: 0.5 }],
    items: [{ name: 'Choice Band', usage: 0.4 }],
    moves: [
      { name: 'Wave Crash', usage: 0.9 },
      { name: 'Last Respects', usage: 0.85 },
      { name: 'Aqua Jet', usage: 0.5 },
      { name: 'Protect', usage: 0.4 },
    ],
    spreads: [{ nature: 'Adamant', sp: makeSpread({ atk: 32, spe: 32, hp: 2 }), usage: 0.35 }],
  }),
  entry('whimsicott', 'Whimsicott', 0.19, 4, {
    abilities: [{ name: 'Prankster', usage: 0.95 }],
    items: [{ name: 'Focus Sash', usage: 0.5 }],
    moves: [
      { name: 'Moonblast', usage: 0.8 },
      { name: 'Tailwind', usage: 0.9 },
      { name: 'Encore', usage: 0.6 },
      { name: 'Protect', usage: 0.5 },
    ],
    spreads: [{ nature: 'Timid', sp: makeSpread({ spa: 20, spe: 32, hp: 14 }), usage: 0.3 }],
  }),
  entry('kingambit', 'Kingambit', 0.18, 5, {
    abilities: [{ name: 'Supreme Overlord', usage: 0.9 }],
    items: [{ name: 'Black Glasses', usage: 0.3 }],
    moves: [
      { name: 'Sucker Punch', usage: 0.95 },
      { name: 'Kowtow Cleave', usage: 0.85 },
      { name: 'Iron Head', usage: 0.4 },
      { name: 'Protect', usage: 0.6 },
    ],
    spreads: [{ nature: 'Adamant', sp: makeSpread({ atk: 32, hp: 24, def: 10 }), usage: 0.35 }],
  }),
  entry('charizard', 'Charizard', 0.17, 6, {
    abilities: [{ name: 'Blaze', usage: 0.9 }],
    items: [{ name: 'Charizardite Y', usage: 0.95 }],
    moves: [
      { name: 'Heat Wave', usage: 0.9 },
      { name: 'Solar Beam', usage: 0.5 },
      { name: 'Air Slash', usage: 0.4 },
      { name: 'Protect', usage: 0.7 },
    ],
    spreads: [{ nature: 'Modest', sp: makeSpread({ spa: 32, spe: 26, hp: 8 }), usage: 0.3 }],
  }),
  entry('sylveon', 'Sylveon', 0.14, 7, {
    abilities: [{ name: 'Pixilate', usage: 0.9 }],
    items: [{ name: 'Throat Spray', usage: 0.4 }],
    moves: [
      { name: 'Hyper Voice', usage: 0.95 },
      { name: 'Moonblast', usage: 0.4 },
      { name: 'Protect', usage: 0.7 },
      { name: 'Helping Hand', usage: 0.3 },
    ],
    spreads: [{ nature: 'Modest', sp: makeSpread({ spa: 32, hp: 32, spd: 2 }), usage: 0.3 }],
  }),
  entry('floette', 'Floette', 0.12, 8, {
    abilities: [{ name: 'Flower Veil', usage: 0.9 }],
    items: [{ name: 'Floettite', usage: 0.95 }],
    moves: [
      { name: 'Moonblast', usage: 0.9 },
      { name: 'Dazzling Gleam', usage: 0.5 },
      { name: 'Protect', usage: 0.6 },
      { name: 'Light Screen', usage: 0.3 },
    ],
    spreads: [{ nature: 'Modest', sp: makeSpread({ spa: 32, spe: 32, hp: 2 }), usage: 0.3 }],
  }),
  entry('sneasler', 'Sneasler', 0.11, 9, {
    abilities: [{ name: 'Unburden', usage: 0.8 }],
    items: [{ name: 'Focus Sash', usage: 0.4 }],
    moves: [
      { name: 'Close Combat', usage: 0.9 },
      { name: 'Dire Claw', usage: 0.8 },
      { name: 'Fake Out', usage: 0.6 },
      { name: 'Protect', usage: 0.5 },
    ],
    spreads: [{ nature: 'Adamant', sp: makeSpread({ atk: 32, spe: 32, hp: 2 }), usage: 0.35 }],
  }),
  entry('rillaboom', 'Rillaboom', 0.1, 10, {
    abilities: [{ name: 'Grassy Surge', usage: 0.95 }],
    items: [{ name: 'Assault Vest', usage: 0.4 }],
    moves: [
      { name: 'Grassy Glide', usage: 0.95 },
      { name: 'Wood Hammer', usage: 0.6 },
      { name: 'Fake Out', usage: 0.7 },
      { name: 'U-turn', usage: 0.4 },
    ],
    spreads: [{ nature: 'Adamant', sp: makeSpread({ atk: 32, hp: 26, def: 8 }), usage: 0.3 }],
  }),
  entry('amoonguss', 'Amoonguss', 0.09, 11, {
    abilities: [{ name: 'Regenerator', usage: 0.9 }],
    items: [{ name: 'Rocky Helmet', usage: 0.4 }],
    moves: [
      { name: 'Spore', usage: 0.95 },
      { name: 'Rage Powder', usage: 0.9 },
      { name: 'Pollen Puff', usage: 0.5 },
      { name: 'Protect', usage: 0.6 },
    ],
    spreads: [{ nature: 'Calm', sp: makeSpread({ hp: 32, spd: 32, def: 2 }), usage: 0.4 }],
  }),
  entry('landorustherian', 'Landorus-Therian', 0.16, 12, {
    abilities: [{ name: 'Intimidate', usage: 0.98 }],
    items: [{ name: 'Rocky Helmet', usage: 0.3 }],
    moves: [
      { name: 'Earthquake', usage: 0.7 },
      { name: 'Rock Slide', usage: 0.6 },
      { name: 'U-turn', usage: 0.5 },
      { name: 'Protect', usage: 0.8 },
    ],
    spreads: [{ nature: 'Impish', sp: makeSpread({ hp: 32, def: 24, spe: 10 }), usage: 0.3 }],
  }),
];
