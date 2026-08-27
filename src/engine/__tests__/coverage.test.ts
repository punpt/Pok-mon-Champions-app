import { describe, expect, it } from 'vitest';
import { computeCoverage } from '../coverage';
import { emptySet, type ChampionsSet } from '../../data/set';
import { makeSpread } from '../../data/stats';

function build(species: string, moves: string[], item = ''): ChampionsSet {
  return { ...emptySet(species), moves, item, sp: makeSpread({ atk: 32, spe: 32, hp: 2 }) };
}

describe('cobertura ofensiva', () => {
  it('acusa a falta de resposta a Fada e reconhece quando ela chega', () => {
    // Garchomp sozinho: Terra, Dragao e Pedra. Nada bate Fada.
    const semResposta = computeCoverage([build('garchomp', ['Earthquake', 'Dragon Claw', 'Rock Slide'])]);
    expect(semResposta.offensiveGaps).toContain('Fairy');
    // Com um Pokemon so ha buraco demais para caber na frase; o resumo diz
    // quantos sao e mostra os primeiros.
    expect(semResposta.offensiveSummary).toMatch(/tipos sem resposta/);

    // Gholdengo entra com Make It Rain, que e Aco: passa a bater Fada.
    const comResposta = computeCoverage([
      build('garchomp', ['Earthquake', 'Dragon Claw', 'Rock Slide']),
      build('gholdengo', ['Make It Rain', 'Shadow Ball']),
    ]);
    expect(comResposta.offensiveGaps).not.toContain('Fairy');
    const fada = comResposta.offensive.find((o) => o.type === 'Fairy')!;
    expect(fada.sources[0].move).toBe('Make It Rain');
    expect(fada.best).toBe(2);
  });

  it('marca cobertura otima quando dois membros batem forte no mesmo tipo', () => {
    const c = computeCoverage([
      build('gholdengo', ['Make It Rain']),
      build('kingambit', ['Iron Head']),
    ]);
    const fada = c.offensive.find((o) => o.type === 'Fairy')!;
    expect(fada.sources.length).toBe(2);
    expect(fada.grade).toBe('otima');
  });

  it('ignora golpes de status na conta ofensiva', () => {
    const c = computeCoverage([build('whimsicott', ['Tailwind', 'Encore', 'Protect'])]);
    expect(c.offensive.every((o) => o.sources.length === 0)).toBe(true);
  });
});

describe('cobertura defensiva', () => {
  it('lista as fraquezas do time por tipo atacante', () => {
    // Garchomp e fraco a Gelo (4x), Fada e Dragao.
    const c = computeCoverage([build('garchomp', ['Earthquake'])]);
    const gelo = c.defensive.find((d) => d.type === 'Ice')!;
    expect(gelo.weak.length).toBe(1);
    expect(gelo.weak[0].multiplier).toBe(4);
    expect(gelo.resists.length).toBe(0);
  });

  it('aponta o buraco quando dois sofrem e ninguem resiste', () => {
    // Garchomp e Landorus: os dois voam pela mesma fraqueza a Gelo.
    const c = computeCoverage([
      build('garchomp', ['Earthquake']),
      build('landorustherian', ['Earthquake']),
    ]);
    expect(c.defensiveHoles).toContain('Ice');
    expect(c.defensiveSummary).toMatch(/Ice/);
  });

  it('deixa de acusar buraco quando alguem resiste o tipo', () => {
    const c = computeCoverage([
      build('garchomp', ['Earthquake']),
      build('landorustherian', ['Earthquake']),
      // Aco resiste Gelo.
      build('gholdengo', ['Make It Rain']),
    ]);
    expect(c.defensiveHoles).not.toContain('Ice');
    const gelo = c.defensive.find((d) => d.type === 'Ice')!;
    expect(gelo.resists.length).toBe(1);
  });

  it('pesa fraqueza de 4x mais que a de 2x', () => {
    const quatroX = computeCoverage([build('garchomp', ['Earthquake'])]);
    const doisX = computeCoverage([build('kingambit', ['Iron Head'])]);
    const geloChomp = quatroX.defensive.find((d) => d.type === 'Ice')!;
    const fogoGambit = doisX.defensive.find((d) => d.type === 'Fire')!;
    expect(geloChomp.pressure).toBeGreaterThan(fogoGambit.pressure);
  });

  it('reconhece Mega Evolucao que muda a tipagem', () => {
    // Charizard normal e fraco a Pedra (4x). Como Mega X vira Fogo/Dragao,
    // Pedra cai para 2x — a tipagem de batalha e que vale.
    const normal = computeCoverage([build('charizard', ['Heat Wave'])]);
    const megaX = computeCoverage([build('charizard', ['Heat Wave'], 'Charizardite X')]);
    expect(normal.defensive.find((d) => d.type === 'Rock')!.weak[0].multiplier).toBe(4);
    expect(megaX.defensive.find((d) => d.type === 'Rock')!.weak[0].multiplier).toBe(2);
  });
});
