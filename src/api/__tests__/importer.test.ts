import { describe, expect, it } from 'vitest';
import { importarMeta } from '../importer';

describe('importacao manual de meta', () => {
  it('aceita o formato sugerido, com usage em fracao e golpes em percentual', () => {
    const json = JSON.stringify([
      {
        pokemon_id: 'garchomp',
        usage_rate: 0.352,
        win_rate: 0.542,
        top_items: [{ item: 'Life Orb', percentage: 0.41 }],
        top_abilities: [{ ability: 'Rough Skin', percentage: 0.979 }],
        top_moves: [
          { move: 'Dragon Claw', percentage: 0.232 },
          { move: 'Protect', percentage: 0.206 },
        ],
      },
      { pokemon_id: 'kingambit', usage_rate: 0.343 },
      { pokemon_id: 'incineroar', usage_rate: 0.322 },
      { pokemon_id: 'sinistcha', usage_rate: 0.284 },
      { pokemon_id: 'basculegion', usage_rate: 0.28 },
      { pokemon_id: 'whimsicott', usage_rate: 0.236 },
    ]);

    const r = importarMeta(json);
    expect(r.ok).toBe(true);
    expect(r.reconhecidos).toBe(6);
    expect(r.snapshot!.entries[0].name).toBe('Garchomp');
    expect(r.snapshot!.entries[0].usage).toBeCloseTo(0.352, 3);
    expect(r.snapshot!.entries[0].winRate).toBeCloseTo(0.542, 3);
    expect(r.snapshot!.entries[0].moves[0].name).toBe('Dragon Claw');
    expect(r.comDetalhe.moves).toBe(1);
  });

  it('aceita percentual em escala 0-100 tambem', () => {
    const json = JSON.stringify([
      { name: 'Garchomp', usage: 35.2 },
      { name: 'Kingambit', usage: 34.3 },
      { name: 'Incineroar', usage: 32.2 },
      { name: 'Sinistcha', usage: 28.4 },
      { name: 'Basculegion', usage: 28 },
      { name: 'Whimsicott', usage: 23.6 },
    ]);
    const r = importarMeta(json);
    expect(r.snapshot!.entries[0].usage).toBeCloseTo(0.352, 3);
  });

  it('acha a lista dentro de um envelope', () => {
    const json = JSON.stringify({
      regulation: 'M-B',
      pokemon: Array.from({ length: 8 }, (_, i) => ({
        name: ['Garchomp', 'Kingambit', 'Incineroar', 'Sinistcha', 'Basculegion', 'Whimsicott', 'Sylveon', 'Sneasler'][i],
        usage: 0.3 - i * 0.02,
      })),
    });
    const r = importarMeta(json);
    expect(r.ok).toBe(true);
    expect(r.reconhecidos).toBe(8);
    expect(r.snapshot!.regulationId).toBe('M-B');
  });

  it('corrige sozinho quando a fonte publica por slot em vez de por time', () => {
    // Mesma distribuicao dividida por 6: a soma cai perto de 100%.
    const json = JSON.stringify(
      [0.352, 0.343, 0.322, 0.284, 0.28, 0.236, 0.19, 0.17, 0.15, 0.13, 0.11, 0.09].map((u, i) => ({
        name: ['Garchomp', 'Kingambit', 'Incineroar', 'Sinistcha', 'Basculegion', 'Whimsicott', 'Sylveon', 'Sneasler', 'Rillaboom', 'Amoonguss', 'Gholdengo', 'Pelipper'][i],
        usage: u / 6,
      })),
    );
    const r = importarMeta(json);
    expect(r.snapshot!.entries[0].usage).toBeCloseTo(0.352, 2);
    expect(r.avisos.join(' ')).toMatch(/por slot/i);
  });

  it('recusa texto que nao e JSON e explica o motivo', () => {
    const r = importarMeta('nao sou json');
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/nao e JSON valido/i);
  });

  it('recusa JSON sem lista de Pokemon reconhecivel', () => {
    const r = importarMeta('{"foo": 1}');
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/lista de Pokemon/i);
  });

  it('avisa sobre entradas que nao casam com nenhuma especie', () => {
    const json = JSON.stringify([
      ...['Garchomp', 'Kingambit', 'Incineroar', 'Sinistcha', 'Basculegion', 'Whimsicott'].map((name, i) => ({
        name,
        usage: 0.35 - i * 0.02,
      })),
      { name: 'Pokemon Inventado', usage: 0.1 },
    ]);
    const r = importarMeta(json);
    expect(r.ok).toBe(true);
    expect(r.ignorados).toContain('Pokemon Inventado');
    expect(r.avisos.join(' ')).toMatch(/nao casaram/i);
  });
});
