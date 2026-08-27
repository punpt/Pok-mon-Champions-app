import { describe, expect, it } from 'vitest';
import { META_MB } from './fixtures';
import { emptySet, battleSpecies, battleAbility, type ChampionsSet } from '../../data/set';
import { makeSpread } from '../../data/stats';
import { bestMoveAgainst, calcDamage, effectiveSpeed, movesFirst } from '../calc';
import { presumeSet } from '../presume';
import { getSpecies } from '../../data/dex';

function build(species: string, over: Partial<ChampionsSet> = {}): ChampionsSet {
  return { ...emptySet(species), ...over };
}

const KINGAMBIT = build('kingambit', {
  ability: 'Supreme Overlord',
  item: 'Black Glasses',
  nature: 'Adamant',
  sp: makeSpread({ atk: 32, hp: 24, def: 10 }),
  moves: ['Sucker Punch', 'Kowtow Cleave', 'Iron Head', 'Protect'],
});

const BASCULEGION = build('basculegion', {
  ability: 'Swift Swim',
  item: 'Choice Band',
  nature: 'Adamant',
  sp: makeSpread({ atk: 32, spe: 32, hp: 2 }),
  moves: ['Wave Crash', 'Last Respects', 'Aqua Jet', 'Protect'],
});

const GARCHOMP = build('garchomp', {
  ability: 'Rough Skin',
  item: 'Life Orb',
  nature: 'Adamant',
  sp: makeSpread({ atk: 32, spe: 32, hp: 2 }),
  moves: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'],
});

describe('motor de dano', () => {
  it('resolve Mega Evolucao pela pedra, trocando forma, tipagem e ability', () => {
    const zard = build('charizard', { item: 'Charizardite Y', ability: 'Blaze' });
    const species = battleSpecies(zard)!;
    expect(species.name).toBe('Charizard-Mega-Y');
    expect(battleAbility(zard)).toBe('Drought');

    const floette = build('floette', { item: 'Floettite' });
    expect(battleSpecies(floette)!.name).toBe('Floette-Mega');
  });

  it('aplica o corte de spread move de doubles', () => {
    const target = build('sinistcha', { nature: 'Bold', sp: makeSpread({ hp: 32, def: 32, spd: 2 }) });
    const doubles = calcDamage({ attacker: GARCHOMP, defender: target, move: 'Earthquake' });
    expect(doubles).toBeTruthy();
    // Em singles o mesmo golpe bateria bem mais forte.
    expect(doubles!.percent[1]).toBeLessThan(0.3);
  });

  it('devolve as 16 rolagens de dano', () => {
    const out = calcDamage({ attacker: KINGAMBIT, defender: BASCULEGION, move: 'Sucker Punch' });
    expect(out!.rolls.length).toBe(16);
    expect(Math.min(...out!.rolls)).toBe(out!.damage[0]);
    expect(Math.max(...out!.rolls)).toBe(out!.damage[1]);
  });

  it('confirma o caso do enunciado: Kingambit mata Basculegion com Sucker Punch mesmo sendo mais lento', () => {
    expect(effectiveSpeed(BASCULEGION)).toBeGreaterThan(effectiveSpeed(KINGAMBIT));

    const sucker = calcDamage({ attacker: KINGAMBIT, defender: BASCULEGION, move: 'Sucker Punch' });
    expect(sucker!.percent[0]).toBeGreaterThanOrEqual(1);

    // Prioridade vence a Speed na ordem de acao.
    const ordem = movesFirst(
      { set: KINGAMBIT, move: 'Sucker Punch' },
      { set: BASCULEGION, move: 'Wave Crash' },
    );
    expect(ordem).toBe('a');
  });

  it('inverte a ordem de acao sob Trick Room', () => {
    const semTr = movesFirst({ set: BASCULEGION, move: 'Wave Crash' }, { set: KINGAMBIT, move: 'Iron Head' }, false);
    const comTr = movesFirst({ set: BASCULEGION, move: 'Wave Crash' }, { set: KINGAMBIT, move: 'Iron Head' }, true);
    expect(semTr).toBe('a');
    expect(comTr).toBe('b');
  });

  it('aplica Choice Scarf e Tailwind na velocidade efetiva', () => {
    const base = effectiveSpeed(GARCHOMP);
    const scarf = effectiveSpeed({ ...GARCHOMP, item: 'Choice Scarf' });
    const tailwind = effectiveSpeed(GARCHOMP, { attackerTailwind: true });
    expect(scarf).toBe(Math.floor(base * 1.5));
    expect(tailwind).toBe(base * 2);
  });
});

describe('reconstrucao de set presumido', () => {
  it('usa os dados reais da API quando existem', async () => {
    const entry = META_MB.find((e) => e.id === 'kingambit')!;
    const presumido = await presumeSet('kingambit', entry);
    expect(presumido.provenance).toBe('meta');
    expect(presumido.set.moves).toContain('Sucker Punch');
    expect(presumido.set.ability).toBe('Supreme Overlord');
    expect(presumido.set.moveOdds?.['Sucker Punch']).toBeGreaterThan(0.9);
  });

  it('deriva um set plausivel do movepool quando a API nao tem o Pokemon', async () => {
    const presumido = await presumeSet('sneasler', null);
    expect(presumido.provenance).toBe('derivado');
    expect(presumido.set.moves.length).toBeGreaterThan(0);
    expect(getSpecies('sneasler')).toBeTruthy();
    expect(bestMoveAgainst(presumido.set, KINGAMBIT)).toBeTruthy();
  });

  it('so escolhe golpes que a especie realmente aprende', async () => {
    const presumido = await presumeSet('kingambit', null);
    const { learnsetOf } = await import('../../data/dex');
    const pool = await learnsetOf('kingambit');
    for (const m of presumido.set.moves) expect(pool).toContain(m);
  });
});
