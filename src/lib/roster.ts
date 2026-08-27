/**
 * Roster disponivel para montar time.
 *
 * A lista de quem esta legal na regulation vigente vem da API ao vivo — e ela
 * que sabe quais Pokemon o jogo liberou. Quando a API nao respondeu, caimos
 * para o dex inteiro com um filtro conservador e a interface avisa que a
 * legalidade nao esta confirmada.
 */

import { useMemo } from 'react';
import { useMetaStore } from '../store/metaStore';
import { dex, getSpecies, isMega, type Specie } from '../data/dex';
import type { Option } from '../components/ui';
import { activeRegulation } from '../data/rules';

/** Grupos banidos em todas as regulations do Champions ate agora. */
function bannedByRules(s: Specie): boolean {
  const reg = activeRegulation();
  const tags = (s.tags ?? []) as string[];
  if (reg.bans.restricted && tags.includes('Restricted Legendary')) return true;
  if (reg.bans.paradox && tags.includes('Paradox')) return true;
  if (reg.bans.mythical && tags.includes('Mythical')) return true;
  if (reg.bans.treasuresOfRuin && ['chiyu', 'chienpao', 'tinglu', 'wochien'].includes(s.id)) return true;
  return false;
}

/** Heuristica usada so quando nao ha dados ao vivo. */
function plausibleWithoutApi(s: Specie): boolean {
  if (!s.exists) return false;
  if (s.isNonstandard === 'CAP') return false;
  if (isMega(s)) return false; // Megas entram pela pedra, nao como escolha direta.
  if (s.baseSpecies && s.baseSpecies !== s.name && s.forme && /Gmax|Totem/.test(s.forme)) return false;
  if (bannedByRules(s)) return false;
  // Champions traz sobretudo estagios finais.
  if (s.evos && s.evos.length) return false;
  if ((s.nfe as boolean) === true) return false;
  return true;
}

export interface RosterResult {
  options: Option[];
  /** true quando a lista veio da API (legalidade confirmada). */
  confirmed: boolean;
  total: number;
}

export function useRoster(): RosterResult {
  const snapshot = useMetaStore((s) => s.snapshot);

  return useMemo(() => {
    if (snapshot?.entries.length) {
      const options: Option[] = [];
      for (const e of snapshot.entries) {
        const s = getSpecies(e.id);
        if (!s) continue;
        options.push({
          value: s.id,
          label: s.name,
          hint: `#${e.rank} · ${(e.usage * 100).toFixed(1)}% de usage · ${s.types.join('/')}`,
          sprite: `https://play.pokemonshowdown.com/sprites/gen5/${s.id}.png`,
        });
      }
      return { options, confirmed: true, total: options.length };
    }

    const fallback: Option[] = dex.species
      .all()
      .filter(plausibleWithoutApi)
      .map((s) => ({
        value: String(s.id),
        label: String(s.name),
        hint: s.types.join('/'),
        sprite: `https://play.pokemonshowdown.com/sprites/gen5/${s.id}.png`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return { options: fallback, confirmed: false, total: fallback.length };
  }, [snapshot]);
}
