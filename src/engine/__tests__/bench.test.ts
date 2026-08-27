import { describe, expect, it } from 'vitest';
import { META_MB } from './fixtures';
import { emptySet, type ChampionsSet } from '../../data/set';
import { makeSpread } from '../../data/stats';
import { scanThreatsFor, scanTeamThreats } from '../threats';
import { suggestPartners } from '../synergy';

function build(species: string, over: Partial<ChampionsSet> = {}): ChampionsSet {
  return { ...emptySet(species), ...over };
}

const BASCULEGION = build('basculegion', {
  ability: 'Swift Swim',
  item: 'Choice Band',
  nature: 'Adamant',
  sp: makeSpread({ atk: 32, spe: 32, hp: 2 }),
  moves: ['Wave Crash', 'Last Respects', 'Aqua Jet', 'Protect'],
});

// Recorte inflado ate o tamanho de um ladder real (~120 Pokemon).
const BIG = Array.from({ length: 10 }, (_, k) =>
  META_MB.map((e, i) => ({ ...e, rank: k * META_MB.length + i + 1, usage: e.usage / (k + 1) })),
).flat();

describe('desempenho dos motores', () => {
  it('ameacas de um Pokemon contra 60 do ladder', async () => {
    const t0 = performance.now();
    const r = await scanThreatsFor(BASCULEGION, BIG, { limit: 60 });
    const ms = performance.now() - t0;
    console.log(`  scanThreatsFor(60): ${ms.toFixed(0)}ms para ${r.length} matchups`);
    expect(ms).toBeLessThan(8000);
  });

  it('ameacas ao time de 6 contra 50 do ladder', async () => {
    const time = ['garchomp', 'sinistcha', 'whimsicott', 'kingambit', 'sneasler', 'rillaboom'].map((s) =>
      build(s, { moves: ['Protect'], sp: makeSpread({ hp: 32, atk: 32, def: 2 }) }),
    );
    const t0 = performance.now();
    const r = await scanTeamThreats(time, BIG, { limit: 50 });
    const ms = performance.now() - t0;
    console.log(`  scanTeamThreats(50 x 6): ${ms.toFixed(0)}ms para ${r.evaluated} ameacas`);
    expect(ms).toBeLessThan(20000);
  });

  it('sugestao de parceiros (o caminho mais pesado)', async () => {
    const t0 = performance.now();
    const r = await suggestPartners(BASCULEGION, BIG, { limit: 45, candidateLimit: 50, threatDepth: 12 });
    const ms = performance.now() - t0;
    console.log(`  suggestPartners(50 candidatos x 12 ameacas): ${ms.toFixed(0)}ms para ${r.length} sugestoes`);
    expect(ms).toBeLessThan(30000);
  });
});
