import { useMemo, useState } from 'react';
import { useTeamStore } from '../store/teamStore';
import { useAddFromMeta } from '../lib/useAddFromMeta';
import { useMetaStore } from '../store/metaStore';
import { useRoster } from '../lib/roster';
import { battleSpecies, willMegaEvolve, type ChampionsSet } from '../data/set';
import { BATTLE_TYPES, defensiveProfile, type TypeName } from '../data/dex';
import { activeRegulation, formatSummary } from '../data/rules';
import { validateTeam } from '../engine/validate';
import { computeCoverage } from '../engine/coverage';
import { exportTeam, importTeam } from '../lib/paste';
import SetEditor from '../components/SetEditor';
import TeamGrid from '../components/TeamGrid';
import { DefensiveBlock, OffensiveBlock } from '../components/CoverageBlock';
import { Button, Card, Empty, Picker, Pill, Section, Sprite, TypeBadge } from '../components/ui';
import { spreadRemaining } from '../data/stats';

export default function TeamPage() {
  const { teams, activeId, setActive, createTeam, renameTeam, deleteTeam, updateMember, removeMember, replaceMembers } =
    useTeamStore();
  const team = teams.find((t) => t.id === activeId) ?? teams[0];
  const addFromMeta = useAddFromMeta();
  const roster = useRoster();
  const status = useMetaStore((s) => s.status);
  const reg = activeRegulation();

  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteWarnings, setPasteWarnings] = useState<string[]>([]);
  const [adicionando, setAdicionando] = useState(false);
  const [abrirPicker, setAbrirPicker] = useState(false);

  const membros = team.members.filter((m) => m.species);
  const membroSelecionado = membros.find((m) => m.uid === selecionado) ?? null;
  const issues = useMemo(() => validateTeam(team.members, reg), [team.members, reg]);
  const cobertura = useMemo(() => computeCoverage(team.members), [team.members]);
  const erros = issues.filter((i) => i.level === 'erro');

  const adicionar = async (id: string) => {
    if (!id) return;
    setAdicionando(true);
    try {
      await addFromMeta(id);
    } finally {
      setAdicionando(false);
    }
  };

  const importar = () => {
    const { sets, warnings } = importTeam(pasteText);
    if (sets.length) {
      replaceMembers(sets.slice(0, reg.teamSize));
      setPasteText('');
      setPasteOpen(false);
    }
    setPasteWarnings(warnings);
  };

  return (
    <div>
      <Section
        title="Time"
        subtitle={`${membros.length} de ${reg.teamSize} · ${reg.label}`}
        right={
          <div className="flex gap-1.5">
            <Button onClick={() => createTeam()}>Novo</Button>
            <Button onClick={() => setPasteOpen((v) => !v)}>Paste</Button>
          </div>
        }
      >
        <div className="mb-2 flex gap-2">
          <input
            value={team.name}
            onChange={(e) => renameTeam(team.id, e.target.value)}
            aria-label="Nome do time"
            className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {teams.length > 1 && (
            <>
              <select
                value={activeId}
                onChange={(e) => setActive(e.target.value)}
                aria-label="Trocar de time"
                className="max-w-[7rem] rounded-lg border border-ink-700 bg-ink-850 px-2 text-sm outline-none"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <Button variant="danger" onClick={() => deleteTeam(team.id)}>
                ×
              </Button>
            </>
          )}
        </div>

        {pasteOpen && (
          <Card className="mb-2 p-3">
            <p className="mb-2 text-xs text-ink-400">
              Cole um paste do Showdown — EVs viram Stat Points sozinhos — ou copie o seu time daqui.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              placeholder={'Garchomp @ Life Orb\nAbility: Rough Skin\nEVs: 256 Atk / 256 Spe\nJolly Nature\n- Earthquake'}
              className="w-full rounded-lg border border-ink-700 bg-ink-900 p-2 font-mono text-xs outline-none focus:border-accent"
            />
            <div className="mt-2 flex gap-2">
              <Button variant="primary" onClick={importar} disabled={!pasteText.trim()}>
                Importar
              </Button>
              <Button
                onClick={() => {
                  setPasteText(exportTeam(team.members));
                  setPasteWarnings([]);
                }}
              >
                Exportar
              </Button>
            </div>
            {pasteWarnings.map((w, i) => (
              <p key={i} className="mt-1 text-[11px] text-warn">
                {w}
              </p>
            ))}
          </Card>
        )}

      </Section>

      <section className="mb-5">
        <TeamGrid
          membros={membros}
          selecionado={selecionado}
          tamanhoMaximo={reg.teamSize}
          onSelecionar={(uid) => {
            setSelecionado(uid === selecionado ? null : uid);
            setEditando(false);
          }}
          onAdicionar={() => setAbrirPicker(true)}
        />

        {abrirPicker && (
          <div className="mt-2">
            <Picker
              label="Adicionar Pokemon"
              value=""
              options={roster.options}
              onChange={(v) => {
                setAbrirPicker(false);
                void adicionar(v);
              }}
              placeholder={
                adicionando
                  ? 'Montando o set do ladder...'
                  : status === 'carregando'
                    ? 'Carregando roster...'
                    : roster.confirmed
                      ? `${roster.total} legais em ${reg.label}`
                      : `${roster.total} (legalidade nao confirmada)`
              }
              abrirAoMontar
              onFechar={() => setAbrirPicker(false)}
            />
          </div>
        )}

        {!roster.confirmed && status !== 'carregando' && (
          <p className="mt-1.5 text-[11px] text-warn">
            Sem dados ao vivo: a lista e estimada pelas regras, nao e o roster oficial.
          </p>
        )}
      </section>

      {membroSelecionado && !editando && (
        <MemberCard
          set={membroSelecionado}
          onEditar={() => setEditando(true)}
          onRemover={() => {
            removeMember(membroSelecionado.uid);
            setSelecionado(null);
          }}
        />
      )}

      {membroSelecionado && editando && (
        <div className="mb-5">
          <SetEditor
            set={membroSelecionado}
            onChange={(patch) => updateMember(membroSelecionado.uid, patch)}
            onRemove={() => {
              removeMember(membroSelecionado.uid);
              setSelecionado(null);
              setEditando(false);
            }}
          />
          <button
            onClick={() => setEditando(false)}
            className="mt-1 w-full rounded-lg border border-ink-700 py-2.5 text-xs text-ink-300 transition active:scale-[0.99]"
          >
            Concluir
          </button>
        </div>
      )}

      {!membros.length && (
        <Empty
          title="Time vazio."
          hint="Toque num slot para escolher o primeiro Pokemon. Ele entra com o set mais jogado do ladder."
        />
      )}

      {erros.length > 0 && (
        <Section title="Regras" subtitle="O que impede este time de ser legal">
          <Card className="divide-y divide-ink-800">
            {erros.map((issue, i) => (
              <p key={i} className="p-2.5 text-xs leading-relaxed text-danger">
                {issue.message}
              </p>
            ))}
          </Card>
        </Section>
      )}

      {membros.length > 0 && (
        <>
          <Section title="Cobertura ofensiva" subtitle={cobertura.offensiveSummary}>
            <OffensiveBlock rows={cobertura.offensive} />
          </Section>

          <Section title="Cobertura defensiva" subtitle={cobertura.defensiveSummary}>
            <DefensiveBlock rows={cobertura.defensive} />
          </Section>
        </>
      )}

      <details className="mt-4 rounded-xl border border-ink-800 bg-ink-850 p-3">
        <summary className="cursor-pointer text-xs text-ink-400">Regras do formato</summary>
        <ul className="mt-2 space-y-1">
          {formatSummary(reg).map((l, i) => (
            <li key={i} className="text-[11px] text-ink-300">
              • {l}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/**
 * Card de um membro do time.
 *
 * Tipagem e fraquezas ficam aqui, no mesmo bloco que se toca para editar: sao
 * a informacao consultada o tempo todo durante a montagem, e mandar isso para
 * outra aba obrigava a ir e voltar a cada troca de Pokemon.
 */
function MemberCard({
  set,
  onEditar,
  onRemover,
}: {
  set: ChampionsSet;
  onEditar: () => void;
  onRemover: () => void;
}) {
  const species = useMemo(() => battleSpecies(set), [set]);
  // Fraquezas, resistencias e imunidades saem do mesmo perfil defensivo.
  // Resistir e tao acionavel quanto sofrer — e o que decide quem entra em campo
  // contra o que —, e imunidade muda o posicionamento em doubles, entao vale
  // uma faixa propria em vez de somir junto das resistencias.
  const perfil = useMemo(() => {
    if (!species) return null;
    const p = defensiveProfile(species.types as TypeName[]);
    const porMult = (teste: (m: number) => boolean) =>
      BATTLE_TYPES.filter((t) => teste(p[t]))
        .map((t) => ({ type: t, mult: p[t] }))
        .sort((a, b) => b.mult - a.mult);
    return {
      fracas: porMult((m) => m > 1),
      resiste: porMult((m) => m > 0 && m < 1).sort((a, b) => a.mult - b.mult),
      imune: porMult((m) => m === 0),
    };
  }, [species]);

  if (!species) return null;

  const spLivres = spreadRemaining(set.sp);
  const semGolpes = set.moves.length === 0;

  return (
    <div className="mb-5 rounded-xl border border-accent/40 bg-ink-850 p-3">
      <div className="flex items-start gap-3">
        <Sprite species={species} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-ink-100">{species.name}</span>
            {willMegaEvolve(set) && <Pill tone="accent">Mega</Pill>}
            {(species.types as readonly string[]).map((t) => (
              <TypeBadge key={t} type={t} />
            ))}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-ink-400">
            {set.item || 'sem item'} · {set.ability || 'sem ability'} · {set.nature}
          </p>
          <p className={`truncate text-[11px] ${semGolpes ? 'text-warn' : 'text-ink-600'}`}>
            {semGolpes ? 'sem golpes definidos' : set.moves.join(' / ')}
          </p>
        </div>
      </div>

      {perfil && (perfil.fracas.length > 0 || perfil.resiste.length > 0 || perfil.imune.length > 0) && (
        <div className="mt-2 space-y-1 border-t border-ink-800 pt-2">
          <LinhaDeTipos rotulo="Fraco a" tom="danger" tipos={perfil.fracas} />
          <LinhaDeTipos rotulo="Resiste" tom="good" tipos={perfil.resiste} />
          <LinhaDeTipos rotulo="Imune a" tom="accent" tipos={perfil.imune} />
        </div>
      )}

      {spLivres > 0 && (
        <p className="mt-1.5 text-[10px] text-warn">
          {spLivres} Stat Point{spLivres > 1 ? 's' : ''} ainda por distribuir
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button variant="primary" className="flex-1" onClick={onEditar}>
          Editar set
        </Button>
        <Button variant="danger" onClick={onRemover}>
          Remover
        </Button>
      </div>
    </div>
  );
}

/**
 * Uma faixa de tipos com o rotulo a esquerda.
 *
 * O multiplicador entra dentro da mesma capsula do tipo. Solto ao lado, ficava
 * ambiguo se o "4x" pertencia ao tipo anterior ou ao seguinte — problema real
 * numa lista como "Lutador 4x Fogo Terra".
 */
function LinhaDeTipos({
  rotulo,
  tom,
  tipos,
}: {
  rotulo: string;
  tom: 'danger' | 'good' | 'accent';
  tipos: { type: TypeName; mult: number }[];
}) {
  if (!tipos.length) return null;
  const cor = tom === 'danger' ? 'text-danger' : tom === 'good' ? 'text-good' : 'text-accent';
  const fundo = tom === 'danger' ? 'bg-danger' : tom === 'good' ? 'bg-good' : 'bg-accent';

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className={`mr-0.5 w-14 shrink-0 text-[10px] tracking-wide uppercase ${cor}`}>{rotulo}</span>
      {tipos.map(({ type, mult }) => {
        const marca = mult === 0 ? null : mult >= 4 ? '4x' : mult === 0.25 ? '¼' : null;
        return (
          <span key={type} className="inline-flex items-center overflow-hidden rounded">
            <TypeBadge type={type} />
            {marca && <span className={`px-1 py-0.5 text-[10px] font-bold text-ink-950 ${fundo}`}>{marca}</span>}
          </span>
        );
      })}
    </div>
  );
}
