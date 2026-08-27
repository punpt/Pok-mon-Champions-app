import { useMemo, useState } from 'react';
import { useTeamStore } from '../store/teamStore';
import { useAddFromMeta } from '../lib/useAddFromMeta';
import { battleSpecies, type ChampionsSet } from '../data/set';
import { useMetaStore } from '../store/metaStore';
import { useRoster } from '../lib/roster';
import { activeRegulation, formatSummary } from '../data/rules';
import { auditTeam, validateTeam } from '../engine/validate';
import { exportTeam, importTeam } from '../lib/paste';
import SetEditor from '../components/SetEditor';
import { Button, Card, Empty, Picker, Pill, Section, Sprite } from '../components/ui';

export default function TeamPage() {
  const { teams, activeId, setActive, createTeam, renameTeam, deleteTeam, updateMember, removeMember, replaceMembers } =
    useTeamStore();
  const team = teams.find((t) => t.id === activeId) ?? teams[0];
  const addFromMeta = useAddFromMeta();
  const roster = useRoster();
  const status = useMetaStore((s) => s.status);
  const reg = activeRegulation();

  const [openUid, setOpenUid] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteWarnings, setPasteWarnings] = useState<string[]>([]);

  const issues = useMemo(() => validateTeam(team.members, reg), [team.members, reg]);
  const audit = useMemo(() => auditTeam(team.members), [team.members]);

  const errors = issues.filter((i) => i.level === 'erro');
  const warnings = issues.filter((i) => i.level === 'aviso');
  const tips = [...issues.filter((i) => i.level === 'dica'), ...audit.gaps];

  const handleImport = () => {
    const { sets, warnings: w } = importTeam(pasteText);
    if (sets.length) {
      replaceMembers(sets.slice(0, reg.teamSize));
      setPasteText('');
      setPasteOpen(false);
    }
    setPasteWarnings(w);
  };

  return (
    <div>
      <Section
        title="Time"
        subtitle={formatSummary(reg).join(' · ')}
        right={
          <div className="flex gap-1.5">
            <Button onClick={() => createTeam()}>Novo</Button>
            <Button onClick={() => setPasteOpen((v) => !v)}>Paste</Button>
          </div>
        }
      >
        <div className="mb-3 flex gap-2">
          <input
            value={team.name}
            onChange={(e) => renameTeam(team.id, e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {teams.length > 1 && (
            <>
              <select
                value={activeId}
                onChange={(e) => setActive(e.target.value)}
                className="rounded-lg border border-ink-700 bg-ink-850 px-2 text-sm outline-none"
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
          <Card className="mb-3 p-3">
            <p className="mb-2 text-xs text-ink-400">
              Cole um paste do Showdown (EVs viram Stat Points automaticamente) ou copie o seu time daqui.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              placeholder={'Garchomp @ Life Orb\nAbility: Rough Skin\nEVs: 256 Atk / 256 Spe\nAdamant Nature\n- Earthquake'}
              className="w-full rounded-lg border border-ink-700 bg-ink-900 p-2 font-mono text-xs outline-none focus:border-accent"
            />
            <div className="mt-2 flex gap-2">
              <Button variant="primary" onClick={handleImport} disabled={!pasteText.trim()}>
                Importar
              </Button>
              <Button
                onClick={() => {
                  setPasteText(exportTeam(team.members));
                  setPasteWarnings([]);
                }}
              >
                Exportar time atual
              </Button>
            </div>
            {pasteWarnings.map((w, i) => (
              <p key={i} className="mt-1 text-[11px] text-warn">
                {w}
              </p>
            ))}
          </Card>
        )}

        <div className="mb-3">
          <Picker
            label={`Adicionar Pokemon (${team.members.length}/${reg.teamSize})`}
            value=""
            options={roster.options}
            onChange={(v) => void addFromMeta(v)}
            placeholder={
              status === 'carregando'
                ? 'Carregando roster ao vivo...'
                : roster.confirmed
                  ? `${roster.total} Pokemon legais em ${reg.label}`
                  : `${roster.total} Pokemon (legalidade nao confirmada)`
            }
          />
          <p className="mt-1 text-[11px] text-ink-600">
            Entra ja com o set mais jogado do ladder — ability, item, nature, Stat Points e golpes. Tudo editavel
            depois.
          </p>
          {!roster.confirmed && status !== 'carregando' && (
            <p className="mt-1 text-[11px] text-warn">
              Sem dados ao vivo: a lista e uma estimativa pelas regras da regulation, nao o roster oficial.
            </p>
          )}
        </div>
      </Section>

      {!team.members.length ? (
        <Empty
          title="Time vazio."
          hint="Escolha o primeiro Pokemon acima. Assim que ele entrar, a aba Ameacas ja mostra quem te ameaca por usage."
        />
      ) : (
        <div className="mb-5 space-y-2">
          {team.members.map((m) => (
            <div key={m.uid}>
              {openUid === m.uid ? (
                <div>
                  <SetEditor
                    set={m}
                    onChange={(patch) => updateMember(m.uid, patch)}
                    onRemove={() => {
                      removeMember(m.uid);
                      setOpenUid(null);
                    }}
                  />
                  <button onClick={() => setOpenUid(null)} className="mt-1 w-full py-1.5 text-xs text-ink-400">
                    Fechar
                  </button>
                </div>
              ) : (
                <MemberRow set={m} onOpen={() => setOpenUid(m.uid)} />
              )}
            </div>
          ))}
        </div>
      )}

      {(errors.length > 0 || warnings.length > 0 || tips.length > 0) && (
        <Section title="Checagem do time" subtitle="Clauses da regulation e composicao de doubles">
          <Card className="divide-y divide-ink-800">
            {[...errors, ...warnings, ...tips].map((issue, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5">
                <Pill tone={issue.level === 'erro' ? 'danger' : issue.level === 'aviso' ? 'warn' : 'neutral'}>
                  {issue.level}
                </Pill>
                <span className="min-w-0 flex-1 text-xs leading-relaxed text-ink-300">{issue.message}</span>
              </div>
            ))}
          </Card>
        </Section>
      )}

      {team.members.length >= 2 && (
        <Section title="Ferramentas do time" subtitle="O que doubles de alto nivel exige ter">
          <Card className="grid grid-cols-2 gap-px overflow-hidden bg-ink-800 text-xs">
            <Tool label="Controle de velocidade" items={audit.speedControl} />
            <Tool label="Redirecionamento" items={audit.redirection} />
            <Tool label="Fake Out" items={audit.fakeOut} />
            <Tool label="Intimidate" items={audit.intimidate} />
            <Tool label="Prioridade" items={audit.priority} />
            <Tool label="Protect" items={[`${audit.protect} de ${team.members.length}`]} />
          </Card>
        </Section>
      )}
    </div>
  );
}

function Tool({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="bg-ink-850 p-2.5">
      <p className="text-[10px] tracking-wide text-ink-400 uppercase">{label}</p>
      {items.length ? (
        <p className="mt-0.5 text-ink-100">{items.join(', ')}</p>
      ) : (
        <p className="mt-0.5 text-danger">nenhum</p>
      )}
    </div>
  );
}

function MemberRow({ set, onOpen }: { set: ChampionsSet; onOpen: () => void }) {
  const species = useMemo(() => battleSpecies(set), [set]);
  if (!species) return null;

  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 p-2.5 text-left transition hover:border-ink-600"
    >
      <Sprite species={species} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink-100">{species.name}</span>
        <span className="block truncate text-[11px] text-ink-400">
          {set.item || 'sem item'} · {set.ability || 'sem ability'} · {set.nature}
        </span>
        <span className="block truncate text-[11px] text-ink-600">
          {set.moves.length ? set.moves.join(' / ') : 'sem golpes'}
        </span>
      </span>
      <span className="text-ink-600">›</span>
    </button>
  );
}
