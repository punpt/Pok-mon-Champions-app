import { useState } from 'react';
import { useMetaStore } from '../store/metaStore';
import { DEFAULT_BASE_URL } from '../api/championsBattleData';
import { activeRegulation, formatSummary, REGULATIONS, regulationIsStale } from '../data/rules';
import { snapshotAgeLabel } from '../api/cache';
import { Button, Card, Pill, Section } from '../components/ui';

export default function SettingsPage() {
  const { baseUrl, setBaseUrl, load, status, snapshot, fromCache, error, diagnostics, clearCache, usageScale, setUsageScale } =
    useMetaStore();
  const [draft, setDraft] = useState(baseUrl);
  const [showDiag, setShowDiag] = useState(false);
  const reg = activeRegulation();

  return (
    <div>
      <Section title="Fonte de dados" subtitle="O app busca o meta ao vivo a cada abertura">
        <Card className="space-y-2 p-3">
          <label className="block">
            <span className="mb-1 block text-[10px] tracking-wide text-ink-400 uppercase">Endereco da API</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-xs outline-none focus:border-accent"
            />
          </label>
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() => {
                setBaseUrl(draft);
                void load(true);
              }}
            >
              Salvar e recarregar
            </Button>
            <Button
              onClick={() => {
                setDraft(DEFAULT_BASE_URL);
                setBaseUrl(DEFAULT_BASE_URL);
                void load(true);
              }}
            >
              Padrao
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <Pill tone={status === 'ao-vivo' ? 'good' : status === 'cache' ? 'warn' : status === 'erro' ? 'danger' : 'neutral'}>
              {status}
            </Pill>
            {snapshot && (
              <span className="text-ink-400">
                {snapshot.entries.length} Pokemon · buscado {snapshotAgeLabel(snapshot)}
                {fromCache && ' · servido do cache'}
              </span>
            )}
          </div>

          {error && <p className="text-[11px] leading-relaxed text-danger">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button onClick={() => void load(true)}>Recarregar agora</Button>
            <Button onClick={() => void clearCache()}>Limpar cache</Button>
            <Button onClick={() => setShowDiag((v) => !v)}>Diagnostico</Button>
          </div>
        </Card>
      </Section>

      <Section
        title="Escala do usage"
        subtitle="Se os percentuais nao batem com os sites de meta, e quase sempre isto"
      >
        <Card className="p-3">
          <p className="mb-2 text-[11px] leading-relaxed text-ink-400">
            Fontes diferentes publicam usage de dois jeitos. <strong>Por time</strong> e a convencao que voce ve no
            Pikalytics: "quantos por cento dos times levam este Pokemon", e somada no ladder inteiro passa de 100%
            porque cada time tem {6} vagas. <strong>Por slot</strong> divide 100% entre todos os Pokemon, entao os
            numeros saem cerca de {6}x menores — um Pokemon em 40% dos times aparece como 6,7%.
          </p>
          <div className="flex gap-1.5">
            {(['auto', 'times', 'slots'] as const).map((op) => (
              <button
                key={op}
                onClick={() => {
                  setUsageScale(op);
                  void load(true);
                }}
                className={`flex-1 rounded-lg border py-1.5 text-[11px] ${
                  usageScale === op ? 'border-accent bg-accent/10 text-accent' : 'border-ink-700 text-ink-400'
                }`}
              >
                {op === 'auto' ? 'Automatico' : op === 'times' ? 'Por time' : 'Por slot'}
              </button>
            ))}
          </div>

          {diagnostics?.usage && (
            <div className="mt-2 rounded-lg bg-ink-900 p-2 text-[11px]">
              <p className="text-ink-300">
                Detectado: <strong>{diagnostics.usage.mode === 'slots' ? 'por slot' : 'por time'}</strong>
                {diagnostics.usage.automatic ? ' (automatico)' : ' (definido por voce)'}
                {diagnostics.usage.factor !== 1 && ` · multiplicado por ${diagnostics.usage.factor}`}
              </p>
              <p className="mt-0.5 text-ink-400">
                Soma dos usages crus: {(diagnostics.usage.rawSum * 100).toFixed(0)}%
                {diagnostics.usage.rawSum < 1.5 ? ' — perto de 100%, tipico de escala por slot.' : ' — bem acima de 100%, tipico de escala por time.'}
              </p>
              <p className="mt-1 text-ink-300">Topo depois do ajuste: {diagnostics.usage.amostra.join(' · ')}</p>
            </div>
          )}
          <p className="mt-1.5 text-[10px] leading-relaxed text-ink-600">
            Confira o topo acima contra um site de meta que voce confie. Se estiver na escala errada, troque aqui —
            o ranking de ameacas usa esses numeros como peso.
          </p>
        </Card>
      </Section>

      {showDiag && (
        <Section
          title="Diagnostico"
          subtitle="Cada endpoint tentado, o que voltou e por que foi descartado"
        >
          {diagnostics ? (
            <Card className="divide-y divide-ink-800">
              {diagnostics.attempts.map((a, i) => (
                <div key={i} className="p-2.5">
                  <div className="flex items-center gap-2">
                    <Pill tone={a.ok ? 'good' : 'danger'}>{a.status ?? 'rede'}</Pill>
                    <code className="min-w-0 flex-1 truncate text-[11px] text-ink-300">{a.url}</code>
                    <span className="text-[10px] text-ink-600">{a.ms}ms</span>
                  </div>
                  {a.error && <p className="mt-1 text-[11px] text-warn">{a.error}</p>}
                  {a.sample && (
                    <pre className="mt-1 max-h-32 overflow-auto rounded bg-ink-900 p-2 text-[10px] leading-relaxed text-ink-400">
                      {a.sample}
                    </pre>
                  )}
                </div>
              ))}
              {diagnostics.warnings.map((w, i) => (
                <p key={i} className="p-2.5 text-[11px] text-warn">
                  {w}
                </p>
              ))}
            </Card>
          ) : (
            <Card className="p-3 text-[11px] text-ink-400">
              A ultima carga funcionou — nao ha falhas para mostrar.
              {snapshot && ` Endpoint em uso: ${snapshot.source}.`}
            </Card>
          )}
        </Section>
      )}

      <Section title="Regulation vigente" subtitle={`${reg.name} · ${reg.start} a ${reg.end}`}>
        <Card className="p-3">
          {regulationIsStale(reg) && (
            <p className="mb-2 rounded border border-warn/25 bg-warn/10 p-2 text-[11px] text-warn">
              Esta regulation ja venceu. As regras abaixo podem nao valer mais — confira o anuncio oficial.
            </p>
          )}
          <ul className="space-y-1">
            {formatSummary(reg).map((line, i) => (
              <li key={i} className="text-xs text-ink-300">
                • {line}
              </li>
            ))}
          </ul>
          <div className="mt-2 border-t border-ink-800 pt-2">
            {reg.notes.map((n, i) => (
              <p key={i} className="text-[11px] leading-relaxed text-ink-400">
                {n}
              </p>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-600">
            Timers: {reg.timers.gameSeconds / 60} min de partida · {reg.timers.playerSeconds / 60} min por jogador ·{' '}
            {reg.timers.turnSeconds}s por turno.
          </p>
        </Card>
      </Section>

      <Section title="Regulations cadastradas">
        <Card className="divide-y divide-ink-800">
          {REGULATIONS.map((r) => (
            <div key={r.id} className="flex items-center gap-2 p-2.5 text-xs">
              <Pill tone={r.id === reg.id ? 'accent' : 'neutral'}>{r.label}</Pill>
              <span className="flex-1 text-ink-400">
                {r.start} → {r.end}
              </span>
              <span className="text-ink-600">{r.tera === 'legal' ? 'Tera' : 'sem Tera'}</span>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="Sobre">
        <Card className="p-3 text-[11px] leading-relaxed text-ink-400">
          <p>
            Mecanica (tipagem, base stats, movepools, itens) vem dos dados do Pokemon Showdown empacotados no app, entao
            funcionam offline. Usage, movesets do ladder e roster legal vem da API ao vivo.
          </p>
          <p className="mt-2">
            Stat Points seguem a formula do Champions: HP = base + SP + 75, demais = (base + SP + 20) × nature. Cada SP
            vale 1 ponto, teto de 32 por stat e 66 no total.
          </p>
        </Card>
      </Section>
    </div>
  );
}
