import { useEffect, useMemo, useRef, useState } from 'react';
import { BATTLE_TYPES, TYPE_COLOR, getMove, learnsetOf, normalizeId } from '../data/dex';
import { moveRelevance } from '../engine/presume';
import { useMetaStore } from '../store/metaStore';

/**
 * Seletor de golpes em forma de tabela filtravel.
 *
 * Um movepool tem entre 40 e 120 golpes. Uma lista rolavel sem filtro obriga a
 * ja saber o nome do que se procura — mas metade das decisoes de teambuilding
 * comeca por uma pergunta de categoria ("o que eu tenho de Aco aqui?", "tem
 * algum golpe de prioridade?"), nao por um nome.
 *
 * Entao: filtro por tipo, por classe de dano e por caracteristica, com os dados
 * que decidem a escolha (uso no ladder, poder, precisao) visiveis na linha em
 * vez de escondidos atras de um toque.
 */

type Classe = 'Physical' | 'Special' | 'Status';

interface Linha {
  name: string;
  type: string;
  category: Classe;
  power: number;
  accuracy: number | true;
  pp: number;
  priority: number;
  spread: boolean;
  desc: string;
  usage: number | null;
  relevancia: number;
}

export default function MovePicker({
  open,
  speciesId,
  item,
  selecionado,
  jaEscolhidos,
  onPick,
  onClose,
  titulo,
}: {
  open: boolean;
  speciesId: string;
  item?: string;
  selecionado: string;
  /** Golpes ja nos outros slots, para marcar como usados. */
  jaEscolhidos: string[];
  onPick: (move: string) => void;
  onClose: () => void;
  titulo: string;
}) {
  const [pool, setPool] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [tipo, setTipo] = useState<string | null>(null);
  const [classe, setClasse] = useState<Classe | null>(null);
  const [soPrioridade, setSoPrioridade] = useState(false);
  const [soSpread, setSoSpread] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const entry = useMetaStore((s) => s.entry(speciesId));

  useEffect(() => {
    if (!speciesId) return;
    let vivo = true;
    void learnsetOf(speciesId).then((l) => vivo && setPool(l));
    return () => {
      vivo = false;
    };
  }, [speciesId]);

  useEffect(() => {
    if (!open) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => {
      document.body.style.overflow = anterior;
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  const usageMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const mv of entry?.moves ?? []) {
      const move = getMove(mv.name);
      if (move) m.set(move.name, mv.usage);
    }
    return m;
  }, [entry]);

  const linhas: Linha[] = useMemo(() => {
    return pool
      .map((nome) => getMove(nome))
      .filter((m): m is NonNullable<ReturnType<typeof getMove>> => m !== null)
      .map((m) => ({
        name: String(m.name),
        type: String(m.type),
        category: m.category as Classe,
        power: m.basePower ?? 0,
        accuracy: m.accuracy as number | true,
        pp: m.pp ?? 0,
        priority: m.priority ?? 0,
        spread: m.target === 'allAdjacentFoes' || m.target === 'allAdjacent',
        desc: m.shortDesc || m.desc || '',
        usage: usageMap.get(String(m.name)) ?? null,
        relevancia: moveRelevance(speciesId, String(m.name), item),
      }))
      .sort(
        (a, b) =>
          (b.usage ?? -1) - (a.usage ?? -1) || b.relevancia - a.relevancia || a.name.localeCompare(b.name),
      );
  }, [pool, usageMap, speciesId, item]);

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    return linhas.filter((l) => {
      if (tipo && l.type !== tipo) return false;
      if (classe && l.category !== classe) return false;
      if (soPrioridade && l.priority <= 0) return false;
      if (soSpread && !l.spread) return false;
      if (q && !l.name.toLowerCase().includes(q) && !l.desc.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [linhas, query, tipo, classe, soPrioridade, soSpread]);

  // Tipos que a especie realmente tem no movepool: filtrar por um tipo vazio
  // so gera frustracao.
  const tiposDisponiveis = useMemo(() => {
    const s = new Set(linhas.map((l) => l.type));
    return BATTLE_TYPES.filter((t) => s.has(t));
  }, [linhas]);

  const temUsage = usageMap.size > 0;
  const usados = useMemo(() => new Set(jaEscolhidos.map(normalizeId)), [jaEscolhidos]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-ink-950/85 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className="mt-auto flex h-[90vh] flex-col rounded-t-2xl border-t border-ink-700 bg-ink-900 safe-bottom sm:m-auto sm:h-[80vh] sm:w-full sm:max-w-2xl sm:rounded-2xl sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-ink-800 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs tracking-wide text-ink-400 uppercase">{titulo}</span>
            <button onClick={onClose} className="-my-2 shrink-0 px-2 py-2 text-sm text-ink-300">
              Fechar
            </button>
          </div>

          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar golpe ou efeito..."
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            className="mb-2 w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-base outline-none focus:border-accent"
          />

          <div className="scroll-x -mx-1 mb-1.5 flex gap-1 px-1 pb-1">
            {(['Physical', 'Special', 'Status'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setClasse(classe === c ? null : c)}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition active:scale-95 ${
                  classe === c ? 'border-accent bg-accent/15 text-accent' : 'border-ink-700 text-ink-400'
                }`}
              >
                {c === 'Physical' ? 'Fisico' : c === 'Special' ? 'Especial' : 'Status'}
              </button>
            ))}
            <button
              onClick={() => setSoPrioridade((v) => !v)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition active:scale-95 ${
                soPrioridade ? 'border-accent bg-accent/15 text-accent' : 'border-ink-700 text-ink-400'
              }`}
            >
              Prioridade
            </button>
            <button
              onClick={() => setSoSpread((v) => !v)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition active:scale-95 ${
                soSpread ? 'border-accent bg-accent/15 text-accent' : 'border-ink-700 text-ink-400'
              }`}
            >
              Spread
            </button>
            {(tipo || classe || soPrioridade || soSpread) && (
              <button
                onClick={() => {
                  setTipo(null);
                  setClasse(null);
                  setSoPrioridade(false);
                  setSoSpread(false);
                }}
                className="shrink-0 rounded-full border border-ink-700 px-2.5 py-1 text-[11px] text-ink-500"
              >
                Limpar
              </button>
            )}
          </div>

          <div className="scroll-x -mx-1 flex gap-1 px-1 pb-1">
            {tiposDisponiveis.map((t) => (
              <button
                key={t}
                onClick={() => setTipo(tipo === t ? null : t)}
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-ink-950 uppercase transition active:scale-95"
                style={{
                  background: TYPE_COLOR[t] ?? '#6b7896',
                  opacity: tipo && tipo !== t ? 0.3 : 1,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <p className="mt-1.5 text-[11px] text-ink-500">
            {filtradas.length} de {linhas.length} golpes
            {!temUsage && ' · sem dados de uso do ladder, ordenado por relevancia'}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <button
            onClick={() => {
              onPick('');
              onClose();
            }}
            className="w-full border-b border-ink-800 px-3 py-2.5 text-left text-sm text-ink-500 active:bg-ink-850"
          >
            Deixar vazio
          </button>

          {filtradas.map((l) => {
            const atual = normalizeId(l.name) === normalizeId(selecionado);
            const emOutroSlot = !atual && usados.has(normalizeId(l.name));
            return (
              <button
                key={l.name}
                onClick={() => {
                  onPick(l.name);
                  onClose();
                }}
                className={`w-full border-b border-ink-800/70 px-3 py-2 text-left transition active:bg-ink-850 ${
                  atual ? 'bg-ink-850' : ''
                } ${emOutroSlot ? 'opacity-45' : ''}`}
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-ink-950 uppercase"
                    style={{ background: TYPE_COLOR[l.type] ?? '#6b7896' }}
                  >
                    {l.type}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-100">{l.name}</span>
                  {l.usage !== null && (
                    <span className="shrink-0 text-[11px] font-semibold tabular-nums text-accent">
                      {(l.usage * 100).toFixed(1)}%
                    </span>
                  )}
                  {atual && <span className="shrink-0 text-accent">✓</span>}
                </div>

                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-500">
                  <span>{l.category === 'Physical' ? 'Fisico' : l.category === 'Special' ? 'Especial' : 'Status'}</span>
                  {l.power > 0 && <span className="text-ink-300">{l.power} BP</span>}
                  <span>{l.accuracy === true ? 'nao erra' : `${l.accuracy}%`}</span>
                  <span>{l.pp} PP</span>
                  {l.priority > 0 && <span className="text-accent">prioridade +{l.priority}</span>}
                  {l.spread && <span className="text-good">spread</span>}
                  {emOutroSlot && <span className="text-warn">ja esta no time</span>}
                </div>

                {l.desc && <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-600">{l.desc}</p>}
              </button>
            );
          })}

          {!filtradas.length && (
            <p className="p-8 text-center text-sm text-ink-400">Nenhum golpe com esses filtros.</p>
          )}
        </div>
      </div>
    </div>
  );
}
