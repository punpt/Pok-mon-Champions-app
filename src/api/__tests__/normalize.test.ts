import { describe, expect, it } from 'vitest';
import { decideUsageScale, toSpSpread, toWeightedNames, toMetaSpreads } from '../normalize';

describe('escala do usage', () => {
  // Ladder por time: cada time leva 6, entao a soma passa de 100%.
  const porTime = [0.31, 0.24, 0.21, 0.19, 0.18, 0.17, 0.16, 0.14, 0.12, 0.11, 0.1, 0.09];
  // Mesma distribuicao publicada como participacao de slot: 6x menor.
  const porSlot = porTime.map((u) => u / 6);

  it('reconhece a escala por time e nao mexe nos numeros', () => {
    const d = decideUsageScale(porTime, 6);
    expect(d.mode).toBe('times');
    expect(d.factor).toBe(1);
  });

  it('reconhece a escala por slot e devolve a escala por time', () => {
    const d = decideUsageScale(porSlot, 6);
    expect(d.mode).toBe('slots');
    expect(d.factor).toBe(6);
    // O caso do relato: ~6.7% por slot vira ~40% por time.
    expect(porSlot[0] * d.factor).toBeCloseTo(porTime[0], 5);
  });

  it('respeita a escolha manual sobre a deteccao automatica', () => {
    expect(decideUsageScale(porSlot, 6, 'times').factor).toBe(1);
    expect(decideUsageScale(porTime, 6, 'slots').factor).toBe(6);
    expect(decideUsageScale(porSlot, 6, 'times').automatic).toBe(false);
  });

  it('nao arrisca palpite com lista curta demais para decidir', () => {
    expect(decideUsageScale([0.3, 0.2, 0.1], 6).mode).toBe('times');
  });
});

describe('leitura tolerante de payload', () => {
  it('aceita as formas conhecidas de lista ponderada', () => {
    const objetos = toWeightedNames([{ move: 'Protect', percent: 70 }, { move: 'Fake Out', percent: 30 }]);
    expect(objetos[0]).toEqual({ name: 'Protect', usage: 0.7 });

    const mapa = toWeightedNames({ Protect: 0.7, 'Fake Out': 0.3 });
    expect(mapa[0].name).toBe('Protect');

    const pares = toWeightedNames([['Protect', 70], ['Fake Out', 30]]);
    expect(pares[0].usage).toBeCloseTo(0.7, 5);
  });

  it('preserva a ordem quando a fonte manda so nomes, sem peso', () => {
    const r = toWeightedNames(['Sucker Punch', 'Kowtow Cleave', 'Iron Head']);
    expect(r.map((x) => x.name)).toEqual(['Sucker Punch', 'Kowtow Cleave', 'Iron Head']);
    expect(r[0].usage).toBeGreaterThan(r[2].usage);
  });

  it('distingue spread em EVs de spread ja em Stat Points', () => {
    // 252 EVs equivalem a 32 SP: no nivel 50 os dois produzem o mesmo stat,
    // porque o EV entra na formula dividido por 4 e depois pela metade.
    const evs = toSpSpread('0/252/0/0/4/252');
    expect(evs).toEqual({ hp: 0, atk: 32, def: 0, spa: 0, spd: 1, spe: 32 });

    const sp = toSpSpread('2/32/0/0/0/32');
    expect(sp).toEqual({ hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 });
  });

  it('separa nature de spread na notacao do Showdown', () => {
    const r = toMetaSpreads(['Adamant:8/256/0/0/0/256']);
    expect(r[0].nature).toBe('Adamant');
    expect(r[0].sp.atk).toBe(32);
    expect(r[0].sp.spe).toBe(32);
  });
});
