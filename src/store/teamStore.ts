/** Times salvos, persistidos localmente. */

import { create } from 'zustand';
import { emptySet, newUid, type ChampionsSet } from '../data/set';
import { makeSpread } from '../data/stats';
import { activeRegulation } from '../data/rules';

const STORAGE_KEY = 'champions-lab:teams';

export interface Team {
  id: string;
  name: string;
  regulationId: string;
  members: ChampionsSet[];
  updatedAt: number;
}

function newTeam(name = 'Time novo'): Team {
  return {
    id: newUid(),
    name,
    regulationId: activeRegulation().id,
    members: [],
    updatedAt: Date.now(),
  };
}

function loadTeams(): Team[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [newTeam()];
    const parsed = JSON.parse(raw) as Team[];
    if (!Array.isArray(parsed) || !parsed.length) return [newTeam()];
    // Normaliza spreads antigos que possam ter vindo incompletos.
    return parsed.map((t) => ({
      ...t,
      members: (t.members ?? []).map((m) => ({ ...m, sp: makeSpread(m.sp) })),
    }));
  } catch {
    return [newTeam()];
  }
}

function persist(teams: Team[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
  } catch {
    /* cota estourada: o time segue valido na sessao atual */
  }
}

interface TeamState {
  teams: Team[];
  activeId: string;
  active(): Team;
  setActive(id: string): void;
  createTeam(name?: string): void;
  renameTeam(id: string, name: string): void;
  deleteTeam(id: string): void;
  addMember(speciesId: string): void;
  updateMember(uid: string, patch: Partial<ChampionsSet>): void;
  removeMember(uid: string): void;
  replaceMembers(members: ChampionsSet[]): void;
}

export const useTeamStore = create<TeamState>((set, get) => {
  const teams = loadTeams();

  const commit = (next: Team[]) => {
    persist(next);
    set({ teams: next });
  };

  const patchActive = (fn: (t: Team) => Team) => {
    const { teams: all, activeId } = get();
    commit(all.map((t) => (t.id === activeId ? { ...fn(t), updatedAt: Date.now() } : t)));
  };

  return {
    teams,
    activeId: teams[0].id,

    active() {
      const { teams: all, activeId } = get();
      return all.find((t) => t.id === activeId) ?? all[0];
    },

    setActive(id) {
      set({ activeId: id });
    },

    createTeam(name) {
      const t = newTeam(name);
      commit([...get().teams, t]);
      set({ activeId: t.id });
    },

    renameTeam(id, name) {
      commit(get().teams.map((t) => (t.id === id ? { ...t, name, updatedAt: Date.now() } : t)));
    },

    deleteTeam(id) {
      const rest = get().teams.filter((t) => t.id !== id);
      const next = rest.length ? rest : [newTeam()];
      commit(next);
      if (get().activeId === id) set({ activeId: next[0].id });
    },

    addMember(speciesId) {
      patchActive((t) => {
        const max = activeRegulation().teamSize;
        if (t.members.length >= max) return t;
        return { ...t, members: [...t.members, emptySet(speciesId)] };
      });
    },

    updateMember(uid, patch) {
      patchActive((t) => ({
        ...t,
        members: t.members.map((m) => (m.uid === uid ? { ...m, ...patch } : m)),
      }));
    },

    removeMember(uid) {
      patchActive((t) => ({ ...t, members: t.members.filter((m) => m.uid !== uid) }));
    },

    replaceMembers(members) {
      patchActive((t) => ({ ...t, members }));
    },
  };
});
