import { useEffect, useMemo } from 'react';
import type { ChampionsSet } from '../data/set';
import { battleSpecies, willMegaEvolve } from '../data/set';
import { abilitiesOf, dex, getMove, getSpecies, NATURES } from '../data/dex';
import { legalItemsFor } from '../data/items';
import { Link } from 'react-router-dom';
import { Picker, Sprite, TypeBadge, Pill, Button, type Option } from './ui';
import SpEditor from './SpEditor';
import MoveSlot from './MoveSlot';
import { STAT_IDS, STAT_LABEL } from '../data/stats';
import { useMetaStore } from '../store/metaStore';

/** Itens que esta especie pode segurar no formato. */
function itemOptions(speciesId: string): Option[] {
  return legalItemsFor(speciesId).map(({ item, isMegaStone }) => ({
    value: item.name,
    label: item.name,
    hint: isMegaStone ? `Mega Stone — vira ${item.megaStone ?? 'a forma Mega'}` : item.shortDesc || item.desc,
  }));
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
  const entry = useMetaStore((s) => s.entry(set.species));
  const enrich = useMetaStore((s) => s.enrich);

  const species = getSpecies(set.species);
  const battle = battleSpecies(set);

  useEffect(() => {
    if (!set.species) return;
    void enrich(set.species);
  }, [set.species, enrich]);

  const moveUsage = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of entry?.moves ?? []) {
      const move = getMove(m.name);
      if (move) map.set(move.name, m.usage);
    }
    return map;
  }, [entry]);

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
        <button
          onClick={onRemove}
          className="shrink-0 self-start rounded-lg border border-ink-700 px-2.5 py-1.5 text-[11px] text-danger transition active:scale-95"
        >
          Remover
        </button>
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
          <MoveSlot
            key={i}
            indice={i}
            move={set.moves[i] ?? ''}
            speciesId={set.species}
            item={set.item}
            outros={set.moves.filter((_, j) => j !== i)}
            usage={moveUsage.get(set.moves[i] ?? '')}
            onChange={(v) => setMove(i, v)}
          />
        ))}
      </div>

      {(entry?.spreads?.length ?? 0) > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-[10px] tracking-wide text-ink-400 uppercase">Spreads mais jogados</p>
          <div className="scroll-x flex gap-1.5 pb-1">
            {entry!.spreads.slice(0, 6).map((sp, i) => {
              const ativo =
                set.nature === sp.nature &&
                STAT_IDS.every((id) => set.sp[id] === sp.sp[id]);
              return (
                <button
                  key={i}
                  onClick={() => onChange({ sp: sp.sp, nature: sp.nature })}
                  className={`shrink-0 rounded-lg border px-2 py-1.5 text-left ${
                    ativo ? 'border-accent bg-accent/10' : 'border-ink-700 bg-ink-800'
                  }`}
                >
                  <span className="block text-[11px] text-ink-100">
                    {sp.nature} {STAT_IDS.filter((id) => sp.sp[id] > 0).map((id) => `${sp.sp[id]} ${STAT_LABEL[id]}`).join(' / ')}
                  </span>
                  {sp.usage > 0 && (
                    <span className="block text-[10px] text-ink-400">{(sp.usage * 100).toFixed(0)}% do ladder</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <SpEditor set={set} onChange={(sp) => onChange({ sp })} />

      <Link to="/calc" className="mt-3 block">
        <Button className="w-full">Testar na calculadora</Button>
      </Link>
    </div>
  );
}
