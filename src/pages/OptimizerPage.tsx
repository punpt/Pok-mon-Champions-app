import { useEffect, useMemo, useState } from 'react';
import { useTeamStore } from '../store/teamStore';
import { useMetaStore } from '../store/metaStore';
import { useRoster } from '../lib/roster';
import { battleSpecies, type ChampionsSet } from '../data/set';
import { getMove } from '../data/dex';
import { presumedSetCached } from '../engine/presume';
import { optimize, type Benchmark, type OptimizeResult } from '../engine/optimizer';
import { championsStats, SP_TOTAL, STAT_IDS, STAT_LABEL } from '../data/stats';
import { baseStatsOf, natureByName } from '../data/dex';
import { Button, Card, Empty, Picker, Pill, Section, Sprite } from '../components/ui';

let benchCounter = 0;

export default function OptimizerPage() {
  const team = useTeamStore((s) => s.teams.find((t) => t.id === s.activeId) ?? s.teams[0]);
  const updateMember = useTeamStore((s) => s.updateMember);
  const { snapshot, enrich } = useMetaStore();
  const roster = useRoster();

  const members = team.members.filter((m) => m.species);
  const [uid, setUid] = useState(members[0]?.uid ?? '');
  const target = members.find((m) => m.uid === uid) ?? members[0] ?? null;

  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [leftover, setLeftover] = useState<'bulk' | 'ofensivo' | 'velocidade'>('bulk');
  const [searchNature, setSearchNature] = useState(true);
  const [result, setResult] = useState<OptimizeResult | null>(null);

  // Formulario de novo benchmark
  const [kind, setKind] = useState<'sobreviver' | 'matar' | 'velocidade'>('sobreviver');
  const [otherId, setOtherId] = useState('');
  const [otherSet, setOtherSet] = useState<ChampionsSet | null>(null);
  const [move, setMove] = useState('');
  const [strict, setStrict] = useState<'sempre' | 'quase-sempre'>('sempre');
  const [boost, setBoost] = useState(0);

  useEffect(() => {
    if (!otherId) return setOtherSet(null);
    let alive = true;
    void enrich(otherId);
    void presumedSetCached(otherId, snapshot?.entries.find((e) => e.id === otherId) ?? null).then((p) => {
      if (alive) {
        setOtherSet(p.set);
        setMove((m) => m || p.set.moves[0] || '');
      }
    });
    return () => {
      alive = false;
    };
  }, [otherId, snapshot, enrich]);

  const moveOptions = useMemo(() => {
    const source = kind === 'matar' ? target : otherSet;
    return (source?.moves ?? [])
      .map((m) => getMove(m))
      .filter((m): m is NonNullable<ReturnType<typeof getMove>> => m !== null && m.category !== 'Status')
      .map((m) => ({ value: m.name, label: m.name, hint: `${m.type} · ${m.basePower} BP` }));
  }, [kind, target, otherSet]);

  const addBenchmark = () => {
    if (!otherSet || !target) return;
    benchCounter += 1;
    const id = `b${benchCounter}`;

    if (kind === 'velocidade') {
      setBenchmarks((b) => [...b, { kind: 'velocidade', id, target: otherSet, mode: 'superar' }]);
    } else if (kind === 'sobreviver') {
      if (!move) return;
      setBenchmarks((b) => [
        ...b,
        {
          kind: 'sobreviver',
          id,
          attacker: otherSet,
          move,
          strictness: strict,
          attackerBoosts: boost ? { atk: boost, spa: boost } : undefined,
        },
      ]);
    } else {
      if (!move) return;
      setBenchmarks((b) => [...b, { kind: 'matar', id, defender: otherSet, move, hits: 1, strictness: strict }]);
    }
    setMove('');
  };

  const run = () => {
    if (!target) return;
    setResult(optimize({ set: target, benchmarks, leftover, searchNature }));
  };

  const apply = () => {
    if (!target || !result) return;
    updateMember(target.uid, { sp: result.spread, nature: result.nature });
    setResult(null);
  };

  if (!members.length) {
    return <Empty title="Monte o time primeiro." hint="O otimizador trabalha em cima de um Pokemon do seu time." />;
  }

  return (
    <div>
      <Section
        title="Otimizador de Stat Points"
        subtitle={`Menor distribuicao dos ${SP_TOTAL} SP que cumpre os seus benchmarks`}
      >
        <div className="scroll-x mb-3 flex gap-1.5 pb-1">
          {members.map((m) => {
            const s = battleSpecies(m);
            return (
              <button
                key={m.uid}
                onClick={() => {
                  setUid(m.uid);
                  setResult(null);
                }}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 ${
                  m.uid === target?.uid ? 'border-accent bg-accent/10' : 'border-ink-700 bg-ink-850'
                }`}
              >
                <Sprite species={s} size={28} />
                <span className="text-xs text-ink-100">{s?.name}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Adicionar benchmark">
        <Card className="space-y-2 p-3">
          <div className="flex gap-1.5">
            {(['sobreviver', 'matar', 'velocidade'] as const).map((k) => (
              <button
                key={k}
                onClick={() => {
                  setKind(k);
                  setMove('');
                }}
                className={`flex-1 rounded-lg border py-1.5 text-xs ${
                  kind === k ? 'border-accent bg-accent/10 text-accent' : 'border-ink-700 text-ink-300'
                }`}
              >
                {k === 'sobreviver' ? 'Sobreviver a' : k === 'matar' ? 'Matar' : 'Superar Speed'}
              </button>
            ))}
          </div>

          <Picker
            label={kind === 'matar' ? 'Alvo' : kind === 'velocidade' ? 'Superar quem' : 'Atacante'}
            value={otherId}
            options={roster.options}
            onChange={setOtherId}
          />

          {kind !== 'velocidade' && (
            <Picker
              label={kind === 'matar' ? 'Com qual golpe seu' : 'Qual golpe dele'}
              value={move}
              options={moveOptions}
              onChange={setMove}
              placeholder={moveOptions.length ? 'Escolher...' : 'Defina os golpes primeiro'}
            />
          )}

          {kind !== 'velocidade' && (
            <div className="flex gap-1.5">
              {(['sempre', 'quase-sempre'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStrict(s)}
                  className={`flex-1 rounded-lg border py-1.5 text-[11px] ${
                    strict === s ? 'border-accent text-accent' : 'border-ink-700 text-ink-400'
                  }`}
                >
                  {s === 'sempre' ? 'Sempre (16/16)' : 'Quase sempre (15/16)'}
                </button>
              ))}
            </div>
          )}

          {kind === 'sobreviver' && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-ink-400">Boost dele:</span>
              {[0, 1, 2].map((b) => (
                <button
                  key={b}
                  onClick={() => setBoost(b)}
                  className={`rounded px-2 py-1 text-[11px] ${boost === b ? 'bg-accent text-white' : 'bg-ink-800 text-ink-400'}`}
                >
                  {b === 0 ? 'sem' : `+${b}`}
                </button>
              ))}
            </div>
          )}

          <Button variant="primary" className="w-full" onClick={addBenchmark} disabled={!otherSet || (kind !== 'velocidade' && !move)}>
            Adicionar
          </Button>
        </Card>
      </Section>

      {benchmarks.length > 0 && (
        <Section title={`Benchmarks (${benchmarks.length})`}>
          <Card className="divide-y divide-ink-800">
            {benchmarks.map((b) => (
              <div key={b.id} className="flex items-center gap-2 p-2.5 text-xs">
                <Sprite species={b.kind === 'sobreviver' ? b.attacker.species : b.kind === 'matar' ? b.defender.species : b.target.species} size={28} />
                <span className="min-w-0 flex-1 text-ink-300">{describe(b)}</span>
                <button onClick={() => setBenchmarks((list) => list.filter((x) => x.id !== b.id))} className="text-danger">
                  ×
                </button>
              </div>
            ))}
          </Card>

          <div className="mt-3 space-y-2">
            <div>
              <p className="mb-1 text-[11px] text-ink-400">O que sobrar vai para:</p>
              <div className="flex gap-1.5">
                {(['bulk', 'ofensivo', 'velocidade'] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLeftover(l)}
                    className={`flex-1 rounded-lg border py-1.5 text-[11px] ${
                      leftover === l ? 'border-accent text-accent' : 'border-ink-700 text-ink-400'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-[11px] text-ink-300">
              <input type="checkbox" checked={searchNature} onChange={(e) => setSearchNature(e.target.checked)} />
              Deixar o otimizador testar outras natures
            </label>

            <Button variant="primary" className="w-full" onClick={run}>
              Resolver
            </Button>
          </div>
        </Section>
      )}

      {result && target && <ResultView result={result} target={target} onApply={apply} />}
    </div>
  );
}

function describe(b: Benchmark): string {
  if (b.kind === 'sobreviver') {
    const boost = b.attackerBoosts?.atk ?? 0;
    return `Sobreviver a ${b.move}${boost ? ` +${boost}` : ''} de ${b.attacker.species} (${b.strictness})`;
  }
  if (b.kind === 'matar') return `OHKO em ${b.defender.species} com ${b.move} (${b.strictness})`;
  return `Superar a Speed de ${b.target.species}`;
}

function ResultView({ result, target, onApply }: { result: OptimizeResult; target: ChampionsSet; onApply: () => void }) {
  const species = battleSpecies(target);
  const nature = natureByName(result.nature);
  const finalStats = species
    ? championsStats(baseStatsOf(species), result.spread, nature.plus, nature.minus)
    : null;

  return (
    <Section title="Resultado">
      <Card className="p-3">
        <div className="mb-2 flex items-center gap-2">
          <Pill tone={result.ok ? 'good' : 'danger'}>{result.ok ? 'Resolvido' : 'Nao cabe'}</Pill>
          <span className="text-xs text-ink-300">
            {result.nature} · {result.used}/{SP_TOTAL} SP · {result.remaining} livres
          </span>
        </div>

        {finalStats && (
          <div className="mb-3 grid grid-cols-6 gap-1 text-center">
            {STAT_IDS.map((id) => (
              <div key={id} className="rounded bg-ink-900 p-1.5">
                <p className="text-[9px] text-ink-400">{STAT_LABEL[id]}</p>
                <p className="text-sm text-ink-100">{finalStats[id]}</p>
                <p className="text-[10px] text-accent">{result.spread[id]} SP</p>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          {result.results.map((r) => (
            <div key={r.id} className="rounded-lg bg-ink-900 p-2">
              <div className="flex items-start gap-1.5">
                <Pill tone={r.satisfied ? 'good' : 'danger'}>{r.satisfied ? '✓' : '×'}</Pill>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-ink-100">{r.label}</p>
                  <p className="text-[11px] text-ink-400">{r.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {result.warnings.map((w, i) => (
          <p key={i} className="mt-1.5 text-[11px] text-warn">
            {w}
          </p>
        ))}

        <Button variant="primary" className="mt-3 w-full" onClick={onApply} disabled={!result.ok}>
          Aplicar no {species?.name}
        </Button>
      </Card>
    </Section>
  );
}
