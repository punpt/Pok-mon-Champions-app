/**
 * Cobertura de tipos do time.
 *
 * Duas leituras, uma para cada lado do jogo:
 *
 * OFENSIVA — contra quais tipos o time tem como bater forte. Serve para achar
 * o buraco antes da partida: um time sem nada de Aco ou Veneno nao tem resposta
 * ofensiva para Fada, e isso decide matchup em doubles.
 *
 * DEFENSIVA — quais tipos machucam o time. O que importa nao e ter fraquezas,
 * e ter fraqueza empilhada sem ninguem que resista: tres Pokemon fracos a Gelo
 * e nenhum que segure e um convite.
 *
 * Tudo medido sobre tipos puros, de proposito. Uma matriz de todas as
 * combinacoes duplas seria mais precisa e ilegivel; a leitura por tipo e a que
 * responde "eu bato em Fada?" de relance.
 */

import type { ChampionsSet } from '../data/set';
import { battleSpecies } from '../data/set';
import { BATTLE_TYPES, getMove, typeEffectiveness, type TypeName } from '../data/dex';

export type CoverageGrade = 'otima' | 'boa' | 'fraca' | 'nenhuma';

export interface OffensiveCoverage {
  type: TypeName;
  /** Melhor multiplicador que o time consegue contra este tipo. */
  best: number;
  /** Quem consegue bater super efetivo, com o golpe. */
  sources: { uid: string; name: string; move: string; multiplier: number }[];
  grade: CoverageGrade;
}

export interface DefensiveCoverage {
  type: TypeName;
  /** Membros que sofrem dano aumentado. */
  weak: { uid: string; name: string; multiplier: number }[];
  /** Membros que resistem ou sao imunes. */
  resists: { uid: string; name: string; multiplier: number }[];
  /** Quanto o time sofre no agregado, de 0 a 1. */
  pressure: number;
  grade: CoverageGrade;
}

export interface TeamCoverage {
  offensive: OffensiveCoverage[];
  defensive: DefensiveCoverage[];
  /** Tipos que o time nao consegue bater super efetivo. */
  offensiveGaps: TypeName[];
  /** Tipos em que o time tem fraqueza empilhada e ninguem resiste. */
  defensiveHoles: TypeName[];
  /** Resumo em uma frase para o topo do bloco. */
  offensiveSummary: string;
  defensiveSummary: string;
}

function gradeOffense(best: number, count: number): CoverageGrade {
  if (best >= 2 && count >= 2) return 'otima';
  if (best >= 2) return 'boa';
  if (best >= 1) return 'fraca';
  return 'nenhuma';
}

function gradeDefense(weak: number, resists: number, total: number): CoverageGrade {
  if (!total) return 'boa';
  if (weak === 0) return 'otima';
  if (resists >= weak) return 'boa';
  if (weak >= Math.ceil(total / 2) && resists === 0) return 'nenhuma';
  return 'fraca';
}

export function computeCoverage(team: ChampionsSet[]): TeamCoverage {
  const membros = team
    .filter((m) => m.species)
    .map((m) => ({ set: m, species: battleSpecies(m) }))
    .filter((m): m is { set: ChampionsSet; species: NonNullable<ReturnType<typeof battleSpecies>> } =>
      m.species !== null,
    );

  const offensive: OffensiveCoverage[] = BATTLE_TYPES.map((tipo) => {
    const sources: OffensiveCoverage['sources'] = [];
    let best = 0;

    for (const { set, species } of membros) {
      let melhorDoMembro = 0;
      let golpeDoMembro = '';
      for (const nome of set.moves) {
        const move = getMove(nome);
        if (!move || move.category === 'Status' || !move.basePower) continue;
        const mult = typeEffectiveness(move.type as TypeName, [tipo]);
        if (mult > melhorDoMembro) {
          melhorDoMembro = mult;
          golpeDoMembro = move.name;
        }
      }
      if (melhorDoMembro > best) best = melhorDoMembro;
      if (melhorDoMembro >= 2) {
        sources.push({
          uid: set.uid,
          name: species.name,
          move: golpeDoMembro,
          multiplier: melhorDoMembro,
        });
      }
    }

    return { type: tipo, best, sources, grade: gradeOffense(best, sources.length) };
  });

  const defensive: DefensiveCoverage[] = BATTLE_TYPES.map((tipo) => {
    const weak: DefensiveCoverage['weak'] = [];
    const resists: DefensiveCoverage['resists'] = [];

    for (const { set, species } of membros) {
      const mult = typeEffectiveness(tipo, species.types as TypeName[]);
      if (mult > 1) weak.push({ uid: set.uid, name: species.name, multiplier: mult });
      else if (mult < 1) resists.push({ uid: set.uid, name: species.name, multiplier: mult });
    }

    // Fraqueza de 4x pesa o dobro de uma de 2x. Dividimos pelo pior caso
    // possivel (todo mundo fraco em 4x) para a escala nao saturar em times
    // pequenos, onde um unico Pokemon ja bateria no teto.
    const peso = weak.reduce((s, w) => s + (w.multiplier >= 4 ? 2 : 1), 0);
    const pressure = membros.length ? Math.min(1, peso / (membros.length * 2)) : 0;

    return {
      type: tipo,
      weak,
      resists,
      pressure,
      grade: gradeDefense(weak.length, resists.length, membros.length),
    };
  });

  const offensiveGaps = offensive.filter((o) => o.best < 2).map((o) => o.type);
  const defensiveHoles = defensive
    .filter((d) => d.weak.length >= 2 && d.resists.length === 0)
    .map((d) => d.type);

  return {
    offensive,
    defensive,
    offensiveGaps,
    defensiveHoles,
    offensiveSummary: resumoOfensivo(offensiveGaps, membros.length),
    defensiveSummary: resumoDefensivo(defensiveHoles, membros.length),
  };
}

function listar(tipos: TypeName[], limite: number): string {
  if (tipos.length <= limite) return tipos.join(', ');
  return `${tipos.slice(0, limite).join(', ')} e mais ${tipos.length - limite}`;
}

function resumoOfensivo(gaps: TypeName[], membros: number): string {
  if (!membros) return 'Monte o time para ver a cobertura.';
  if (!gaps.length) return 'Voce bate super efetivo em todos os 18 tipos.';
  if (gaps.length <= 4) return `Sem resposta super efetiva contra ${listar(gaps, 4)}.`;
  return `${gaps.length} tipos sem resposta super efetiva: ${listar(gaps, 4)}.`;
}

function resumoDefensivo(buracos: TypeName[], membros: number): string {
  if (!membros) return 'Monte o time para ver as fraquezas.';
  if (!buracos.length) return 'Nenhuma fraqueza empilhada sem quem resista.';
  return `Fraqueza empilhada e sem resistencia: ${listar(buracos, 5)}.`;
}
