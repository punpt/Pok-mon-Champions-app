import { useEffect, useMemo, useState } from 'react';
import { useTeamStore } from '../store/teamStore';
import { useMetaStore } from '../store/metaStore';
import { useRoster } from '../lib/roster';
import { battleSpecies, type ChampionsSet } from '../data/set';
import type { SpSpread } from '../data/stats';
import { NATURES } from '../data/dex';
import SpEditor from '../components/SpEditor';
import MoveSlot from '../components/MoveSlot';
import { getMove } from '../data/dex';
import { presumedSetCached } from '../engine/presume';
import { calcDamage, effectiveSpeed, type FieldOptions } from '../engine/calc';
import { Card, Empty, Picker, Pill, Section, UsageBar } from '../components/ui';
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
  // Golpes e spread editados a mao. Enquanto vazios, valem os do set do ladder.
  const [atkMoves, setAtkMoves] = useState<string[] | null>(null);
  const [defMoves, setDefMoves] = useState<string[] | null>(null);
  const [atkTune, setAtkTune] = useState<Tune | null>(null);
  const [defTune, setDefTune] = useState<Tune | null>(null);

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
    setAtkTune(null);
    void resolve(attackerId, setAttacker);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attackerId, snapshot, team.members]);

  useEffect(() => {
    setDefMoves(null);
    setDefTune(null);
    void resolve(defenderId, setDefender);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defenderId, snapshot, team.members]);

  // Um lado com golpes editados vira um set proprio, sem mexer no time salvo.
  const atkFinal = useMemo(
    () => aplicarEdicoes(attacker, atkMoves, atkTune),
    [attacker, atkMoves, atkTune],
  );
  const defFinal = useMemo(
    () => aplicarEdicoes(defender, defMoves, defTune),
    [defender, defMoves, defTune],
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

          {/* Cada lado fica ao lado do dano que ELE recebe: ajustar bulk e ver
              a rolagem cair no mesmo lugar e o fluxo de "quanto preciso para
              sobreviver". Separar os dois obrigava a rolar a cada ponto. */}
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
            <SlotsDeGolpe set={atkFinal} onChange={setAtkMoves} />
          </Section>

          <Section title={`${battleSpecies(atkFinal)?.name} → ${battleSpecies(defFinal)?.name}`}>
            <DamageList results={results?.forward ?? []} />
          </Section>

          <Section
            title={`Stat Points de ${battleSpecies(defFinal)?.name}`}
            subtitle="Suba o bulk e veja a rolagem acima cair ate parar de matar"
            right={
              defTune ? (
                <button onClick={() => setDefTune(null)} className="text-[11px] text-accent">
                  Voltar ao padrao
                </button>
              ) : undefined
            }
          >
            <Sobrevivencia recebido={results?.forward ?? []} />
            <TuneBlock set={defFinal} onChange={setDefTune} />
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
            <SlotsDeGolpe set={defFinal} onChange={setDefMoves} />
          </Section>

          <Section title={`${battleSpecies(defFinal)?.name} → ${battleSpecies(atkFinal)?.name}`}>
            <DamageList results={results?.back ?? []} />
          </Section>

          <Section
            title={`Stat Points de ${battleSpecies(atkFinal)?.name}`}
            right={
              atkTune ? (
                <button onClick={() => setAtkTune(null)} className="text-[11px] text-accent">
                  Voltar ao padrao
                </button>
              ) : undefined
            }
          >
            <Sobrevivencia recebido={results?.back ?? []} />
            <TuneBlock set={atkFinal} onChange={setAtkTune} />
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


/** Spread e nature editados na propria calculadora. */
interface Tune {
  sp: SpSpread;
  nature: string;
}

/**
 * Aplica as edicoes locais sobre o set base sem tocar no time salvo.
 *
 * A calculadora e uma bancada de teste: mexer no bulk aqui nao pode alterar o
 * time por acidente. Quando o jogador acha o numero que queria, ele leva o
 * spread para o editor do time de proposito.
 */
function aplicarEdicoes(
  base: ChampionsSet | null,
  moves: string[] | null,
  tune: Tune | null,
): ChampionsSet | null {
  if (!base) return null;
  let out = base;
  if (moves) out = { ...out, moves };
  if (tune) out = { ...out, sp: tune.sp, nature: tune.nature };
  return out;
}

/**
 * Editor de Stat Points embutido na calculadora.
 *
 * E aqui que se descobre o bulk exato: voce sobe HP e Def um ponto por vez e ve
 * a rolagem maxima do golpe cair, ate parar de matar. Sem isso a unica forma de
 * achar o minimo era tentar um spread, ir para o time, voltar e recalcular.
 */
function TuneBlock({ set, onChange }: { set: ChampionsSet; onChange: (t: Tune) => void }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-3">
      <div className="mb-2">
        <Picker
          label="Nature"
          value={set.nature}
          options={NATURES.map((n) => ({
            value: n.name,
            label: n.name,
            hint: n.plus && n.minus ? `+${n.plus} / −${n.minus}` : 'neutra',
          }))}
          onChange={(v) => onChange({ sp: set.sp, nature: v })}
        />
      </div>
      <SpEditor set={set} onChange={(sp) => onChange({ sp, nature: set.nature })} />
    </div>
  );
}


