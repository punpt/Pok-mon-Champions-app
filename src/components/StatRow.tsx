import type { StatID } from '../data/stats';
import { SP_MAX_PER_STAT, STAT_LABEL } from '../data/stats';

/**
 * Uma linha do editor de Stat Points.
 *
 * Slider sozinho nao serve: acertar exatamente 32, ou o 12 que um benchmark
 * pede, e quase impossivel com o dedo numa faixa de 32 passos. Os botoes dao a
 * precisao e o slider da o alcance — quem quer varrer usa a faixa, quem quer um
 * numero exato usa o passo.
 *
 * A barra mostra a proporcao investida, e o valor final do stat fica sempre a
 * vista, porque e nele que se mira, nao no SP.
 */
export default function StatRow({
  stat,
  sp,
  finalValue,
  baseValue,
  natureMod,
  disponivel,
  onChange,
}: {
  stat: StatID;
  sp: number;
  finalValue: number;
  baseValue: number;
  /** 1.1, 0.9 ou 1. */
  natureMod: number;
  /** Quantos SP ainda restam no pool. */
  disponivel: number;
  onChange: (sp: number) => void;
}) {
  const boosted = natureMod > 1;
  const hindered = natureMod < 1;
  const teto = Math.min(SP_MAX_PER_STAT, sp + disponivel);

  const set = (valor: number) => onChange(Math.max(0, Math.min(teto, Math.round(valor))));

  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <span
        className={`w-10 shrink-0 text-[11px] font-semibold ${
          boosted ? 'text-good' : hindered ? 'text-danger' : 'text-ink-300'
        }`}
      >
        {STAT_LABEL[stat]}
        {boosted ? '+' : hindered ? '−' : ''}
      </span>

      <button
        onClick={() => set(sp - 1)}
        disabled={sp <= 0}
        aria-label={`Diminuir ${STAT_LABEL[stat]}`}
        className="h-8 w-8 shrink-0 rounded-lg border border-ink-700 bg-ink-800 text-sm text-ink-200 transition active:scale-90 disabled:opacity-30"
      >
        −
      </button>

      <div className="relative min-w-0 flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-ink-800">
          <div
            className="h-full rounded-full transition-[width]"
            style={{
              width: `${(sp / SP_MAX_PER_STAT) * 100}%`,
              background: boosted ? 'var(--color-good)' : hindered ? 'var(--color-danger)' : 'var(--color-accent)',
            }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={SP_MAX_PER_STAT}
          value={sp}
          onChange={(e) => set(Number(e.target.value))}
          aria-label={`${STAT_LABEL[stat]} em Stat Points`}
          className="relative w-full appearance-none bg-transparent"
          style={{ height: 32 }}
        />
      </div>

      <button
        onClick={() => set(sp + 1)}
        disabled={sp >= teto}
        aria-label={`Aumentar ${STAT_LABEL[stat]}`}
        className="h-8 w-8 shrink-0 rounded-lg border border-ink-700 bg-ink-800 text-sm text-ink-200 transition active:scale-90 disabled:opacity-30"
      >
        +
      </button>

      <button
        onClick={() => set(teto)}
        disabled={sp >= teto}
        aria-label={`Maximo em ${STAT_LABEL[stat]}`}
        className="h-8 shrink-0 rounded-lg border border-ink-700 bg-ink-800 px-1.5 text-[10px] font-semibold text-ink-300 transition active:scale-90 disabled:opacity-30"
      >
        MAX
      </button>

      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-ink-500">{sp}</span>
      <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-ink-100">{finalValue}</span>
      <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-ink-600">{baseValue}</span>
    </div>
  );
}
