import { useMemo, useState } from 'react';
import { useMetaStore } from '../store/metaStore';
import { useAddFromMeta } from '../lib/useAddFromMeta';
import { getSpecies } from '../data/dex';
import { Card, Empty, Pill, Section, Sprite, Spinner, TypeBadge, UsageBar } from '../components/ui';
import { BATTLE_TYPES, defensiveProfile } from '../data/dex';

export default function DexPage() {
  const { snapshot, status, fromCache } = useMetaStore();
  const addFromMeta = useAddFromMeta();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<string>('');

  const entries = useMemo(() => {
    const list = snapshot?.entries ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((e) => {
      const s = getSpecies(e.id);
      if (!s) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      if (type && !s.types.includes(type as never)) return false;
      return true;
    });
  }, [snapshot, query, type]);

  if (status === 'carregando') return <Spinner label="Carregando o ladder..." />;
  if (!snapshot) {
    return <Empty title="Sem dados de meta." hint="Confira Ajustes › Diagnostico para ver o que a API respondeu." />;
  }

  return (
    <div>
      <Section
        title="Dex do ladder"
        subtitle={`${snapshot.entries.length} Pokemon${snapshot.label ? ` · recorte ${snapshot.label}` : ''}${
          fromCache ? ' · do cache' : ' · ao vivo'
        }`}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar Pokemon..."
          className="mb-2 w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <div className="scroll-x flex gap-1 pb-1">
          <button
            onClick={() => setType('')}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${
              !type ? 'border-accent text-accent' : 'border-ink-700 text-ink-400'
            }`}
          >
            Todos
          </button>
          {BATTLE_TYPES.map((t) => (
            <button key={t} onClick={() => setType(type === t ? '' : t)} className="shrink-0">
              <span style={{ opacity: type && type !== t ? 0.35 : 1 }}>
                <TypeBadge type={t} />
              </span>
            </button>
          ))}
        </div>
      </Section>

      <div className="space-y-1.5">
        {entries.map((e) => {
          const s = getSpecies(e.id)!;
          const profile = defensiveProfile(s.types as never);
          const fraquezas = BATTLE_TYPES.filter((t) => profile[t] > 1);
          return (
            <Card key={e.id} className="p-2.5">
              <div className="flex items-center gap-2.5">
                <Sprite species={s} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm text-ink-100">{s.name}</span>
                    <Pill>#{e.rank}</Pill>
                    {(s.types as readonly string[]).map((t) => (
                      <TypeBadge key={t} type={t} />
                    ))}
                  </div>
                  <div className="mt-1">
                    <UsageBar value={e.usage} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-400">{(e.usage * 100).toFixed(1)}% de usage</p>
                </div>
                <button
                  onClick={() => void addFromMeta(e.id)}
                  className="shrink-0 rounded-lg border border-ink-700 px-3 py-2 text-[11px] text-ink-300 transition active:scale-95"
                >
                  + Time
                </button>
              </div>
              {fraquezas.length > 0 && (
                <p className="mt-1.5 text-[10px] text-ink-600">
                  Fraco a: {fraquezas.map((t) => `${t}${profile[t] === 4 ? ' (4x)' : ''}`).join(', ')}
                </p>
              )}
            </Card>
          );
        })}
        {!entries.length && <Empty title="Nada encontrado com esses filtros." />}
      </div>
    </div>
  );
}
