import { useEffect, useMemo, useState } from 'react';
import { useTeamStore } from '../store/teamStore';
import { useMetaStore } from '../store/metaStore';
import { useRoster } from '../lib/roster';
import { battleSpecies, type ChampionsSet } from '../data/set';
import { getMove, learnsetOf } from '../data/dex';
import { presumedSetCached } from '../engine/presume';
import { calcDamage, effectiveSpeed, type FieldOptions } from '../engine/calc';
import { Card, Empty, Picker, Pill, Section, UsageBar, type Option } from '../components/ui';
import { useMetaStore as useMeta } from '../store/metaStore';

export default function CalcPage() {
  const team = useTeamStore((s) => s.teams.find((t) => t.id === s.activeId) ?? s.teams[0]);
  const snapshot = useMetaStore((s) => s.snapshot);
  const enrich = useMetaStore((s) => s.enrich);
  const roster = useRoster();

  const members = team.members.filter((m) => m.species);
  const [attackerId, setAttackerId] = useState(members[0]?.species ?? '');
  const [defenderId, setDefenderId] = useState('');
  const [attacker, setAttacker] = useState<ChampionsSet | null>(null);
  const [defender, setDefender] = useState<ChampionsSet | null>(null);
  const [field, setField] = useState<FieldOptions>({});
  const [atkBoost, setAtkBoost] = useState(0);
  const [defBoost, setDefBoost] = useState(0);
  // Golpes editados a mao. Enquanto vazio, valem os do set do ladder.
  const [atkMoves, setAtkMoves] = useState<string[] | null>(null);
  const [defMoves, setDefMoves] = useState<string[] | null>(null);

  // Um lado pode ser o seu set do time; o outro, o set mais jogado do ladder.
  const resolve = async (id: string, setter: (s: ChampionsSet | null) => void) => {
    if (!id) return setter(null);
    const mine = members.find((m) => m.species === id);
    if (mine) return setter(mine);
    await enrich(id);
    const p = await presumedSetCached(id, snapshot?.entries.find((e) => e.id === id) ?? null);
    setter(p.set);
  };

  useEffect(() => {
    setAtkMoves(null);
    void resolve(attackerId, setAttacker);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attackerId, snapshot, team.members]);

  useEffect(() => {
    setDefMoves(null);
    void resolve(defenderId, setDefender);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defenderId, snapshot, team.members]);

  // Um lado com golpes editados vira um set proprio, sem mexer no time salvo.
  const atkFinal = useMemo(
    () => (attacker && atkMoves ? { ...attacker, moves: atkMoves } : attacker),
    [attacker, atkMoves],
  );
  const defFinal = useMemo(
    () => (defender && defMoves ? { ...defender, moves: defMoves } : defender),
    [defender, defMoves],
  );

  const results = useMemo(() => {
    const attacker = atkFinal;
    const defender = defFinal;
    if (!attacker || !defender) return null;
    // Golpes de status nao entram na lista de dano: Protect e afins so
    // poluiriam a leitura com barras zeradas.
    const atacantes = (set: typeof attacker) =>
      set.moves.filter((m) => {
        const move = getMove(m);
        return Boolean(move) && move!.category !== 'Status';
      });

    const forward = atacantes(attacker)
      .map((m) =>
        calcDamage({
          attacker,
          defender,
          move: m,
          field,
          attackerBoosts: atkBoost ? { atk: atkBoost, spa: atkBoost } : undefined,
          defenderBoosts: defBoost ? { def: defBoost, spd: defBoost } : undefined,
        }),
      )
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.percent[1] - a.percent[1]);

    const back = atacantes(defender)
      .map((m) =>
        calcDamage({
          attacker: defender,
          defender: attacker,
          move: m,
          field,
          attackerBoosts: defBoost ? { atk: defBoost, spa: defBoost } : undefined,
          defenderBoosts: atkBoost ? { def: atkBoost, spd: atkBoost } : undefined,
        }),
      )
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.percent[1] - a.percent[1]);

    return { forward, back };
  }, [atkFinal, defFinal, field, atkBoost, defBoost]);

  const speeds = useMemo(() => {
    if (!atkFinal || !defFinal) return null;
    return {
      a: effectiveSpeed(atkFinal, field),
      d: effectiveSpeed(defFinal, { ...field, attackerTailwind: field.defenderTailwind }),
    };
  }, [atkFinal, defFinal, field]);

  return (
    <div>
      <Section title="Calculadora de dano" subtitle="Doubles: spread moves ja saem com o corte de 25%">
        <div className="grid grid-cols-2 gap-2">
          <Picker
            label="Atacante"
            value={attackerId}
            options={roster.options}
            onChange={setAttackerId}
          />
          <Picker
            label="Defensor"
            value={defenderId}
            options={roster.options}
            onChange={setDefenderId}
          />
        </div>

        <div className="scroll-x mt-3 flex gap-1.5 pb-1">
          <Chip active={field.weather === 'Sun'} onClick={() => setField((f) => ({ ...f, weather: f.weather === 'Sun' ? null : 'Sun' }))}>
            Sol
          </Chip>
          <Chip active={field.weather === 'Rain'} onClick={() => setField((f) => ({ ...f, weather: f.weather === 'Rain' ? null : 'Rain' }))}>
            Chuva
          </Chip>
          <Chip active={field.weather === 'Sand'} onClick={() => setField((f) => ({ ...f, weather: f.weather === 'Sand' ? null : 'Sand' }))}>
            Areia
          </Chip>
          <Chip active={!!field.reflect} onClick={() => setField((f) => ({ ...f, reflect: !f.reflect }))}>
            Reflect
          </Chip>
          <Chip active={!!field.lightScreen} onClick={() => setField((f) => ({ ...f, lightScreen: !f.lightScreen }))}>
            Light Screen
          </Chip>
          <Chip active={!!field.helpingHand} onClick={() => setField((f) => ({ ...f, helpingHand: !f.helpingHand }))}>
            Helping Hand
          </Chip>
          <Chip active={!!field.attackerTailwind} onClick={() => setField((f) => ({ ...f, attackerTailwind: !f.attackerTailwind }))}>
            Tailwind atacante
          </Chip>
          <Chip active={!!field.isCritical} onClick={() => setField((f) => ({ ...f, isCritical: !f.isCritical }))}>
            Critico
          </Chip>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <BoostRow label="Boost do atacante" value={atkBoost} onChange={setAtkBoost} />
          <BoostRow label="Boost do defensor" value={defBoost} onChange={setDefBoost} />
        </div>
      </Section>

      {!atkFinal || !defFinal ? (
        <Empty title="Escolha os dois lados." hint="Pokemon do seu time entram com o set que voce montou; os demais, com o set mais jogado." />
      ) : (
        <>
          {speeds && (
            <Card className="mb-4 flex items-center justify-between p-2.5 text-xs">
              <span className="text-ink-300">
                {battleSpecies(atkFinal)?.name}: <strong className="text-ink-100">{speeds.a}</strong> Speed
              </span>
              <Pill tone={speeds.a > speeds.d ? 'good' : speeds.a === speeds.d ? 'warn' : 'danger'}>
                {speeds.a > speeds.d ? 'age primeiro' : speeds.a === speeds.d ? 'speed tie' : 'age depois'}
              </Pill>
              <span className="text-ink-300">
                {battleSpecies(defFinal)?.name}: <strong className="text-ink-100">{speeds.d}</strong> Speed
              </span>
            </Card>
          )}

          <Section
            title={`Golpes de ${battleSpecies(atkFinal)?.name}`}
            subtitle="Comeca com os mais jogados do ladder; troque por qualquer um do movepool"
            right={
              atkMoves ? (
                <button onClick={() => setAtkMoves(null)} className="text-[11px] text-accent">
                  Voltar ao padrao
                </button>
              ) : undefined
            }
          >
            <MoveSlots
              speciesId={attacker!.species}
              moves={atkFinal.moves}
              onChange={setAtkMoves}
            />
          </Section>

          <Section title={`${battleSpecies(atkFinal)?.name} → ${battleSpecies(defFinal)?.name}`}>
            <DamageList results={results?.forward ?? []} />
          </Section>

          <Section
            title={`Golpes de ${battleSpecies(defFinal)?.name}`}
            right={
              defMoves ? (
                <button onClick={() => setDefMoves(null)} className="text-[11px] text-accent">
                  Voltar ao padrao
                </button>
              ) : undefined
            }
          >
            <MoveSlots
              speciesId={defender!.species}
              moves={defFinal.moves}
              onChange={setDefMoves}
            />
          </Section>

          <Section title={`${battleSpecies(defFinal)?.name} → ${battleSpecies(atkFinal)?.name}`}>
            <DamageList results={results?.back ?? []} />
          </Section>
        </>
      )}
    </div>
  );
}

