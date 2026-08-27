import { useState } from 'react';
import { getMove, TYPE_COLOR } from '../data/dex';
import MovePicker from './MovePicker';

/**
 * Um slot de golpe: mostra o que esta escolhido com tipo e uso, e abre a
 * tabela filtravel ao toque.
 *
 * O tipo aparece aqui porque cobertura e a leitura que se faz varrendo os
 * quatro slots — ter de abrir cada um para lembrar de que tipo era o golpe
 * quebra o raciocinio.
 */
export default function MoveSlot({
  indice,
  move,
  speciesId,
  item,
  outros,
  usage,
  onChange,
}: {
  indice: number;
  move: string;
  speciesId: string;
  item?: string;
  outros: string[];
  usage?: number;
  onChange: (move: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const dados = getMove(move);

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="w-full rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-2 text-left transition active:scale-[0.98] active:border-ink-600"
      >
        <span className="mb-0.5 flex items-center gap-1.5">
          <span className="text-[10px] tracking-wide text-ink-500 uppercase">Golpe {indice + 1}</span>
          {dados && (
            <span
              className="rounded px-1 py-px text-[8px] font-bold tracking-wide text-ink-950 uppercase"
              style={{ background: TYPE_COLOR[dados.type] ?? '#6b7896' }}
            >
              {dados.type}
            </span>
          )}
          {usage !== undefined && (
            <span className="ml-auto text-[10px] tabular-nums text-accent">{(usage * 100).toFixed(0)}%</span>
          )}
        </span>
        <span className={`block truncate text-sm ${dados ? 'text-ink-100' : 'text-ink-500'}`}>
          {dados?.name ?? 'Vazio'}
        </span>
        {dados && (
          <span className="block truncate text-[10px] text-ink-600">
            {dados.category === 'Status'
              ? 'Status'
              : `${dados.basePower} BP · ${dados.accuracy === true ? 'nao erra' : `${dados.accuracy}%`}`}
            {(dados.priority ?? 0) > 0 ? ` · +${dados.priority}` : ''}
          </span>
        )}
      </button>

      <MovePicker
        open={aberto}
        speciesId={speciesId}
        item={item}
        selecionado={move}
        jaEscolhidos={outros}
        onPick={onChange}
        onClose={() => setAberto(false)}
        titulo={`Golpe ${indice + 1}`}
      />
    </>
  );
}
