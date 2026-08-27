import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ChampionsSet } from '../data/set';
import { battleSpecies, willMegaEvolve } from '../data/set';
import { abilitiesOf, dex, getMove, getSpecies, learnsetOf, megasOf, NATURES } from '../data/dex';
import { Picker, Sprite, TypeBadge, Pill, Button, type Option } from './ui';
import SpEditor from './SpEditor';
import { useMetaStore } from '../store/metaStore';

/** Itens plausiveis em VGC. A lista completa do dex tem lixo de campanha. */
function itemOptions(speciesId: string): Option[] {
  const stones = new Set(
    megasOf(getSpecies(speciesId) ?? ({} as never))
      .map((m) => String(m.requiredItem))
      .filter(Boolean),
  );

  return dex.items
    .all()
    .filter((i) => i.exists && i.isNonstandard !== 'CAP')
    .filter((i) => {
      // Mega Stones so aparecem para quem realmente mega evolui com elas.
      if (i.megaStone || /ite( [XYZ])?$/.test(i.name)) return stones.has(i.name);
      return true;
    })
    .map((i) => ({
      value: i.name,
      label: i.name,
      hint: stones.has(i.name) ? 'Mega Stone desta especie' : i.shortDesc || i.desc,
    }))
    .sort((a, b) => {
      const aStone = stones.has(a.value) ? 0 : 1;
      const bStone = stones.has(b.value) ? 0 : 1;
      return aStone - bStone || a.label.localeCompare(b.label);
    });
}

export default function SetEditor({
  set,
  onChange,
  onRemove,
}: {
  set: ChampionsSet;
  onChange: (patch: Partial<ChampionsSet>) => void;
  onRemove: () => void;
}) {
  const [moves, setMoves] = useState<string[]>([]);
  const entry = useMetaStore((s) => s.entry(set.species));
  const enrich = useMetaStore((s) => s.enrich);

  const species = getSpecies(set.species);
  const battle = battleSpecies(set);

  useEffect(() => {
    if (!set.species) return;
    let alive = true;
    void learnsetOf(set.species).then((list) => {
      if (alive) setMoves(list);
    });
    void enrich(set.species);
    return () => {
      alive = false;
    };
  }, [set.species, enrich]);

  const moveUsage = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of entry?.moves ?? []) {
      const move = getMove(m.name);
      if (move) map.set(move.name, m.usage);
    }
    return map;
  }, [entry]);

  const moveOptions: Option[] = useMemo(
    () =>
      moves
        .map((name) => {
          const move = getMove(name)!;
          const usage = moveUsage.get(move.name);
          return {
            value: move.name,
            label: move.name,
            hint: `${move.type} · ${move.category}${move.basePower ? ` · ${move.basePower} BP` : ''}${
              usage ? ` · ${(usage * 100).toFixed(0)}% do ladder` : ''
            }`,
            sortKey: usage ?? -1,
          };
        })
        .sort((a, b) => b.sortKey - a.sortKey || a.label.localeCompare(b.label))
        .map(({ sortKey, ...o }) => {
          void sortKey;
          return o;
        }),
    [moves, moveUsage],
  );

  const itemOpts = useMemo(() => itemOptions(set.species), [set.species]);

  const abilityOpts: Option[] = useMemo(() => {
    if (!species) return [];
    return abilitiesOf(species).map((a) => ({
      value: a,
      label: a,
      hint: dex.abilities.get(a)?.shortDesc,
    }));
  }, [species]);

  if (!species || !battle) return null;

  const mega = willMegaEvolve(set);

  const setMove = (index: number, name: string) => {
    const next = [...set.moves];
    if (!name) next.splice(index, 1);
    else next[index] = name;
    onChange({ moves: next.filter(Boolean).slice(0, 4) });
  };

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-3">
      <div className="mb-3 flex items-start gap-3">
        <Sprite species={battle} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-semibold text-ink-100">{battle.name}</h3>
            {mega && <Pill tone="accent">Mega</Pill>}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {(battle.types as readonly string[]).map((t) => (
              <TypeBadge key={t} type={t} />
            ))}
          </div>
          {entry && (
            <p className="mt-1 text-[11px] text-ink-400">
              #{entry.rank} no ladder · {(entry.usage * 100).toFixed(1)}% de usage
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Link
            to={`/sinergia/${set.species}`}
            className="rounded border border-ink-700 px-2 py-1 text-[11px] text-ink-300 hover:border-accent hover:text-accent"
          >
            Sinergias
          </Link>
          <button onClick={onRemove} className="rounded border border-ink-700 px-2 py-1 text-[11px] text-danger">
            Remover
          </button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <Picker label="Ability" value={set.ability} options={abilityOpts} onChange={(v) => onChange({ ability: v })} />
        <Picker
          label="Item"
          value={set.item}
          options={itemOpts}
          onChange={(v) => onChange({ item: v })}
          emptyLabel="Sem item"
        />
        <Picker
          label="Nature"
          value={set.nature}
          options={NATURES.map((n) => ({
            value: n.name,
            label: n.name,
            hint: n.plus && n.minus ? `+${n.plus} / −${n.minus}` : 'neutra',
          }))}
          onChange={(v) => onChange({ nature: v })}
        />
        <div className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-2">
          <span className="block text-[10px] tracking-wide text-ink-400 uppercase">Nivel</span>
          <span className="block text-sm text-ink-100">50 (fixo no Champions)</span>
        </div>
      </div>

      {mega && (
        <p className="mb-3 rounded-lg border border-accent/25 bg-accent/10 px-2.5 py-1.5 text-[11px] text-accent">
          Segurando {set.item}, entra em campo como {battle.name} com {abilitiesOf(battle)[0]}. So um Pokemon pode mega
          evoluir por partida.
        </p>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Picker
            key={i}
            label={`Golpe ${i + 1}`}
            value={set.moves[i] ?? ''}
            options={moveOptions}
            onChange={(v) => setMove(i, v)}
            emptyLabel="Vazio"
            placeholder={moveOptions.length ? 'Escolher...' : 'Carregando movepool...'}
          />
        ))}
      </div>

      <SpEditor set={set} onChange={(sp) => onChange({ sp })} />

      <div className="mt-3 flex gap-2">
        <Link to="/sp" className="flex-1">
          <Button className="w-full">Otimizar SP</Button>
        </Link>
        <Link to="/calc" className="flex-1">
          <Button className="w-full">Calcular dano</Button>
        </Link>
      </div>
    </div>
  );
}
