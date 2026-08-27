/**
 * Import e export no formato de paste do Pokemon Showdown.
 *
 * O Champions usa Stat Points e o Showdown usa EVs, entao a conversao acontece
 * nas duas pontas (1 SP = 8 EVs). Um paste exportado daqui abre em qualquer
 * calculadora que fale Showdown, e um paste de qualquer lugar entra aqui ja
 * convertido para SP.
 */

import { emptySet, type ChampionsSet } from '../data/set';
import { getItem, getMove, getSpecies, normalizeId } from '../data/dex';
import { makeSpread, SP_MAX_PER_STAT, STAT_IDS, type SpSpread, type StatID } from '../data/stats';

const SHOWDOWN_ORDER: { key: StatID; label: string }[] = [
  { key: 'hp', label: 'HP' },
  { key: 'atk', label: 'Atk' },
  { key: 'def', label: 'Def' },
  { key: 'spa', label: 'SpA' },
  { key: 'spd', label: 'SpD' },
  { key: 'spe', label: 'Spe' },
];

export function exportSet(set: ChampionsSet): string {
  const species = getSpecies(set.species);
  if (!species) return '';

  const lines: string[] = [];
  const head = set.nickname ? `${set.nickname} (${species.name})` : species.name;
  lines.push(set.item ? `${head} @ ${set.item}` : head);
  if (set.ability) lines.push(`Ability: ${set.ability}`);
  lines.push('Level: 50');

  const evs = SHOWDOWN_ORDER.filter(({ key }) => set.sp[key] > 0)
    .map(({ key, label }) => `${set.sp[key] * 8} ${label}`)
    .join(' / ');
  if (evs) lines.push(`EVs: ${evs}`);
  if (set.nature) lines.push(`${set.nature} Nature`);

  // Comentario legivel com a distribuicao no sistema nativo do jogo.
  const sp = SHOWDOWN_ORDER.filter(({ key }) => set.sp[key] > 0)
    .map(({ key, label }) => `${set.sp[key]} ${label}`)
    .join(' / ');
  if (sp) lines.push(`// Stat Points: ${sp}`);

  for (const move of set.moves) {
    const m = getMove(move);
    if (m) lines.push(`- ${m.name}`);
  }

  return lines.join('\n');
}

export function exportTeam(team: ChampionsSet[]): string {
  return team
    .filter((s) => s.species)
    .map(exportSet)
    .filter(Boolean)
    .join('\n\n');
}

function parseEvsToSp(text: string): SpSpread {
  const spread = makeSpread();
  const parts = text.split('/');
  for (const part of parts) {
    const m = /(\d+)\s*([A-Za-z]+)/.exec(part.trim());
    if (!m) continue;
    const value = Number(m[1]);
    const label = m[2].toLowerCase();
    const entry = SHOWDOWN_ORDER.find((s) => s.label.toLowerCase() === label || s.key === label);
    if (!entry) continue;
    // Um paste do Showdown vem em EVs; um paste ja em SP vem com numeros baixos.
    const sp = value > SP_MAX_PER_STAT ? Math.round(value / 8) : value;
    spread[entry.key] = Math.min(SP_MAX_PER_STAT, sp);
  }
  return spread;
}

/** Le um paste com um ou varios Pokemon. */
export function importTeam(text: string): { sets: ChampionsSet[]; warnings: string[] } {
  const warnings: string[] = [];
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const sets: ChampionsSet[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    // Linha 1: "Apelido (Especie) (F) @ Item" em qualquer combinacao.
    const first = lines[0];
    const [namePart, itemPart] = first.split('@').map((s) => s?.trim());

    let speciesName = namePart;
    let nickname: string | undefined;
    const paren = /\(([^)]+)\)/g;
    const matches = [...namePart.matchAll(paren)].map((m) => m[1].trim());
    const speciesFromParen = matches.find((m) => getSpecies(m));
    if (speciesFromParen) {
      nickname = namePart.slice(0, namePart.indexOf('(')).trim() || undefined;
      speciesName = speciesFromParen;
    } else {
      speciesName = namePart.replace(/\((M|F)\)/g, '').trim();
    }

    const species = getSpecies(speciesName);
    if (!species) {
      warnings.push(`Nao reconheci "${speciesName}".`);
      continue;
    }

    const set = emptySet(species.id);
    if (nickname) set.nickname = nickname;

    if (itemPart) {
      const item = getItem(itemPart);
      if (item) set.item = item.name;
      else warnings.push(`Item desconhecido em ${species.name}: "${itemPart}".`);
    }

    for (const line of lines.slice(1)) {
      if (/^Ability:/i.test(line)) {
        set.ability = line.replace(/^Ability:\s*/i, '').trim();
      } else if (/^EVs:/i.test(line)) {
        set.sp = parseEvsToSp(line.replace(/^EVs:\s*/i, ''));
      } else if (/^Stat Points:/i.test(line) || /^\/\/\s*Stat Points:/i.test(line)) {
        set.sp = parseEvsToSp(line.replace(/^(\/\/\s*)?Stat Points:\s*/i, ''));
      } else if (/Nature\s*$/i.test(line)) {
        set.nature = line.replace(/\s*Nature\s*$/i, '').trim();
      } else if (/^-\s*/.test(line)) {
        const moveName = line.replace(/^-\s*/, '').split('/')[0].trim();
        const move = getMove(moveName);
        if (move) set.moves.push(move.name);
        else warnings.push(`Golpe desconhecido em ${species.name}: "${moveName}".`);
      }
    }

    // Um paste sem ability declarada fica com a primeira legal da especie.
    if (!set.ability) {
      const abilities = Object.values(species.abilities ?? {}).filter(Boolean) as string[];
      set.ability = abilities[0] ?? '';
    }

    set.moves = set.moves.slice(0, 4);
    sets.push(set);
  }

  const total = STAT_IDS.length;
  void total;
  return { sets, warnings };
}

export function idOf(name: string): string {
  return normalizeId(name);
}
