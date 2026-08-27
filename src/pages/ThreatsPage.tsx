import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTeamStore } from '../store/teamStore';
import { useMetaStore } from '../store/metaStore';
import { battleSpecies, type ChampionsSet } from '../data/set';
import { getMove } from '../data/dex';
import {
  scanTeamThreats,
  scanThreatsFor,
  VERDICT_LABEL,
  type Matchup,
  type TeamThreatReport,
} from '../engine/threats';
import type { FieldOptions } from '../engine/calc';
import { Card, Empty, Pill, Section, Sprite, Spinner, UsageBar } from '../components/ui';

type Mode = 'membro' | 'time';

const FIELD_PRESETS: { id: string; label: string; field: FieldOptions }[] = [
  { id: 'neutro', label: 'Neutro', field: {} },
  { id: 'tw-deles', label: 'Tailwind deles', field: { defenderTailwind: false, attackerTailwind: false } },
  { id: 'sol', label: 'Sol', field: { weather: 'Sun' } },
  { id: 'chuva', label: 'Chuva', field: { weather: 'Rain' } },
  { id: 'reflect', label: 'Reflect meu', field: { reflect: true } },
];

export default function ThreatsPage() {
  const team = useTeamStore((s) => s.teams.find((t) => t.id === s.activeId) ?? s.teams[0]);
  const { snapshot, status, enrichTop, revision } = useMetaStore();

  const members = team.members.filter((m) => m.species);
  const [mode, setMode] = useState<Mode>('membro');
  const [selectedUid, setSelectedUid] = useState<string>(members[0]?.uid ?? '');
  const [preset, setPreset] = useState('neutro');
  const [matchups, setMatchups] = useState<Matchup[] | null>(null);
  const [report, setReport] = useState<TeamThreatReport | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const selected = members.find((m) => m.uid === selectedUid) ?? members[0] ?? null;
  const field = FIELD_PRESETS.find((f) => f.id === preset)?.field ?? {};

  // Puxa o detalhe dos mais jogados: sem os movesets reais, a analise vira
  // palpite. Depende da revisao, nao do objeto do snapshot, senao cada detalhe
  // que chega dispara uma nova rajada.
  useEffect(() => {
    void enrichTop(30);
  }, [revision, enrichTop]);

  useEffect(() => {
    if (!snapshot) return;
    const controller = new AbortController();
    setProgress({ done: 0, total: 1 });

    if (mode === 'membro' && selected) {
      setMatchups(null);
      void scanThreatsFor(selected, snapshot.entries, {
        limit: 60,
        field,
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ done, total }),
        // Preenche a tela enquanto calcula: os primeiros avaliados sao os de
        // maior usage, entao o que aparece primeiro ja e o que mais importa.
        onPartial: (parcial) => {
          if (!controller.signal.aborted) setMatchups(parcial);
        },
      }).then((r) => {
        if (!controller.signal.aborted) {
          setMatchups(r);
          setProgress(null);
        }
      });
    } else if (mode === 'time' && members.length) {
      setReport(null);
      void scanTeamThreats(members, snapshot.entries, {
        limit: 50,
        field,
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      }).then((r) => {
        if (!controller.signal.aborted) {
          setReport(r);
          setProgress(null);
        }
      });
    }

    return () => controller.abort();
    // Depende da revisao do recorte, nao do objeto: assim o calculo pesado
    // roda uma vez por carga e uma vez quando os detalhes terminam de chegar,
    // em vez de recomecar a cada Pokemon enriquecido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, mode, selected?.uid, JSON.stringify(members.map((m) => [m.species, m.item, m.moves, m.sp])), preset]);

  if (!members.length) {
    return <Empty title="Monte o time primeiro." hint="Com um Pokemon ja da para ver quem te ameaca no ladder." />;
  }
  if (status === 'erro' || !snapshot) {
    return (
      <Empty
        title="Sem recorte de meta ao vivo."
        hint="As ameacas sao ranqueadas por usage, entao precisam dos dados da API. Veja Ajustes › Diagnostico."
      />
    );
  }

  return (
    <div>
      <Section title="Ameacas" subtitle="Ordenadas por perigo ponderado pelo usage do ladder">
        <div className="mb-3 flex gap-1.5">
          <Toggle active={mode === 'membro'} onClick={() => setMode('membro')}>
            Por Pokemon
          </Toggle>
          <Toggle active={mode === 'time'} onClick={() => setMode('time')}>
            Time inteiro
          </Toggle>
        </div>

        {mode === 'membro' && (
          <div className="scroll-x mb-3 flex gap-1.5 pb-1">
            {members.map((m) => {
              const s = battleSpecies(m);
              return (
                <button
                  key={m.uid}
                  onClick={() => setSelectedUid(m.uid)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 ${
                    m.uid === selected?.uid ? 'border-accent bg-accent/10' : 'border-ink-700 bg-ink-850'
                  }`}
                >
                  <Sprite species={s} size={28} />
                  <span className="text-xs text-ink-100">{s?.name}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="scroll-x mb-3 flex gap-1.5 pb-1">
          {FIELD_PRESETS.map((f) => (
            <button
              key={f.id}
              onClick={() => setPreset(f.id)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${
                preset === f.id ? 'border-accent text-accent' : 'border-ink-700 text-ink-400'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {progress && (
          <div className="mb-3">
            <Spinner label={`Avaliando ${progress.done}/${progress.total} do ladder...`} />
          </div>
        )}
      </Section>

      {mode === 'membro' && matchups && selected && <MemberThreats matchups={matchups} mine={selected} />}
      {mode === 'time' && report && <TeamThreats report={report} members={members} />}
    </div>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg border py-2 text-sm ${
        active ? 'border-accent bg-accent/10 text-accent' : 'border-ink-700 bg-ink-850 text-ink-300'
      }`}
    >
      {children}
    </button>
  );
}

function hasAttackingMove(set: ChampionsSet): boolean {
  return set.moves.some((name) => {
    const move = getMove(name);
    return Boolean(move) && move!.category !== 'Status';
  });
}

function MemberThreats({ matchups, mine }: { matchups: Matchup[]; mine: ChampionsSet }) {
  const dangerous = matchups.filter((m) => m.danger >= 0.4);
  const safe = matchups.filter((m) => m.danger < 0.2).slice(0, 8);
  const meuNome = battleSpecies(mine)?.name ?? '';
  const semGolpes = !hasAttackingMove(mine);

  return (
    <>
      {semGolpes && (
        <Card className="mb-4 border-warn/40 bg-warn/10 p-3">
          <p className="text-xs leading-relaxed text-warn">
            <strong>{meuNome} esta sem golpe de ataque.</strong> Sem saber o que ele devolve, o app trata todo
            confronto como se voce nao pudesse revidar — e a lista abaixo fica pessimista demais. Defina os golpes
            na aba Time para a analise valer.
          </p>
        </Card>
      )}
      <Section
        title={`Quem ameaca ${meuNome}`}
        subtitle={`${dangerous.length} de ${matchups.length} avaliados representam perigo real`}
      >
        {dangerous.length ? (
          <div className="space-y-2">
            {dangerous.slice(0, 25).map((m) => (
              <ThreatCard key={m.id} m={m} />
            ))}
          </div>
        ) : (
          <Empty title="Nada no topo do ladder ameaca este set de verdade." />
        )}
      </Section>

      {safe.length > 0 && (
        <Section title="Matchups que voce ganha" subtitle="Bons alvos para trazer este Pokemon">
          <Card className="divide-y divide-ink-800">
            {safe.map((m) => (
              <div key={m.id} className="flex items-center gap-2 p-2">
                <Sprite species={m.id} size={32} />
                <span className="min-w-0 flex-1 truncate text-xs text-ink-100">{m.name}</span>
                <Pill tone="good">{VERDICT_LABEL[m.verdict]}</Pill>
              </div>
            ))}
          </Card>
        </Section>
      )}
    </>
  );
}

function ThreatCard({ m }: { m: Matchup }) {
  const [open, setOpen] = useState(false);
  const tone = m.danger >= 0.8 ? 'danger' : m.danger >= 0.6 ? 'warn' : 'neutral';

  return (
    <Card className="overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 p-2.5 text-left">
        <Sprite species={m.id} size={40} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium text-ink-100">{m.name}</span>
            <Pill tone={tone}>{VERDICT_LABEL[m.verdict]}</Pill>
            {m.priorityKO && <Pill tone="danger">prioridade</Pill>}
            {m.decisiveMoveOdds < 0.85 && m.incomingPct >= 0.5 && (
              <Pill tone="warn">{Math.round(m.decisiveMoveOdds * 100)}% carregam</Pill>
            )}
            {m.provenance === 'derivado' && <Pill>set estimado</Pill>}
          </span>
          <span className="mt-1 block text-[11px] text-ink-400">
            #{m.rank} · {(m.usage * 100).toFixed(1)}% de usage
          </span>
          <span className="mt-1 block">
            <UsageBar value={m.danger} tone={m.danger >= 0.6 ? 'danger' : 'accent'} />
          </span>
        </span>
        <span className="shrink-0 text-ink-600">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="border-t border-ink-800 p-2.5">
          <ul className="mb-2 space-y-1">
            {m.reasons.map((r, i) => (
              <li key={i} className="text-[11px] leading-relaxed text-ink-300">
                • {r}
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg bg-ink-900 p-2">
              <p className="mb-1 text-ink-400">Ele em voce</p>
              <p className="text-ink-100">{m.incoming?.desc ?? 'sem dano relevante'}</p>
            </div>
            <div className="rounded-lg bg-ink-900 p-2">
              <p className="mb-1 text-ink-400">Voce nele</p>
              <p className="text-ink-100">{m.outgoing?.desc ?? 'sem dano relevante'}</p>
            </div>
          </div>

          <p className="mt-2 text-[11px] text-ink-600">
            Set considerado: {m.opponentSet.item || 'sem item'} · {m.opponentSet.ability} ·{' '}
            {m.opponentSet.moves.join(' / ')}
          </p>

          <Link
            to={`/sinergia/${m.id}`}
            className="mt-2 inline-block rounded-lg border border-ink-700 px-2.5 py-1.5 text-[11px] text-accent"
          >
            Quem para este {m.name}? →
          </Link>
        </div>
      )}
    </Card>
  );
}

function TeamThreats({ report, members }: { report: TeamThreatReport; members: ChampionsSet[] }) {
  return (
    <>
      {report.unanswered.length > 0 && (
        <Section
          title="Ninguem responde"
          subtitle="Nenhum membro do time tem matchup favoravel contra estes — sao os buracos reais"
        >
          <div className="space-y-2">
            {report.unanswered.slice(0, 8).map((t) => (
              <Card key={t.id} className="flex items-center gap-2.5 border-danger/30 p-2.5">
                <Sprite species={t.id} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink-100">{t.name}</span>
                  <span className="block text-[11px] text-ink-400">
                    #{t.rank} · {(t.usage * 100).toFixed(1)}% de usage · vence {t.beats} de {members.length}
                  </span>
                </span>
                <Link
                  to={`/sinergia/${t.id}`}
                  className="shrink-0 rounded-lg border border-danger/40 px-2 py-1 text-[11px] text-danger"
                >
                  Achar resposta
                </Link>
              </Card>
            ))}
          </div>
        </Section>
      )}

      <Section title="Matriz do time" subtitle="Linha = ameaca do ladder, coluna = membro do seu time">
        <div className="scroll-x">
          <table className="w-full min-w-[520px] border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 bg-ink-900 p-1.5 text-left font-medium text-ink-400">Ameaca</th>
                {members.map((m) => (
                  <th key={m.uid} className="p-1.5">
                    <Sprite species={battleSpecies(m)} size={28} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.threats.slice(0, 25).map((t) => (
                <tr key={t.id} className="border-t border-ink-800">
                  <td className="sticky left-0 bg-ink-900 p-1.5">
                    <span className="flex items-center gap-1.5">
                      <Sprite species={t.id} size={24} />
                      <span className="truncate text-ink-100">{t.name}</span>
                    </span>
                  </td>
                  {t.perMember.map((m, i) => (
                    <td key={i} className="p-1 text-center">
                      <span
                        className="inline-block h-6 w-full min-w-[36px] rounded"
                        title={`${VERDICT_LABEL[m.verdict]} — ${m.reasons[0]}`}
                        style={{ background: cellColor(m.danger) }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-ink-600">
          Vermelho = o membro perde o confronto. Verde = ganha. Toque numa celula para ver o motivo.
        </p>
      </Section>
    </>
  );
}

function cellColor(danger: number): string {
  // Verde (seguro) -> amarelo -> vermelho (perde), com opacidade proporcional.
  if (danger >= 0.6) return `rgba(255,95,109,${0.25 + danger * 0.55})`;
  if (danger >= 0.4) return `rgba(255,182,72,${0.2 + danger * 0.4})`;
  return `rgba(61,220,151,${0.15 + (1 - danger) * 0.35})`;
}