function DamageList({ results }: { results: NonNullable<ReturnType<typeof calcDamage>>[] }) {
  if (!results.length) return <Empty title="Nenhum golpe de ataque neste set." />;
  return (
    <div className="space-y-1.5">
      {results.map((r) => {
        const move = getMove(r.move);
        const ko = r.percent[0] >= 1;
        return (
          <Card key={r.move} className="p-2.5">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="text-sm text-ink-100">{r.move}</span>
              {move && <Pill>{move.type}</Pill>}
              {r.effectiveness > 1 && <Pill tone="good">{r.effectiveness}x</Pill>}
              {r.effectiveness === 0 && <Pill tone="danger">imune</Pill>}
              {r.effectiveness > 0 && r.effectiveness < 1 && <Pill tone="warn">{r.effectiveness}x</Pill>}
              {(move?.priority ?? 0) > 0 && <Pill tone="accent">prioridade +{move?.priority}</Pill>}
              {ko && <Pill tone="danger">OHKO</Pill>}
            </div>
            <UsageBar value={r.percent[1]} tone={r.percent[1] >= 1 ? 'danger' : 'accent'} />
            <p className="mt-1 text-[11px] text-ink-300">
              {(r.percent[0] * 100).toFixed(1)}% – {(r.percent[1] * 100).toFixed(1)}% ({r.damage[0]}–{r.damage[1]} de{' '}
              {r.defenderMaxHp}) · {r.koText}
            </p>
          </Card>
        );
      })}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${
        active ? 'border-accent bg-accent/10 text-accent' : 'border-ink-700 text-ink-400'
      }`}
    >
      {children}
    </button>
  );
}

function BoostRow({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-850 p-2">
      <p className="mb-1 text-[10px] tracking-wide text-ink-400 uppercase">{label}</p>
      <div className="flex items-center gap-1">
        {[-2, -1, 0, 1, 2].map((b) => (
          <button
            key={b}
            onClick={() => onChange(b)}
            className={`flex-1 rounded py-1 text-[11px] ${
              value === b ? 'bg-accent text-white' : 'bg-ink-800 text-ink-400'
            }`}
          >
            {b > 0 ? `+${b}` : b}
          </button>
        ))}
      </div>
    </div>
  );
}


/**
 * Quatro slots de golpe alimentados pelo movepool completo, ordenados por
 * usage no ladder.
 *
 * De proposito nao ficamos presos aos quatro mais jogados: boa parte do
 * formato troca de movepool conforme o matchup, e o golpe que decide um
 * confronto costuma ser justamente o que sai da lista padrao.
 */
function MoveSlots({
  speciesId,
  moves,
  onChange,
}: {
  speciesId: string;
  moves: string[];
  onChange: (moves: string[]) => void;
}) {
  const [pool, setPool] = useState<string[]>([]);
  const entry = useMeta((s) => s.entry(speciesId));

  useEffect(() => {
    let alive = true;
    void learnsetOf(speciesId).then((list) => {
      if (alive) setPool(list);
    });
    return () => {
      alive = false;
    };
  }, [speciesId]);

  const usage = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of entry?.moves ?? []) {
      const move = getMove(m.name);
      if (move) map.set(move.name, m.usage);
    }
    return map;
  }, [entry]);

  const options: Option[] = useMemo(() => {
    const rows = pool
      .map((name) => getMove(name)!)
      .filter(Boolean)
      .map((move) => {
        const u = usage.get(move.name);
        return {
          option: {
            value: move.name,
            label: move.name,
            hint:
              `${move.type} · ${move.category}` +
              (move.basePower ? ` · ${move.basePower} BP` : '') +
              ((move.priority ?? 0) > 0 ? ` · prioridade +${move.priority}` : '') +
              (u !== undefined ? ` · ${(u * 100).toFixed(0)}% do ladder` : ''),
          } satisfies Option,
          rank: u ?? -1,
        };
      })
      .sort((a, b) => b.rank - a.rank || a.option.label.localeCompare(b.option.label));
    return rows.map((r) => r.option);
  }, [pool, usage]);

  const setSlot = (i: number, value: string) => {
    const next = [...moves];
    if (!value) next.splice(i, 1);
    else next[i] = value;
    onChange(next.filter(Boolean).slice(0, 4));
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {[0, 1, 2, 3].map((i) => (
        <Picker
          key={i}
          label={`Golpe ${i + 1}`}
          value={moves[i] ?? ''}
          options={options}
          onChange={(v) => setSlot(i, v)}
          emptyLabel="Vazio"
          placeholder={options.length ? 'Escolher...' : 'Carregando movepool...'}
        />
      ))}
    </div>
  );
}
