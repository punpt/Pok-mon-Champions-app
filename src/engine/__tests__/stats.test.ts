import { describe, expect, it } from 'vitest';
import { Generations, Pokemon } from '@smogon/calc';
import { championsStat, natureModifier, SP_MAX_PER_STAT, spNeededForStat, spToEvs, validateSpread, makeSpread } from '../../data/stats';
import { baseStatsOf, getSpecies, NATURES } from '../../data/dex';

const gen = Generations.get(9);

describe('formula de Stat Points do Champions', () => {
  it('bate com o @smogon/calc em toda a grade de especie x nature x stat x investimento', () => {
    const mons = ['Garchomp', 'Kingambit', 'Basculegion', 'Sinistcha', 'Whimsicott', 'Charizard-Mega-Y', 'Floette-Mega', 'Sneasler', 'Blissey', 'Shuckle'];
    const natures = ['Adamant', 'Jolly', 'Modest', 'Bold', 'Timid', 'Serious'];
    const stats = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;

    let checks = 0;
    for (const mon of mons) {
      const species = getSpecies(mon);
      expect(species, `${mon} precisa existir no dex`).toBeTruthy();
      const base = baseStatsOf(species!);

      for (const natureName of natures) {
        const nature = NATURES.find((n) => n.name === natureName)!;
        for (const sp of [0, 1, 4, 12, 20, 31, 32]) {
          for (const stat of stats) {
            const pokemon = new Pokemon(gen, species!.name, {
              level: 50,
              nature: natureName,
              evs: { [stat]: sp * 8 },
              ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
            });
            const mine = championsStat(base[stat], sp, stat, natureModifier(nature.plus, nature.minus, stat));
            expect(mine, `${mon} ${natureName} ${stat} com ${sp} SP`).toBe(pokemon.rawStats[stat]);
            checks++;
          }
        }
      }
    }
    expect(checks).toBeGreaterThan(1000);
  });

  it('trata 1 SP como exatamente +1 ponto antes da nature', () => {
    const chomp = baseStatsOf(getSpecies('Garchomp')!);
    for (let sp = 0; sp < SP_MAX_PER_STAT; sp++) {
      expect(championsStat(chomp.spe, sp + 1, 'spe', 1) - championsStat(chomp.spe, sp, 'spe', 1)).toBe(1);
    }
  });

  it('converte SP para EV mantendo o total de 66 SP intacto', () => {
    const spread = makeSpread({ hp: 32, atk: 32, def: 2 });
    expect(spToEvs(spread)).toEqual({ hp: 256, atk: 256, def: 16, spa: 0, spd: 0, spe: 0 });
    // 528 EVs: acima do teto antigo de 510, que o Champions nao usa mais.
    const chomp = getSpecies('Garchomp')!;
    const p = new Pokemon(gen, chomp.name, { level: 50, nature: 'Adamant', evs: spToEvs(spread), ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } });
    expect(p.rawStats.hp).toBe(baseStatsOf(chomp).hp + 32 + 75);
  });

  it('reprova spreads que passam do teto por stat ou do total', () => {
    expect(validateSpread(makeSpread({ hp: 33 })).valid).toBe(false);
    expect(validateSpread(makeSpread({ hp: 32, atk: 32, def: 32 })).valid).toBe(false);
    expect(validateSpread(makeSpread({ hp: 32, atk: 32, def: 2 })).valid).toBe(true);
  });

  it('acha o menor investimento que atinge um alvo de stat', () => {
    const chomp = baseStatsOf(getSpecies('Garchomp')!);
    const alvo = championsStat(chomp.spe, 20, 'spe', 1.1);
    expect(spNeededForStat(chomp.spe, 'spe', 1.1, alvo)).toBe(20);
  });
});
