/**
 * Validacao de time contra as regras da regulation e auditoria de composicao.
 *
 * As clauses do Champions sao mais restritivas do que a maioria dos builders
 * assume: nao da para repetir item nem especie. Como o formato tambem roda com
 * Open Team Sheets, o adversario ve tudo antes de escolher — entao um buraco de
 * composicao nao fica escondido, ele e explorado.
 */

import type { ChampionsSet } from '../data/set';
import { battleSpecies, willMegaEvolve } from '../data/set';
import { getMove, getSpecies, normalizeId } from '../data/dex';
import { validateSpread } from '../data/stats';
import type { RegulationRules } from '../data/rules';

export type IssueLevel = 'erro' | 'aviso' | 'dica';

export interface TeamIssue {
  level: IssueLevel;
  message: string;
  /** uid do membro envolvido, quando aplicavel. */
  uid?: string;
}

/** Golpes que dao controle de velocidade ao time. */
const SPEED_CONTROL = new Set(['tailwind', 'trickroom', 'icywind', 'electroweb', 'thunderwave', 'stringshot', 'bulldoze', 'glaciallance']);
const REDIRECTION = new Set(['ragepowder', 'followme', 'ally switch']);
const REDIRECT_IDS = new Set(['ragepowder', 'followme', 'allyswitch']);
const FAKE_OUT = 'fakeout';
const PROTECT_LIKE = new Set(['protect', 'detect', 'spikyshield', 'banefulbunker', 'burningbulwark', 'silktrap', 'wideguard']);

export function validateTeam(team: ChampionsSet[], reg: RegulationRules): TeamIssue[] {
  const issues: TeamIssue[] = [];
  const filled = team.filter((m) => m.species);

  if (filled.length > reg.teamSize) {
    issues.push({ level: 'erro', message: `O time tem ${filled.length} Pokemon; o limite e ${reg.teamSize}.` });
  }

  // Species Clause
  if (reg.speciesClause) {
    const seen = new Map<string, number>();
    for (const m of filled) {
      const base = getSpecies(m.species);
      if (!base) continue;
      const key = normalizeId(base.baseSpecies || base.name);
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [key, count] of seen) {
      if (count > 1) {
        issues.push({ level: 'erro', message: `Species Clause: ${key} aparece ${count} vezes.` });
      }
    }
  }

  // Item Clause
  if (reg.itemClause) {
    const items = new Map<string, string[]>();
    for (const m of filled) {
      if (!m.item) continue;
      const key = normalizeId(m.item);
      items.set(key, [...(items.get(key) ?? []), m.uid]);
    }
    for (const [key, uids] of items) {
      if (uids.length > 1) {
        issues.push({
          level: 'erro',
          message: `Item Clause: ${key} esta em ${uids.length} Pokemon. So um pode segurar.`,
          uid: uids[1],
        });
      }
    }
  }

  for (const m of filled) {
    const species = getSpecies(m.species);
    const name = species?.name ?? m.species;

    // Stat Points
    const spread = validateSpread(m.sp);
    for (const err of spread.errors) {
      issues.push({ level: 'erro', message: `${name}: ${err}`, uid: m.uid });
    }
    if (spread.remaining > 0) {
      issues.push({
        level: 'aviso',
        message: `${name} tem ${spread.remaining} SP sem usar.`,
        uid: m.uid,
      });
    }

    // Moves
    if (m.moves.length === 0) {
      issues.push({ level: 'aviso', message: `${name} esta sem golpes.`, uid: m.uid });
    }
    if (m.moves.length > 4) {
      issues.push({ level: 'erro', message: `${name} tem mais de 4 golpes.`, uid: m.uid });
    }
    const dupes = m.moves.filter((mv, i) => m.moves.findIndex((x) => normalizeId(x) === normalizeId(mv)) !== i);
    if (dupes.length) {
      issues.push({ level: 'erro', message: `${name} tem golpe repetido: ${dupes[0]}.`, uid: m.uid });
    }

    if (!m.ability) {
      issues.push({ level: 'aviso', message: `${name} esta sem ability.`, uid: m.uid });
    }
  }

  // Mega
  if (reg.mega === 'legal') {
    const megas = filled.filter(willMegaEvolve);
    if (megas.length > reg.megaPerBattle) {
      issues.push({
        level: 'dica',
        message: `Voce tem ${megas.length} Mega Stones no time. E permitido carregar varias, mas so da para mega evoluir ${reg.megaPerBattle} por partida.`,
      });
    }
  } else {
    for (const m of filled) {
      if (willMegaEvolve(m)) {
        issues.push({ level: 'erro', message: `Mega Evolucao nao e legal em ${reg.label}.`, uid: m.uid });
      }
    }
  }

  return issues;
}

export interface TeamAudit {
  speedControl: string[];
  redirection: string[];
  fakeOut: string[];
  intimidate: string[];
  protect: number;
  /** Quantos membros tem golpe de prioridade. */
  priority: string[];
  gaps: TeamIssue[];
}

/** Checa se o time tem as ferramentas que doubles de alto nivel exige. */
export function auditTeam(team: ChampionsSet[]): TeamAudit {
  const filled = team.filter((m) => m.species);
  const speedControl: string[] = [];
  const redirection: string[] = [];
  const fakeOut: string[] = [];
  const intimidate: string[] = [];
  const priority: string[] = [];
  let protect = 0;

  for (const m of filled) {
    const species = battleSpecies(m);
    const name = species?.name ?? m.species;
    let hasProtect = false;

    for (const moveName of m.moves) {
      const move = getMove(moveName);
      if (!move) continue;
      const id = normalizeId(move.name);
      if (SPEED_CONTROL.has(id)) speedControl.push(`${name} (${move.name})`);
      if (REDIRECT_IDS.has(id)) redirection.push(`${name} (${move.name})`);
      if (id === FAKE_OUT) fakeOut.push(name);
      if (PROTECT_LIKE.has(id)) hasProtect = true;
      if ((move.priority ?? 0) > 0 && move.category !== 'Status') priority.push(`${name} (${move.name})`);
    }

    if (hasProtect) protect++;
    if (normalizeId(m.ability) === 'intimidate') intimidate.push(name);
  }

  const gaps: TeamIssue[] = [];
  if (filled.length >= 4) {
    if (!speedControl.length) {
      gaps.push({
        level: 'aviso',
        message: 'Nenhum controle de velocidade. Sem Tailwind, Trick Room ou Icy Wind voce joga no ritmo do adversario.',
      });
    }
    if (!redirection.length && !intimidate.length) {
      gaps.push({
        level: 'dica',
        message: 'Sem redirecionamento (Rage Powder/Follow Me) nem Intimidate: o time nao tem como proteger o seu vencedor de partida.',
      });
    }
    if (protect < Math.ceil(filled.length / 2)) {
      gaps.push({
        level: 'dica',
        message: `So ${protect} de ${filled.length} tem Protect. Em doubles com timer de 45s, Protect compra turno e informacao.`,
      });
    }
    if (!fakeOut.length) {
      gaps.push({ level: 'dica', message: 'Sem Fake Out: voce abre mao do turno de graca mais comum do formato.' });
    }
  }

  return { speedControl, redirection, fakeOut, intimidate, protect, priority, gaps };
}

export { REDIRECTION };
