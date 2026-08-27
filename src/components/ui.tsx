import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { TYPE_COLOR, baseFormOf, getSpecies, type Specie, type TypeName } from '../data/dex';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-ink-700 bg-ink-850 ${className}`}>{children}</div>
  );
}

export function Section({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-5">
      <header className="mb-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-wide text-ink-100 uppercase">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs leading-snug text-ink-400">{subtitle}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

export function TypeBadge({ type }: { type: TypeName | string }) {
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-ink-950 uppercase"
      style={{ background: TYPE_COLOR[type] ?? '#6b7896' }}
    >
      {type}
    </span>
  );
}

/** Sprite com fallback para a forma base quando a Mega nova ainda nao tem arte. */
export function Sprite({ species, size = 48 }: { species: Specie | string | null; size?: number }) {
  const s = typeof species === 'string' ? getSpecies(species) : species;
  const [failed, setFailed] = useState(false);
  const src = useMemo(() => {
    if (!s) return null;
    const id = failed ? baseFormOf(s).id : s.id;
    return `https://play.pokemonshowdown.com/sprites/gen5/${id}.png`;
  }, [s, failed]);

  if (!s || !src) {
    return (
      <div
        className="flex items-center justify-center rounded bg-ink-800 text-ink-600"
        style={{ width: size, height: size }}
      >
        ?
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={s.name}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
    />
  );
}

export function UsageBar({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'danger' | 'good' }) {
  const color = tone === 'danger' ? 'var(--color-danger)' : tone === 'good' ? 'var(--color-good)' : 'var(--color-accent)';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color }}
      />
    </div>
  );
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'danger' | 'warn' | 'good' | 'accent';
}) {
  const map = {
    neutral: 'bg-ink-800 text-ink-300',
    danger: 'bg-danger/15 text-danger',
    warn: 'bg-warn/15 text-warn',
    good: 'bg-good/15 text-good',
    accent: 'bg-accent/15 text-accent',
  } as const;
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${map[tone]}`}>{children}</span>;
}

export function Button({
  children,
  onClick,
  variant = 'ghost',
  disabled,
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const map = {
    primary: 'bg-accent text-white hover:bg-accent/85',
    ghost: 'border border-ink-700 bg-ink-800 text-ink-100 hover:border-ink-600',
    danger: 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
  } as const;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${map[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export interface Option {
  value: string;
  label: string;
  hint?: string;
  sprite?: string;
}

/**
 * Seletor com busca. Em vez de um <select> nativo (impraticavel com 900 golpes
 * no celular), abre uma folha com campo de busca e teclado ja em foco.
 */
export function Picker({
  label,
  value,
  options,
  onChange,
  placeholder = 'Escolher...',
  emptyLabel,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      // Espera a folha montar antes de focar, senao o teclado nao sobe no iOS.
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 300);
    return options
      .filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q))
      .slice(0, 300);
  }, [options, query]);

  const current = options.find((o) => o.value === value);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-left transition hover:border-ink-600"
      >
        <span className="block text-[10px] tracking-wide text-ink-400 uppercase">{label}</span>
        <span className={`block truncate text-sm ${current ? 'text-ink-100' : 'text-ink-400'}`}>
          {current?.label ?? placeholder}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-ink-950/80 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="mt-auto flex max-h-[85vh] flex-col rounded-t-2xl border-t border-ink-700 bg-ink-900 safe-bottom sm:m-auto sm:max-h-[70vh] sm:w-full sm:max-w-lg sm:rounded-2xl sm:border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-ink-800 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs tracking-wide text-ink-400 uppercase">{label}</span>
                <button onClick={() => setOpen(false)} className="text-sm text-ink-400">
                  Fechar
                </button>
              </div>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {emptyLabel && (
                <button
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                  className="mb-1 w-full rounded-lg px-3 py-2 text-left text-sm text-ink-400 hover:bg-ink-800"
                >
                  {emptyLabel}
                </button>
              )}
              {filtered.map((o) => (
                <button
                  key={o.value}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-ink-800 ${
                    o.value === value ? 'bg-ink-800' : ''
                  }`}
                >
                  {o.sprite && (
                    <img src={o.sprite} alt="" width={32} height={32} style={{ imageRendering: 'pixelated' }} loading="lazy" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink-100">{o.label}</span>
                    {o.hint && <span className="block truncate text-xs text-ink-400">{o.hint}</span>}
                  </span>
                </button>
              ))}
              {!filtered.length && <p className="p-4 text-center text-sm text-ink-400">Nada encontrado.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-400">
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-ink-600 border-t-accent" />
      {label}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-700 p-6 text-center">
      <p className="text-sm text-ink-300">{title}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}
