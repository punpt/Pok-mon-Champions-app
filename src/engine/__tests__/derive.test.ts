import { describe, expect, it } from 'vitest';
import { deriveMoves } from '../presume';
import { learnsetOf } from '../../data/dex';

/**
 * Sets derivados aparecem quando a API do ladder nao trouxe os golpes daquele
 * Pokemon. Eles precisam ser reconheciveis por quem joga: base power alto
 * sozinho escolhe justamente o que ninguem usa.
 */
describe('golpes derivados do movepool', () => {
  it('nao escolhe golpes que perdem o turno seguinte', async () => {
    for (const especie of ['gholdengo', 'sylveon', 'charizard', 'garchomp']) {
      const moves = await deriveMoves(especie);
      expect(moves, `${especie}`).not.toContain('Hyper Beam');
      expect(moves, `${especie}`).not.toContain('Giga Impact');
      expect(moves, `${especie}`).not.toContain('Explosion');
      expect(moves, `${especie}`).not.toContain('Self-Destruct');
    }
  });

  it('nao escolhe golpes de carregar sem Power Herb, e passa a considerar com ele', async () => {
    const semHerb = await deriveMoves('glimmora');
    expect(semHerb).not.toContain('Meteor Beam');
    expect(semHerb).not.toContain('Solar Beam');

    const comHerb = await deriveMoves('glimmora', 'Power Herb');
    const pool = await learnsetOf('glimmora');
    // So exigimos a mudanca de criterio se a especie realmente aprende o golpe.
    if (pool.includes('Meteor Beam')) expect(comHerb).toContain('Meteor Beam');
  });

  it('evita recuo pesado mas aceita o que o formato joga', async () => {
    const basculegion = await deriveMoves('basculegion');
    // Head Smash cobra metade do dano de volta; Wave Crash, um terco.
    expect(basculegion).not.toContain('Head Smash');
    expect(basculegion).toContain('Wave Crash');
  });

  it('reserva slot para Protect, que esta em quase todo set de doubles', async () => {
    for (const especie of ['garchomp', 'incineroar', 'amoonguss']) {
      expect(await deriveMoves(especie), especie).toContain('Protect');
    }
  });

  it('prefere o lado ofensivo certo da especie', async () => {
    // Gholdengo e especial: Make It Rain deve entrar, nao um fisico qualquer.
    const gholdengo = await deriveMoves('gholdengo');
    expect(gholdengo).toContain('Make It Rain');
    expect(gholdengo).not.toContain('Steel Beam');
  });

  it('so devolve golpes que a especie realmente aprende', async () => {
    for (const especie of ['gholdengo', 'basculegion', 'kingambit', 'whimsicott']) {
      const [moves, pool] = await Promise.all([deriveMoves(especie), learnsetOf(especie)]);
      for (const m of moves) expect(pool, `${especie}: ${m}`).toContain(m);
    }
  });
});

describe('sets derivados de referencia', () => {
  // Nao exigimos o set otimo — exigimos que nenhum golpe seja daqueles que
  // fazem o jogador desconfiar do app inteiro.
  const PROIBIDOS = ['Hyper Beam', 'Giga Impact', 'Explosion', 'Self-Destruct', 'Head Smash', 'Steel Beam', 'Solar Beam', 'Phantom Force'];

  it.each([
    'gholdengo', 'basculegion', 'kingambit', 'garchomp', 'sylveon',
    'whimsicott', 'incineroar', 'rillaboom', 'sneasler', 'charizard',
    'amoonguss', 'landorustherian', 'dragonite', 'ursaluna', 'pelipper',
  ])('%s nao recebe golpe que ninguem joga', async (especie) => {
    const moves = await deriveMoves(especie);
    const ruins = moves.filter((m) => PROIBIDOS.includes(m));
    expect(ruins, `${especie} recebeu: ${ruins.join(', ')}`).toEqual([]);
    expect(moves.length).toBeGreaterThan(0);
  });
});
