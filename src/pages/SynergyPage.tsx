import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTeamStore } from '../store/teamStore';
import { useAddFromMeta } from '../lib/useAddFromMeta';
import { useMetaStore } from '../store/metaStore';
import { useRoster } from '../lib/roster';
import { battleSpecies, type ChampionsSet } from '../data/set';
import { getSpecies } from '../data/dex';
import { presumedSetCached } from '../engine/presume';
import { suggestPartners, type PartnerSuggestion } from '../engine/synergy';
import { scanThreatsFor, VERDICT_LABEL, type Matchup } from '../engine/threats';
import { Button, Card, Empty, Picker, Pill, Section, Sprite, Spinner, TypeBadge, UsageBar } from '../components/ui';

type Tab = 'com' | 'contra';

export default function SynergyPage() {
  const { speciesId } = useParams();
  const navigate = useNavigate();
  const team = useTeamStore((s) => s.teams.find((t) => t.id === s.activeId) ?? s.teams[0]);
  const addFromMeta = useAddFromMeta();
  const { snapshot, enrichTop, enrich, revision } = useMetaStore();
  const roster = useRoster();

  const members = team.members.filter((m) => m.species);
  const anchorId = speciesId || members[0]?.species || '';

  const [tab, setTab] = useState<Tab>('com');
  const [anchorSet, setAnchorSet] = useState<ChampionsSet | null>(null);
  const [partners, setPartners] = useState<PartnerSuggestion[] | null>(null);
  const [counters, setCounters] = useState<Matchup[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // O ancora e o SEU set quando ele esta no time; senao, o set presumido do meta.
  useEffect(() => {
    if (!anchorId) return;
    const mine = members.find((m) => m.species === anchorId);
    if (mine) {
      setAnchorSet(mine);
      return;
    }
    let alive = true;
    void enrich(anchorId);
    void presumedSetCached(anchorId, snapshot?.entries.find((e) => e.id === anchorId) ?? null).then((p) => {
      if (alive) setAnchorSet(p.set);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorId, revision, team.members]);

  useEffect(() => {
    void enrichTop(30);
  }, [revision, enrichTop]);

  useEffect(() => {
    if (!snapshot || !anchorSet) return;
    const controller = new AbortController();
    setPartners(null);
    setCounters(null);
    setProgress({ done: 0, total: 1 });

    const exclude = members.map((m) => m.species);

    void Promise.all([
      suggestPartners(anchorSet, snapshot.entries, {
        limit: 45,
        candidateLimit: 50,
        threatDepth: 12,
        exclude,
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      }),
      scanThreatsFor(anchorSet, snapshot.entries, { limit: 60, signal: controller.signal }),
    ]).then(([p, c]) => {
      if (controller.signal.aborted) return;
      setPartners(p);
      setCounters(c.filter((m) => m.danger >= 0.4));
      setProgress(null);
    });

    return () => controller.abort();
    // Revisao em vez do objeto do snapshot: ver a nota em ThreatsPage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, anchorSet?.species, anchorSet?.item, JSON.stringify(anchorSet?.moves)]);

  const anchorSpecies = anchorSet ? battleSpecies(anchorSet) : null;
  const inTeam = useMemo(() => new Set(members.map((m) => m.species)), [members]);

  if (!snapshot) {
    return <Empty title="Sem recorte de meta ao vivo." hint="A sinergia usa usage e movesets reais do ladder." />;
  }

  return (
    <div>
      <Section title="Sinergias" subtitle="Escolha qualquer Pokemon: do seu time, do meta ou de uma lista de ameacas">
        <Picker
          label="Pokemon ancora"
          value={anchorId}
          options={roster.options}
          onChange={(v) => v && navigate(`/sinergia/${v}`)}
          placeholder="Escolher..."
        />
      </Section>

      {anchorSpecies && (
        <Card className="mb-4 flex items-center gap-3 p-3">
          <Sprite species={anchorSpecies} size={56} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-100">{anchorSpecies.name}</p>
            <div className="mt-1 flex gap-1">
              {(anchorSpecies.types as readonly string[]).map((t) => (
                <TypeBadge key={t} type={t} />
              ))}
            </div>
            <p className="mt-1 text-[11px] text-ink-400">
              {inTeam.has(anchorId) ? 'Usando o seu set do time.' : 'Usando o set mais jogado do ladder.'}
            </p>
          </div>
          {!inTeam.has(anchorId) && (
            <Button onClick={() => void addFromMeta(anchorId)}>+ Time</Button>
          )}
        </Card>
      )}

      <div className="mb-3 flex gap-1.5">
        <button
          onClick={() => setTab('com')}
          className={`flex-1 rounded-lg border py-2 text-sm ${
            tab === 'com' ? 'border-accent bg-accent/10 text-accent' : 'border-ink-700 bg-ink-850 text-ink-300'
          }`}
        >
          Bons COM ele
        </button>
        <button
          onClick={() => setTab('contra')}
          className={`flex-1 rounded-lg border py-2 text-sm ${
            tab === 'contra' ? 'border-accent bg-accent/10 text-accent' : 'border-ink-700 bg-ink-850 text-ink-300'
          }`}
        >
          Bons CONTRA ele
        </button>
      </div>

      {progress && <Spinner label={`Cruzando ${progress.done}/${progress.total} candidatos...`} />}

      {tab === 'com' && partners && (
        <Section
          title="Parceiros"
          subtitle="Ordenados por quanto resolvem as ameacas reais do ancora, nao so por tabela de tipos"
        >
          {partners.length ? (
            <div className="space-y-2">
              {partners.slice(0, 20).map((p) => (
                <PartnerCard key={p.id} p={p} onAdd={() => void addFromMeta(p.id)} inTeam={inTeam.has(p.id)} />
              ))}
            </div>
          ) : (
            <Empty title="Nenhum candidato avaliado ainda." />
          )}
        </Section>
      )}

      {tab === 'contra' && counters && (
        <Section title="Checks e counters" subtitle="Quem vence este Pokemon no ladder atual">
          {counters.length ? (
            <div className="space-y-2">
              {counters.slice(0, 20).map((c) => (
                <Card key={c.id} className="p-2.5">
                  <div className="flex items-center gap-2.5">
                    <Sprite species={c.id} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm text-ink-100">{c.name}</span>
                        <Pill tone={c.danger >= 0.8 ? 'danger' : 'warn'}>{VERDICT_LABEL[c.verdict]}</Pill>
                        {c.priorityKO && <Pill tone="danger">prioridade</Pill>}
                      </div>
                      <p className="text-[11px] text-ink-400">
                        #{c.rank} · {(c.usage * 100).toFixed(1)}% de usage
                      </p>
                    </div>
                  </div>
                  <ul className="mt-1.5 space-y-0.5">
                    {c.reasons.slice(0, 2).map((r, i) => (
                      <li key={i} className="text-[11px] text-ink-300">
                        • {r}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          ) : (
            <Empty title="Nada no ladder vence este Pokemon com folga." />
          )}
        </Section>
      )}
    </div>
  );
}

function PartnerCard({ p, onAdd, inTeam }: { p: PartnerSuggestion; onAdd: () => void; inTeam: boolean }) {
  const [open, setOpen] = useState(false);
  const species = getSpecies(p.id);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 p-2.5">
        <Sprite species={species} size={40} />
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium text-ink-100">{p.name}</span>
            {p.coveredThreats.length > 0 && (
              <Pill tone="good">resolve {p.coveredThreats.length}</Pill>
            )}
            {p.typeSynergy.shared.length > 0 && <Pill tone="warn">fraqueza dupla</Pill>}
          </span>
          <span className="mt-0.5 block text-[11px] text-ink-400">
            {(p.usage * 100).toFixed(1)}% de usage
            {p.usageSynergy > 0 && ` · ${(p.usageSynergy * 100).toFixed(1)}% de co-ocorrencia`}
          </span>
          <span className="mt-1 block">
            <UsageBar value={p.score} tone="good" />
          </span>
        </button>
        {!inTeam && <Button onClick={onAdd}>+</Button>}
      </div>

      <div className="border-t border-ink-800 px-2.5 py-2">
        <ul className="space-y-0.5">
          {p.reasons.map((r, i) => (
            <li key={i} className="text-[11px] leading-relaxed text-ink-300">
              • {r}
            </li>
          ))}
        </ul>

        {open && (
          <div className="mt-2 space-y-2 border-t border-ink-800 pt-2 text-[11px]">
            {p.coveredThreats.length > 0 && (
              <div>
                <p className="mb-1 text-ink-400">Ameacas que ele resolve para voce</p>
                <div className="flex flex-wrap gap-1">
                  {p.coveredThreats.map((c) => (
                    <span key={c.id} className="flex items-center gap-1 rounded bg-ink-800 px-1.5 py-0.5">
                      <Sprite species={c.id} size={18} />
                      <span className="text-ink-100">{c.name}</span>
                      <span className="text-ink-600">{(c.usage * 100).toFixed(0)}%</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <SynStat label="Cobertura" value={p.threatCoverage} />
              <SynStat label="Tipagem" value={p.typeSynergy.score} />
              <SynStat label="Co-ocorrencia" value={Math.min(1, p.usageSynergy * 2)} />
            </div>
            {p.typeSynergy.covers.length > 0 && (
              <p className="text-ink-300">Cobre: {p.typeSynergy.covers.join(', ')}</p>
            )}
            {p.typeSynergy.shared.length > 0 && (
              <p className="text-warn">Fraqueza compartilhada: {p.typeSynergy.shared.join(', ')}</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function SynStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-ink-900 p-1.5">
      <p className="text-ink-400">{label}</p>
      <p className="text-ink-100">{Math.round(value * 100)}</p>
    </div>
  );
}
