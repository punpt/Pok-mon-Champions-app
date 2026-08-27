import { useMemo } from 'react';
import type { ChampionsSet } from '../data/set';
import { battleSpecies } from '../data/set';
import {
  championsStats,
  SP_MAX_PER_STAT,
  SP_TOTAL,
  STAT_IDS,
  STAT_LABEL,
  spreadTotal,
  type SpSpread,
  type StatID,
} from '../data/stats';
import { baseStatsOf, natureByName } from '../data/dex';

/**
 * Editor de Stat Points.
 *
 * Mostra o stat final ao lado do investimento, porque no Champions 1 SP vale
 * exatamente 1 ponto — o jogador consegue mirar um numero e chegar nele. O
 * contador de SP restante trava a distribuicao no teto de 66 e de 32 por stat.
 */
export default function SpEditor({
  set,
  onChange,
}: {
  set: ChampionsSet;
  onChange: (sp: SpSpread) => void;
}) {
  const species = battleSpecies(set);
  const nature = natureByName(set.nature);

  const { base, finalStats, used, remaining } = useMemo(() => {
    const b = species ? baseStatsOf(species) : { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    return {
      base: b,
      finalStats: championsStats(b, set.sp, nature.plus, nature.minus),
      used: spreadTotal(set.sp),
      remaining: SP_TOTAL - spreadTotal(set.sp),
    };
  }, [species, set.sp, nature]);

  const setStat = (id: StatID, raw: number) => {
    const value = Math.max(0, Math.min(SP_MAX_PER_STAT, Math.round(raw)));
    const others = STAT_IDS.reduce((s, k) => (k === id ? s : s + set.sp[k]), 0);
    // Nunca deixamos passar de 66 no total: o slider para onde o pool acaba.
    const capped = Math.min(value, SP_TOTAL - others);
    onChange({ ...set.sp, [id]: capped });
  };

  if (!species) return null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-ink-400">Stat Points</span>
        <span className={remaining < 0 ? 'text-danger' : remaining === 0 ? 'text-good' : 'text-ink-300'}>
          {used} / {SP_TOTAL} usados · <strong>{remaining}</strong> livres
        </span>
      </div>

      <div className="space-y-2">
        {STAT_IDS.map((id) => {
          const sp = set.sp[id];
          const boosted = nature.plus === id;
          const hindered = nature.minus === id;
          return (
            <div key={id} className="flex items-center gap-2">
              <span
                className={`w-9 shrink-0 text-xs font-semibold ${
                  boosted ? 'text-good' : hindered ? 'text-danger' : 'text-ink-300'
                }`}
              >
                {STAT_LABEL[id]}
                {boosted ? '+' : hindered ? '−' : ''}
              </span>

              <input
                type="range"
                min={0}
                max={SP_MAX_PER_STAT}
                value={sp}
                onChange={(e) => setStat(id, Number(e.target.value))}
                className="min-w-0 flex-1"
              />

              <input
                type="number"
                min={0}
                max={SP_MAX_PER_STAT}
                value={sp}
                onChange={(e) => setStat(id, Number(e.target.value))}
                className="w-12 shrink-0 rounded border border-ink-700 bg-ink-850 px-1 py-0.5 text-center text-xs outline-none focus:border-accent"
              />

              <span className="w-11 shrink-0 text-right text-xs tabular-nums text-ink-100">
                {finalStats[id]}
              </span>
              <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-ink-600">
                {base[id]}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Preset label="Ofensivo rapido" onClick={() => onChange(preset('offense', set))} />
        <Preset label="Bulk fisico" onClick={() => onChange(preset('physical', set))} />
        <Preset label="Bulk especial" onClick={() => onChange(preset('special', set))} />
        <Preset label="Trick Room" onClick={() => onChange(preset('trickroom', set))} />
        <Preset label="Zerar" onClick={() => onChange({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 })} />
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-ink-600">
        A ultima coluna e o base stat. Cada SP vale +1 ponto antes da nature, teto de {SP_MAX_PER_STAT} por stat.
      </p>
    </div>
  );
}

function Preset({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded border border-ink-700 bg-ink-800 px-2 py-1 text-[11px] text-ink-300 hover:border-ink-600"
    >
      {label}
    </button>
  );
}

function preset(kind: 'offense' | 'physical' | 'special' | 'trickroom', set: ChampionsSet): SpSpread {
  const species = battleSpecies(set);
  const base = species ? baseStatsOf(species) : null;
  const offensive: StatID = !base || base.atk >= base.spa ? 'atk' : 'spa';
  const zero: SpSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

  switch (kind) {
    case 'offense':
      return { ...zero, [offensive]: 32, spe: 32, hp: 2 };
    case 'physical':
      return { ...zero, hp: 32, def: 32, [offensive]: 2 };
    case 'special':
      return { ...zero, hp: 32, spd: 32, [offensive]: 2 };
    case 'trickroom':
      return { ...zero, [offensive]: 32, hp: 32, def: 2, spe: 0 };
  }
}
