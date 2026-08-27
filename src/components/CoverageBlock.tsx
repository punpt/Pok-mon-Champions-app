import { useState } from 'react';
import type { DefensiveCoverage, OffensiveCoverage, CoverageGrade } from '../engine/coverage';
import { TYPE_ABBR, TYPE_COLOR } from '../data/dex';

/**
 * Grade de cobertura por tipo.
 *
 * Dezoito tipos precisam caber numa tela de celular e serem lidos de relance,
 * entao cada tipo vira uma celula pequena com a cor do proprio tipo como
 * identidade e uma barra de estado embaixo dizendo se aquilo esta resolvido ou
 * nao. Tocar numa celula abre o detalhe — quem cobre, com qual golpe, quem
 * sofre — em vez de empurrar tudo isso para a tela de uma vez.
 */

const GRADE_COLOR: Record<CoverageGrade, string> = {
  otima: 'var(--color-good)',
  boa: 'var(--color-accent)',
  fraca: 'var(--color-warn)',
  nenhuma: 'var(--color-danger)',
};

function Cell({
  type,
  grade,
  badge,
  active,
  onClick,
}: {
  type: string;
  grade: CoverageGrade;
  badge: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`relative flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 transition active:scale-95 ${
        active ? 'border-ink-300 bg-ink-800' : 'border-ink-700 bg-ink-850'
      }`}
    >
      <span
        className="w-full rounded px-1 py-0.5 text-[10px] font-bold tracking-wider text-ink-950"
        style={{ background: TYPE_COLOR[type] ?? '#6b7896' }}
        title={type}
      >
        {TYPE_ABBR[type] ?? type.slice(0, 3).toUpperCase()}
      </span>
      <span className="text-[11px] font-semibold tabular-nums" style={{ color: GRADE_COLOR[grade] }}>
        {badge}
      </span>
    </button>
  );
}

export function OffensiveBlock({ rows }: { rows: OffensiveCoverage[] }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const detalhe = rows.find((r) => r.type === aberto);

  return (
    <div>
      <div className="grid grid-cols-6 gap-1 sm:grid-cols-9">
        {rows.map((r) => (
          <Cell
            key={r.type}
            type={r.type}
            grade={r.grade}
            // Quantos membros batem super efetivo. Zero e o que importa ver.
            badge={r.sources.length ? `${r.sources.length}` : r.best === 0 ? '✕' : '–'}
            active={aberto === r.type}
            onClick={() => setAberto(aberto === r.type ? null : r.type)}
          />
        ))}
      </div>

      {detalhe && (
        <div className="mt-2 rounded-lg border border-ink-700 bg-ink-900 p-2.5 text-[11px]">
          <p className="mb-1 text-ink-300">
            Contra <strong className="text-ink-100">{detalhe.type}</strong>:
          </p>
          {detalhe.sources.length ? (
            <ul className="space-y-0.5">
              {detalhe.sources.map((s, i) => (
                <li key={i} className="text-ink-100">
                  {s.name} · {s.move} <span className="text-good">{s.multiplier}x</span>
                </li>
              ))}
            </ul>
          ) : detalhe.best === 0 ? (
            <p className="text-danger">Nenhum golpe do time afeta este tipo.</p>
          ) : (
            <p className="text-warn">Ninguem bate super efetivo — so dano neutro ou resistido.</p>
          )}
        </div>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-ink-600">
        O numero e quantos membros batem <span className="text-good">super efetivo</span> naquele tipo.{' '}
        <span className="text-warn">–</span> e so dano neutro; <span className="text-danger">✕</span> e imunidade,
        ninguem consegue acertar.
      </p>
    </div>
  );
}

export function DefensiveBlock({ rows }: { rows: DefensiveCoverage[] }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const detalhe = rows.find((r) => r.type === aberto);

  return (
    <div>
      <div className="grid grid-cols-6 gap-1 sm:grid-cols-9">
        {rows.map((r) => (
          <Cell
            key={r.type}
            type={r.type}
            grade={r.grade}
            // Fracos contra resistentes: o saldo e a leitura que interessa.
            badge={`${r.weak.length}/${r.resists.length}`}
            active={aberto === r.type}
            onClick={() => setAberto(aberto === r.type ? null : r.type)}
          />
        ))}
      </div>

      {detalhe && (
        <div className="mt-2 rounded-lg border border-ink-700 bg-ink-900 p-2.5 text-[11px]">
          <p className="mb-1 text-ink-300">
            Golpes de <strong className="text-ink-100">{detalhe.type}</strong>:
          </p>
          {detalhe.weak.length > 0 && (
            <p className="text-danger">
              Sofrem: {detalhe.weak.map((w) => `${w.name} (${w.multiplier}x)`).join(', ')}
            </p>
          )}
          {detalhe.resists.length > 0 && (
            <p className="mt-0.5 text-good">
              Seguram: {detalhe.resists.map((w) => `${w.name} (${w.multiplier}x)`).join(', ')}
            </p>
          )}
          {!detalhe.weak.length && !detalhe.resists.length && (
            <p className="text-ink-400">Todo o time recebe dano neutro.</p>
          )}
        </div>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-ink-600">
        Os numeros sao <span className="text-danger">quantos sofrem</span> /{' '}
        <span className="text-good">quantos seguram</span>. Vermelho e fraqueza empilhada sem ninguem que resista.
      </p>
    </div>
  );
}
