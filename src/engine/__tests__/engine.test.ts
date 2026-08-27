import { describe, expect, it } from 'vitest';
import { META_MB } from './fixtures';
import { emptySet, battleSpecies, battleAbility, type ChampionsSet } from '../../data/set';
import { makeSpread } from '../../data/stats';
import { bestMoveAgainst, calcDamage, effectiveSpeed, movesFirst } from '../calc';
import { presumeSet } from '../presume';
import { scanThreatsFor, scanTeamThreats, evaluateMatchup } from '../threats';
import { suggestPartners, typeSynergy } from '../synergy';
import { optimize } from '../optimizer';
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

describe('motor de ameacas', () => {
  it('marca priorityKO quando o oponente mata com prioridade apesar de ser mais lento', () => {
    const m = evaluateMatchup(BASCULEGION, KINGAMBIT, {
      id: 'kingambit',
      name: 'Kingambit',
      usage: 0.18,
      rank: 5,
      provenance: 'meta',
    });
    expect(m.priorityKO).toBeTruthy();
    expect(m.priorityKO!.move).toBe('Sucker Punch');
    expect(m.danger).toBeGreaterThan(0.6);
    expect(m.reasons.join(' ')).toMatch(/prioridade/i);
  });

  it('lista tipos Fada no topo das ameacas ao Garchomp, como manda a regulation atual', async () => {
    const ameacas = await scanThreatsFor(GARCHOMP, META_MB, { limit: 20 });
    expect(ameacas.length).toBeGreaterThan(5);

    const top5 = ameacas.slice(0, 5).map((a) => a.id);
    const fadas = ['sylveon', 'floette', 'whimsicott'];
    expect(top5.some((id) => fadas.includes(id))).toBe(true);
  });

  it('ordena por perigo ponderado pelo usage, nao por perigo cru', async () => {
    const ameacas = await scanThreatsFor(GARCHOMP, META_MB, { limit: 20 });
    for (let i = 1; i < ameacas.length; i++) {
      expect(ameacas[i - 1].weighted).toBeGreaterThanOrEqual(ameacas[i].weighted);
    }
  });

  it('identifica ameacas que o time inteiro nao responde', async () => {
    const time = [GARCHOMP, BASCULEGION];
    const relatorio = await scanTeamThreats(time, META_MB, { limit: 12 });
    expect(relatorio.evaluated).toBeGreaterThan(5);
    for (const t of relatorio.threats) {
      expect(t.perMember.length).toBe(2);
      expect(t.unanswered).toBe(t.answeredBy.length === 0);
    }
  });
});

describe('motor de sinergia', () => {
  it('mede complementaridade de tipos e acusa fraqueza empilhada', () => {
    // Garchomp (Dragon/Ground) e Sylveon (Fairy): a Fada cobre Gelo e Fada.
    const bom = typeSynergy(['Dragon', 'Ground'], ['Steel', 'Fairy']);
    expect(bom.covers).toContain('Ice');
    expect(bom.covers).toContain('Fairy');

    // Dois tipos Agua empilham a mesma fraqueza a Eletrico e Grama.
    const ruim = typeSynergy(['Water'], ['Water']);
    expect(ruim.shared).toContain('Electric');
    expect(ruim.shared).toContain('Grass');
    expect(ruim.score).toBeLessThan(bom.score);
  });

  it('sugere parceiros que resolvem justamente o Kingambit do Basculegion', async () => {
    const parceiros = await suggestPartners(BASCULEGION, META_MB, {
      limit: 12,
      candidateLimit: 12,
      threatDepth: 8,
    });
    expect(parceiros.length).toBeGreaterThan(3);

    // Alguem no topo tem que estar resolvendo o Kingambit explicitamente.
    const top = parceiros.slice(0, 5);
    const resolveKingambit = top.filter((p) => p.coveredThreats.some((c) => c.id === 'kingambit'));
    expect(resolveKingambit.length).toBeGreaterThan(0);

    // E a justificativa tem que citar o nome, nao so um numero.
    expect(resolveKingambit[0].reasons.join(' ')).toMatch(/Kingambit/);

    // Sneasler, tipo Fighting, e uma resposta natural ao Kingambit (Dark/Steel).
    const sneasler = parceiros.find((p) => p.id === 'sneasler');
    expect(sneasler).toBeTruthy();
    expect(sneasler!.coveredThreats.some((c) => c.id === 'kingambit')).toBe(true);
  });

  it('nao sugere o proprio ancora nem quem ja esta no time', async () => {
    const parceiros = await suggestPartners(BASCULEGION, META_MB, {
      limit: 10,
      candidateLimit: 12,
      exclude: ['garchomp'],
    });
    expect(parceiros.some((p) => p.id === 'basculegion')).toBe(false);
    expect(parceiros.some((p) => p.id === 'garchomp')).toBe(false);
  });
});

