import { describe, expect, it } from 'vitest';
import { learnsetOf } from '../dex';

describe('movepool herdado da cadeia evolutiva', () => {
  it('Kingambit conhece Sucker Punch, que quem ensina e o Pawniard', async () => {
    const moves = await learnsetOf('kingambit');
    expect(moves).toContain('Sucker Punch');
    expect(moves).toContain('Kowtow Cleave');
    expect(moves).toContain('Iron Head');
  });

  it('recolhe o movepool de toda a linha, nao so do estagio final', async () => {
    const [kingambit, bisharp, pawniard] = await Promise.all([
      learnsetOf('kingambit'),
      learnsetOf('bisharp'),
      learnsetOf('pawniard'),
    ]);
    // A invariante estrutural: cada estagio contem tudo que o anterior aprende.
    for (const m of pawniard) expect(bisharp).toContain(m);
    for (const m of bisharp) expect(kingambit).toContain(m);
    expect(kingambit.length).toBeGreaterThanOrEqual(bisharp.length);
  });

  it('Megas herdam o movepool da forma base', async () => {
    const [base, mega] = await Promise.all([learnsetOf('charizard'), learnsetOf('charizardmegay')]);
    expect(mega.length).toBe(base.length);
    expect(mega).toContain('Heat Wave');
  });
});

/**
 * Varredura ampla.
 *
 * Sucker Punch no Kingambit foi so o caso que apareceu primeiro. Como a causa
 * era estrutural — nao subir a cadeia de evolucao —, ela atingia todo Pokemon
 * completamente evoluido. Esta lista cobre golpes que qualquer jogador do
 * formato espera encontrar, boa parte deles aprendida por uma pre-evolucao.
 */
describe('varredura de golpes que o formato espera', () => {
  const CASOS: [string, string[]][] = [
    ['garchomp', ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect', 'Swords Dance', 'Stealth Rock']],
    ['kingambit', ['Sucker Punch', 'Kowtow Cleave', 'Iron Head', 'Swords Dance', 'Protect']],
    ['incineroar', ['Fake Out', 'Knock Off', 'Parting Shot', 'Flare Blitz', 'Will-O-Wisp', 'Protect']],
    ['amoonguss', ['Spore', 'Rage Powder', 'Pollen Puff', 'Protect', 'Clear Smog']],
    ['rillaboom', ['Fake Out', 'Grassy Glide', 'Wood Hammer', 'U-turn', 'Protect']],
    ['whimsicott', ['Tailwind', 'Encore', 'Moonblast', 'Protect', 'Beat Up']],
    ['basculegion', ['Wave Crash', 'Last Respects', 'Aqua Jet', 'Protect']],
    ['sneasler', ['Close Combat', 'Dire Claw', 'Fake Out', 'Protect', 'Swords Dance']],
    ['gholdengo', ['Make It Rain', 'Shadow Ball', 'Nasty Plot', 'Protect', 'Thunder Wave']],
    ['landorustherian', ['Earthquake', 'Rock Slide', 'U-turn', 'Protect', 'Swords Dance']],
    ['charizard', ['Heat Wave', 'Air Slash', 'Solar Beam', 'Protect', 'Overheat']],
    ['sylveon', ['Hyper Voice', 'Moonblast', 'Protect', 'Helping Hand', 'Calm Mind']],
    ['sinistcha', ['Matcha Gotcha', 'Shadow Ball', 'Rage Powder', 'Trick Room', 'Protect']],
    ['tornadustherian', ['Bleakwind Storm', 'Tailwind', 'Taunt', 'Rain Dance', 'Protect']],
    ['ursaluna', ['Facade', 'Headlong Rush', 'Protect', 'Swords Dance']],
    ['pelipper', ['Hurricane', 'Weather Ball', 'Tailwind', 'Protect', 'Wide Guard']],
    ['dragonite', ['Extreme Speed', 'Dragon Dance', 'Protect', 'Tailwind', 'Dragon Claw']],
    ['glimmora', ['Meteor Beam', 'Sludge Bomb', 'Earth Power', 'Spiky Shield', 'Stealth Rock']],
    ['torkoal', ['Eruption', 'Heat Wave', 'Protect', 'Body Press', 'Yawn']],
    // Follow Me e exclusivo da forma femea: as duas formas sao Pokemon distintos no formato.
    ['indeedeef', ['Follow Me', 'Psychic', 'Helping Hand', 'Protect', 'Trick Room']],
    ['indeedee', ['Psychic', 'Helping Hand', 'Protect', 'Expanding Force']],
  ];

  it.each(CASOS)('%s conhece os golpes esperados', async (especie, esperados) => {
    const moves = await learnsetOf(especie);
    const faltando = esperados.filter((m) => !moves.includes(m));
    expect(faltando, `${especie} sem: ${faltando.join(', ')}`).toEqual([]);
  });

  it('so oferece golpes alcancaveis na geracao do formato', async () => {
    // Indeedee lista 57 golpes somando todas as geracoes, mas so 44 continuam
    // obteniveis. Oferecer os outros 13 seria montar um set impossivel.
    const moves = await learnsetOf('indeedee');
    expect(moves.length).toBeLessThan(50);
    // Golpes de geracoes antigas que o Indeedee nao alcanca mais.
    expect(moves).not.toContain('Hidden Power');
  });

  it('nenhum Pokemon completamente evoluido perde o movepool da sua linha', async () => {
    // Numero absoluto nao serve de criterio: Gholdengo tem 45 golpes legais e
    // esta certo. O que importa e a linha evolutiva estar inteira, entao
    // comparamos cada estagio final com a sua pre-evolucao.
    const LINHAS: [string, string][] = [
      ['kingambit', 'bisharp'],
      ['incineroar', 'torracat'],
      ['rillaboom', 'thwackey'],
      ['dragonite', 'dragonair'],
      ['gholdengo', 'gimmighoul'],
    ];
    for (const [final, anterior] of LINHAS) {
      const [a, b] = await Promise.all([learnsetOf(final), learnsetOf(anterior)]);
      const faltando = b.filter((m) => !a.includes(m));
      expect(faltando, `${final} nao herdou de ${anterior}: ${faltando.join(', ')}`).toEqual([]);
    }
  });
});