/**
 * Veredito de sobrevivencia contra o golpe mais forte que chega.
 *
 * E o numero que se persegue ao mexer no bulk: nao "quanto dano ele faz", e
 * "eu aguento?". Fica colado no editor de Stat Points para a resposta aparecer
 * no mesmo lugar em que se mexe.
 */
function Sobrevivencia({ recebido }: { recebido: NonNullable<ReturnType<typeof calcDamage>>[] }) {
  if (!recebido.length) return null;
  const pior = recebido.reduce((a, b) => (b.percent[1] > a.percent[1] ? b : a));
  const mata = pior.percent[1] >= 1;
  const sempreMata = pior.percent[0] >= 1;
  // Quantas das 16 rolagens matam: e a leitura honesta da margem.
  const rolagensQueMatam = pior.rolls.filter((r) => r >= pior.defenderMaxHp).length;

  const tom = sempreMata ? 'danger' : mata ? 'warn' : 'good';
  const texto = sempreMata
    ? `Morre para ${pior.move} em qualquer rolagem.`
    : mata
      ? `Morre para ${pior.move} em ${rolagensQueMatam} de 16 rolagens.`
      : `Sobrevive a ${pior.move} com folga de ${(100 - pior.percent[1] * 100).toFixed(1)}% do HP.`;

  return (
    <div
      className={`mb-2 rounded-lg border px-2.5 py-2 text-[11px] ${
        tom === 'danger'
          ? 'border-danger/30 bg-danger/10 text-danger'
          : tom === 'warn'
            ? 'border-warn/30 bg-warn/10 text-warn'
            : 'border-good/30 bg-good/10 text-good'
      }`}
    >
      {texto}
    </div>
  );
}


/** Os quatro slots de golpe de um lado da calculadora. */
function SlotsDeGolpe({ set, onChange }: { set: ChampionsSet; onChange: (moves: string[]) => void }) {
  const entry = useMeta((s) => s.entry(set.species));
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const mv of entry?.moves ?? []) {
      const move = getMove(mv.name);
      if (move) m.set(move.name, mv.usage);
    }
    return m;
  }, [entry]);

  const trocar = (i: number, valor: string) => {
    const next = [...set.moves];
    if (!valor) next.splice(i, 1);
    else next[i] = valor;
    onChange(next.filter(Boolean).slice(0, 4));
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {[0, 1, 2, 3].map((i) => (
        <MoveSlot
          key={i}
          indice={i}
          move={set.moves[i] ?? ''}
          speciesId={set.species}
          item={set.item}
          outros={set.moves.filter((_, j) => j !== i)}
          usage={usage.get(set.moves[i] ?? '')}
          onChange={(v) => trocar(i, v)}
        />
      ))}
    </div>
  );
}