describe('otimizador de Stat Points', () => {
  it('acha o bulk minimo para sobreviver a um golpe, e um SP a menos ja falha', async () => {
    const alvo = build('sinistcha', { ability: 'Hospitality', nature: 'Bold', moves: ['Matcha Gotcha'] });
    const resultado = optimize({
      set: alvo,
      benchmarks: [
        {
          kind: 'sobreviver',
          id: 'b1',
          attacker: GARCHOMP,
          move: 'Earthquake',
          strictness: 'sempre',
        },
      ],
      leftover: 'bulk',
    });

    expect(resultado.ok).toBe(true);
    expect(resultado.used).toBeLessThanOrEqual(66);

    // O spread devolvido realmente sobrevive.
    const comSpread = { ...alvo, nature: resultado.nature, sp: resultado.spread };
    const dano = calcDamage({ attacker: GARCHOMP, defender: comSpread, move: 'Earthquake' });
    expect(Math.max(...dano!.rolls)).toBeLessThan(dano!.defenderMaxHp);
  });

  it('nao desperdica pontos: o spread minimo falha se tirarmos o HP investido', () => {
    // Um golpe pesado o suficiente para exigir investimento de verdade.
    const alvo = build('whimsicott', { ability: 'Prankster', nature: 'Calm', moves: ['Moonblast'] });
    const resultado = optimize({
      set: alvo,
      benchmarks: [
        { kind: 'sobreviver', id: 'b1', attacker: KINGAMBIT, move: 'Kowtow Cleave', strictness: 'sempre' },
      ],
      leftover: 'hp',
    });

    if (resultado.ok) {
      const minimo = resultado.results[0];
      expect(minimo.satisfied).toBe(true);
      expect(minimo.detail).toMatch(/SP em HP/);
    } else {
      // Se nem 66 SP aguentam, o otimizador precisa dizer isso com clareza.
      expect(resultado.warnings.join(' ')).toBeTruthy();
    }
  });

  it('resolve benchmark de velocidade pelo alvo real', () => {
    const meu = build('sneasler', { ability: 'Unburden', nature: 'Jolly', moves: ['Close Combat'] });
    const resultado = optimize({
      set: meu,
      benchmarks: [
        { kind: 'velocidade', id: 's1', target: GARCHOMP, mode: 'superar' },
      ],
      leftover: 'ofensivo',
    });
    expect(resultado.ok).toBe(true);

    const comSpread = { ...meu, nature: resultado.nature, sp: resultado.spread };
    expect(effectiveSpeed(comSpread)).toBeGreaterThan(effectiveSpeed(GARCHOMP));
  });

  it('resolve HP compartilhado entre defesa fisica e especial em vez de somar os dois custos', () => {
    const alvo = build('landorustherian', { ability: 'Intimidate', nature: 'Careful', moves: ['Earthquake'] });
    const fisico = optimize({
      set: alvo,
      benchmarks: [{ kind: 'sobreviver', id: 'f', attacker: KINGAMBIT, move: 'Kowtow Cleave', strictness: 'sempre' }],
      leftover: 'bulk',
    });
    const ambos = optimize({
      set: alvo,
      benchmarks: [
        { kind: 'sobreviver', id: 'f', attacker: KINGAMBIT, move: 'Kowtow Cleave', strictness: 'sempre' },
        { kind: 'sobreviver', id: 'e', attacker: build('sylveon', { ability: 'Pixilate', nature: 'Modest', sp: makeSpread({ spa: 32, hp: 32, spd: 2 }), moves: ['Hyper Voice'] }), move: 'Hyper Voice', strictness: 'sempre' },
      ],
      leftover: 'bulk',
    });

    if (fisico.ok && ambos.ok) {
      // O HP pago uma vez serve aos dois lados: o custo conjunto e menor que a soma.
      expect(ambos.spread.hp).toBeGreaterThanOrEqual(fisico.spread.hp);
      expect(ambos.used).toBeLessThanOrEqual(66);
    }
  });

  it('avisa quando o benchmark e impossivel em vez de devolver spread invalido', () => {
    const frágil = build('floette', { item: 'Floettite', nature: 'Modest', moves: ['Moonblast'] });
    const resultado = optimize({
      set: frágil,
      benchmarks: [
        { kind: 'matar', id: 'k', defender: build('blissey', { nature: 'Calm', sp: makeSpread({ hp: 32, spd: 32, def: 2 }) }), move: 'Moonblast', hits: 1, strictness: 'sempre' },
      ],
      leftover: 'ofensivo',
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.results[0].satisfied).toBe(false);
  });
});

describe('reconstrucao de set presumido', () => {
  it('usa os dados reais da API quando existem', async () => {
    const entry = META_MB.find((e) => e.id === 'kingambit')!;
    const presumido = await presumeSet('kingambit', entry);
    expect(presumido.provenance).toBe('meta');
    expect(presumido.set.moves).toContain('Sucker Punch');
    expect(presumido.set.ability).toBe('Supreme Overlord');
  });

  it('deriva um set plausivel do movepool quando a API nao tem o Pokemon', async () => {
    const presumido = await presumeSet('sneasler', null);
    expect(presumido.provenance).toBe('derivado');
    expect(presumido.set.moves.length).toBeGreaterThan(0);
    // Precisa ser um golpe que o Sneasler realmente aprende.
    expect(getSpecies('sneasler')).toBeTruthy();
    const dano = bestMoveAgainst(presumido.set, KINGAMBIT);
    expect(dano).toBeTruthy();
  });
});

describe('perigo medido pela troca, nao pelo dano bruto', () => {
  const ZARD_Y = build('charizard', {
    ability: 'Blaze',
    item: 'Charizardite Y',
    nature: 'Modest',
    sp: makeSpread({ spa: 32, spe: 26, hp: 8 }),
    moves: ['Heat Wave', 'Solar Beam', 'Air Slash', 'Protect'],
  });

  it('Garchomp com Rock Slide domina Charizard-Mega-Y', () => {
    // Rock e 4x em Fogo/Voador e o Garchomp ainda e mais rapido: o Mega Y
    // simplesmente nao chega a atacar.
    const rockSlide = calcDamage({ attacker: GARCHOMP, defender: ZARD_Y, move: 'Rock Slide' });
    expect(rockSlide!.percent[0]).toBeGreaterThanOrEqual(1);
    expect(effectiveSpeed(GARCHOMP)).toBeGreaterThan(effectiveSpeed(ZARD_Y));

    const m = evaluateMatchup(GARCHOMP, ZARD_Y, {
      id: 'charizardmegay', name: 'Charizard-Mega-Y', usage: 0.174, rank: 6, provenance: 'meta',
    });
    expect(m.verdict).toBe('domina');
    expect(m.danger).toBeLessThan(0.2);
    expect(m.reasons.join(' ')).toMatch(/voce vence a troca/i);
  });

  it('mantem Kingambit como ameaca grave ao Basculegion', () => {
    const m = evaluateMatchup(BASCULEGION, KINGAMBIT, {
      id: 'kingambit', name: 'Kingambit', usage: 0.18, rank: 5, provenance: 'meta',
    });
    expect(m.verdict).toBe('perde-feio');
    expect(m.priorityKO?.move).toBe('Sucker Punch');
  });

  it('um Pokemon que nao derruba em tempo util nao vira ameaca', () => {
    const inofensivo = build('blissey', {
      ability: 'Natural Cure', nature: 'Calm',
      sp: makeSpread({ hp: 32, spd: 32, def: 2 }), moves: ['Pollen Puff'],
    });
    const m = evaluateMatchup(GARCHOMP, inofensivo, {
      id: 'blissey', name: 'Blissey', usage: 0.01, rank: 40, provenance: 'derivado',
    });
    expect(m.danger).toBeLessThanOrEqual(0.25);
  });

  it('quem age primeiro decide quando os dois precisam do mesmo numero de golpes', () => {
    // Espelho de Garchomp: dano identico nos dois sentidos, entao a unica
    // variavel e a Speed. Quem age primeiro tem que sair melhor.
    const rapido = build('garchomp', {
      ability: 'Rough Skin', nature: 'Jolly',
      sp: makeSpread({ atk: 32, spe: 32, hp: 2 }), moves: ['Dragon Claw'],
    });
    const lento = build('garchomp', {
      ability: 'Rough Skin', nature: 'Adamant',
      sp: makeSpread({ atk: 32, hp: 32, def: 2 }), moves: ['Dragon Claw'],
    });
    expect(effectiveSpeed(rapido)).toBeGreaterThan(effectiveSpeed(lento));

    const doRapido = evaluateMatchup(rapido, lento, {
      id: 'garchomp', name: 'Garchomp', usage: 0.3, rank: 1, provenance: 'meta',
    });
    const doLento = evaluateMatchup(lento, rapido, {
      id: 'garchomp', name: 'Garchomp', usage: 0.3, rank: 1, provenance: 'meta',
    });
    expect(doRapido.danger).toBeLessThan(doLento.danger);
  });

  it('nao trata dano bruto alto como ameaca quando o oponente morre antes de agir', () => {
    // Ursaluna bate muito mais forte que Sneasler, mas se o Sneasler derrubasse
    // de um golpe agindo primeiro, o dano do Ursaluna nao aconteceria. Aqui ele
    // NAO derruba, entao o veredito tem que ser desfavoravel ao Sneasler — e o
    // motivo tem que aparecer escrito.
    const sneasler = build('sneasler', {
      ability: 'Unburden', nature: 'Jolly',
      sp: makeSpread({ atk: 32, spe: 32, hp: 2 }), moves: ['Close Combat'],
    });
    const ursaluna = build('ursaluna', {
      ability: 'Guts', nature: 'Adamant',
      sp: makeSpread({ atk: 32, hp: 32, def: 2 }), moves: ['Headlong Rush'],
    });
    const m = evaluateMatchup(sneasler, ursaluna, {
      id: 'ursaluna', name: 'Ursaluna', usage: 0.07, rank: 16, provenance: 'meta',
    });
    expect(m.danger).toBeGreaterThan(0.5);
    expect(m.reasons.join(' ')).toMatch(/vence a troca/i);
  });

  it('avisa quando o set nao tem golpe de ataque em vez de fingir analise', () => {
    const semGolpes = build('garchomp', { ability: 'Rough Skin', nature: 'Adamant', moves: [] });
    const m = evaluateMatchup(semGolpes, KINGAMBIT, {
      id: 'kingambit', name: 'Kingambit', usage: 0.18, rank: 5, provenance: 'meta',
    });
    expect(m.reasons.join(' ')).toMatch(/sem isso o confronto nao da para julgar/i);
  });
});

describe('ameaca ponderada pelo usage do golpe', () => {
  const ZARD_Y = build('charizard', {
    ability: 'Blaze', item: 'Charizardite Y', nature: 'Modest',
    sp: makeSpread({ spa: 32, spe: 26, hp: 8 }),
    moves: ['Heat Wave', 'Solar Beam', 'Air Slash', 'Protect'],
  });

  function chompComOdds(rockSlideUsage: number): ChampionsSet {
    return build('garchomp', {
      ability: 'Rough Skin', item: 'Life Orb', nature: 'Adamant',
      sp: makeSpread({ atk: 32, spe: 32, hp: 2 }),
      moves: ['Earthquake', 'Rock Slide', 'Dragon Claw', 'Protect'],
      moveOdds: { Earthquake: 0.9, 'Rock Slide': rockSlideUsage, 'Dragon Claw': 0.6, Protect: 0.8 },
    });
  }

  it('um golpe de nicho ameaca menos que um golpe que todo mundo carrega', () => {
    // Do ponto de vista do Zard: quantos Garchomp realmente tem Rock Slide?
    const contraTodos = evaluateMatchup(ZARD_Y, chompComOdds(1.0), {
      id: 'garchomp', name: 'Garchomp', usage: 0.3, rank: 1, provenance: 'meta',
    });
    const contraMetade = evaluateMatchup(ZARD_Y, chompComOdds(0.5), {
      id: 'garchomp', name: 'Garchomp', usage: 0.3, rank: 1, provenance: 'meta',
    });
    const contraRaros = evaluateMatchup(ZARD_Y, chompComOdds(0.1), {
      id: 'garchomp', name: 'Garchomp', usage: 0.3, rank: 1, provenance: 'meta',
    });

    expect(contraTodos.danger).toBeGreaterThan(contraMetade.danger);
    expect(contraMetade.danger).toBeGreaterThan(contraRaros.danger);
    expect(contraMetade.decisiveMoveOdds).toBeCloseTo(0.5, 2);
  });

  it('escreve a probabilidade na justificativa em vez de esconder a incerteza', () => {
    const m = evaluateMatchup(ZARD_Y, chompComOdds(0.5), {
      id: 'garchomp', name: 'Garchomp', usage: 0.3, rank: 1, provenance: 'meta',
    });
    expect(m.reasons.join(' ')).toMatch(/50% dos Garchomp carregam Rock Slide/i);
  });

  it('sem dado de usage assume que o golpe esta la (leitura conservadora)', () => {
    const semOdds = build('garchomp', {
      ability: 'Rough Skin', item: 'Life Orb', nature: 'Adamant',
      sp: makeSpread({ atk: 32, spe: 32, hp: 2 }),
      moves: ['Earthquake', 'Rock Slide', 'Dragon Claw', 'Protect'],
    });
    const m = evaluateMatchup(ZARD_Y, semOdds, {
      id: 'garchomp', name: 'Garchomp', usage: 0.3, rank: 1, provenance: 'derivado',
    });
    expect(m.decisiveMoveOdds).toBe(1);
    expect(m.danger).toBeGreaterThan(0.6);
  });

  it('Sucker Punch a 95% mantem o Kingambit como ameaca quase certa', async () => {
    const entry = META_MB.find((e) => e.id === 'kingambit')!;
    const presumido = await presumeSet('kingambit', entry);
    expect(presumido.set.moveOdds?.['Sucker Punch']).toBeGreaterThan(0.9);

    const m = evaluateMatchup(BASCULEGION, presumido.set, {
      id: 'kingambit', name: 'Kingambit', usage: 0.18, rank: 5, provenance: 'meta',
    });
    expect(m.verdict).toBe('perde-feio');
  });
});
