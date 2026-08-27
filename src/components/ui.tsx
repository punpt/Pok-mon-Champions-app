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

/**
 * Sprite com dois niveis de fallback.
 *
 * Primeiro tenta a forma exata; se falhar, a forma base — Megas recentes nem
 * sempre tem arte publicada. Se as duas falharem, entra um marcador neutro com
 * a inicial. O alt fica vazio de proposito: com texto, o navegador desenha o
 * nome em tamanho real no lugar da imagem quebrada e destroi o layout do card,
 * que e exatamente o que acontece sem rede. O nome ja esta escrito ao lado.
 */
export function Sprite({ species, size = 48 }: { species: Specie | string | null; size?: number }) {
  const s = typeof species === 'string' ? getSpecies(species) : species;
  const [tentativa, setTentativa] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    setTentativa(0);
  }, [s?.id]);

  const src = useMemo(() => {
    if (!s || tentativa === 2) return null;
    const id = tentativa === 0 ? s.id : baseFormOf(s).id;
    return `https://play.pokemonshowdown.com/sprites/gen5/${id}.png`;
  }, [s, tentativa]);

  if (!s || !src) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-lg bg-ink-800 font-semibold text-ink-600"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
        title={s?.name}
        aria-hidden="true"
      >
        {s ? s.name.charAt(0) : '?'}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setTentativa((t) => (t === 0 ? 1 : 2))}
      className="shrink-0"
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
      className={`min-h-[40px] rounded-lg px-3 py-2 text-sm font-medium transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${map[variant]} ${className}`}
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
  abrirAoMontar = false,
  onFechar,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  /** Ja abre a folha ao montar, para quem dispara a partir de outro controle. */
  abrirAoMontar?: boolean;
  onFechar?: () => void;
}) {
  const [open, setOpen] = useState(abrirAoMontar);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');

    // Trava a rolagem de fundo: sem isso, arrastar dentro da folha rola a
    // pagina atras dela e a lista "escapa" do dedo.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
    };
    document.addEventListener('keydown', onKey);

    // Espera a folha montar antes de focar, senao o teclado nao sobe no iOS.
    const t = setTimeout(() => inputRef.current?.focus(), 60);

    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 300);
    return options
      .filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q))
      .slice(0, 300);
  }, [options, query]);

  const current = options.find((o) => o.value === value);

  const fechar = () => {
    setOpen(false);
    onFechar?.();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-left transition active:scale-[0.99] active:border-ink-600"
      >
        <span className="block text-[10px] tracking-wide text-ink-400 uppercase">{label}</span>
        <span className={`block truncate text-sm ${current ? 'text-ink-100' : 'text-ink-400'}`}>
          {current?.label ?? placeholder}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-ink-950/80 backdrop-blur-sm"
          onClick={fechar}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <div
            className="mt-auto flex max-h-[88vh] flex-col rounded-t-2xl border-t border-ink-700 bg-ink-900 safe-bottom sm:m-auto sm:max-h-[70vh] sm:w-full sm:max-w-lg sm:rounded-2xl sm:border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-ink-800 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs tracking-wide text-ink-400 uppercase">{label}</span>
                <button
                  onClick={fechar}
                  className="-my-2 shrink-0 px-2 py-2 text-sm text-ink-300"
                  aria-label="Fechar"
                >
                  Fechar
                </button>
              </div>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar..."
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-base outline-none focus:border-accent"
              />
              {query.trim() !== '' && (
                <p className="mt-1 text-[11px] text-ink-500">
                  {filtered.length === 0
                    ? 'nada encontrado'
                    : `${filtered.length}${filtered.length === 300 ? '+' : ''} resultado${filtered.length > 1 ? 's' : ''}`}
                </p>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              {emptyLabel && (
                <button
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                  className="mb-1 min-h-[44px] w-full rounded-lg px-3 text-left text-sm text-ink-400 active:bg-ink-800"
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
                  className={`flex min-h-[48px] w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition active:bg-ink-800 ${
                    o.value === value ? 'bg-ink-800 ring-1 ring-accent/40' : ''
                  }`}
                >
                  {o.sprite && (
                    <img
                      src={o.sprite}
                      alt=""
                      width={32}
                      height={32}
                      style={{ imageRendering: 'pixelated', minWidth: 32 }}
                      loading="lazy"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink-100">{o.label}</span>
                    {o.hint && <span className="block truncate text-xs text-ink-400">{o.hint}</span>}
                  </span>
                  {o.value === value && <span className="shrink-0 text-accent">✓</span>}
                </button>
              ))}
              {!filtered.length && (
                <p className="p-6 text-center text-sm text-ink-400">
                  Nada encontrado para "{query}".
                </p>
              )}
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
