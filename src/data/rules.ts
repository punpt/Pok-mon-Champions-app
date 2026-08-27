/**
 * Regras oficiais dos formatos do Pokemon Champions.
 *
 * Fontes cruzadas em 27/08/2026: pokemon.com (noticias de agosto/2026 e do
 * lancamento do Regulation Set M-B), Victory Road, Serebii, Bulbapedia e Game8.
 * Quando uma regulation nova sair, basta acrescentar uma entrada aqui: o app
 * detecta sozinho qual esta ativa pela data.
 */

export type MechanicSupport = 'legal' | 'ilegal';

export interface RegulationRules {
  id: string;
  /** Rotulo curto exibido na interface. */
  label: string;
  /** Nome completo oficial. */
  name: string;
  /** Inicio da vigencia (ISO). */
  start: string;
  /** Fim da vigencia (ISO). */
  end: string;
  /** Chave usada nas rotas da API de battle data. */
  apiFormat: 'Doubles' | 'Singles';
  teamSize: number;
  battleSize: number;
  /** Segundos de team preview. */
  teamPreviewSeconds: number;
  /** Ambos os times sao revelados por completo antes da partida. */
  openTeamSheets: boolean;
  itemClause: boolean;
  speciesClause: boolean;
  level: number;
  mega: MechanicSupport;
  /** Quantas vezes o jogador pode mega evoluir em uma partida. */
  megaPerBattle: number;
  tera: MechanicSupport;
  timers: { gameSeconds: number; playerSeconds: number; turnSeconds: number };
  /** Grupos de Pokemon banidos no formato. */
  bans: {
    restricted: boolean;
    paradox: boolean;
    treasuresOfRuin: boolean;
    mythical: boolean;
  };
  notes: string[];
}

export const REGULATIONS: RegulationRules[] = [
  {
    id: 'MA',
    label: 'Reg M-A',
    name: 'Regulation Set M-A',
    start: '2026-04-08',
    end: '2026-06-17',
    apiFormat: 'Doubles',
    teamSize: 6,
    battleSize: 4,
    teamPreviewSeconds: 90,
    openTeamSheets: true,
    itemClause: true,
    speciesClause: true,
    level: 50,
    mega: 'legal',
    megaPerBattle: 1,
    tera: 'ilegal',
    timers: { gameSeconds: 1200, playerSeconds: 420, turnSeconds: 45 },
    bans: { restricted: true, paradox: true, treasuresOfRuin: true, mythical: true },
    notes: ['Formato de lancamento do Champions, so no Switch.'],
  },
  {
    id: 'MB',
    label: 'Reg M-B',
    name: 'Regulation Set M-B',
    start: '2026-06-17',
    end: '2026-09-09',
    apiFormat: 'Doubles',
    teamSize: 6,
    battleSize: 4,
    teamPreviewSeconds: 90,
    openTeamSheets: true,
    itemClause: true,
    speciesClause: true,
    level: 50,
    mega: 'legal',
    megaPerBattle: 1,
    tera: 'ilegal',
    timers: { gameSeconds: 1200, playerSeconds: 420, turnSeconds: 45 },
    bans: { restricted: true, paradox: true, treasuresOfRuin: true, mythical: true },
    notes: [
      'Formato do Mundial 2026 e do lancamento no mobile.',
      'Trouxe 22 Pokemon e 16 Mega Evolucoes novas em relacao a M-A.',
      'Terastalizacao continua ilegal: so Mega Evolucao vale como mecanica.',
      'A janela foi estendida de 02/09 para 09/09 no update de 05/08/2026.',
    ],
  },
];

export const DEFAULT_REGULATION_ID = 'MB';

export function getRegulation(id: string): RegulationRules {
  return REGULATIONS.find((r) => r.id === id) ?? REGULATIONS[REGULATIONS.length - 1];
}

/** Regulation vigente na data informada, ou a mais recente cadastrada. */
export function activeRegulation(now: Date = new Date()): RegulationRules {
  const iso = now.toISOString().slice(0, 10);
  const hit = REGULATIONS.find((r) => iso >= r.start && iso < r.end);
  return hit ?? REGULATIONS[REGULATIONS.length - 1];
}

/**
 * Uma regulation cadastrada aqui pode ter vencido sem que o app tenha sido
 * atualizado. A interface usa isso para avisar em vez de mentir sobre a legalidade.
 */
export function regulationIsStale(reg: RegulationRules, now: Date = new Date()): boolean {
  return now.toISOString().slice(0, 10) >= reg.end;
}

export function formatSummary(reg: RegulationRules): string[] {
  return [
    `Doubles, traz ${reg.teamSize} escolhe ${reg.battleSize}`,
    `Team preview de ${reg.teamPreviewSeconds}s`,
    reg.openTeamSheets ? 'Open Team Sheets' : 'Times ocultos',
    reg.itemClause ? 'Item Clause' : 'Itens repetidos liberados',
    reg.speciesClause ? 'Species Clause' : 'Especies repetidas liberadas',
    `Nivel ${reg.level}`,
    reg.mega === 'legal' ? `Mega Evolucao (${reg.megaPerBattle}x por partida)` : 'Sem Mega',
    reg.tera === 'legal' ? 'Terastalizacao liberada' : 'Sem Terastalizacao',
  ];
}
