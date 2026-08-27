import { useEffect, useMemo, useState } from 'react';
import { useMetaStore } from '../store/metaStore';
import { useAddFromMeta } from '../lib/useAddFromMeta';
import {
  BATTLE_TYPES,
  TYPE_COLOR,
  abilitiesOf,
  baseStatsOf,
  defensiveProfile,
  getSpecies,
  learnsetOf,
  type TypeName,
} from '../data/dex';
import { championsStat, STAT_IDS, STAT_LABEL, type StatID } from '../data/stats';
import { Card, Empty, Pill, Section, Sprite, Spinner, TypeBadge, UsageBar } from '../components/ui';

type Ordem = 'usage' | StatID | 'nome';
type Escala = 'lvl50' | 'base';

export default function DexPage() {
  const { snapshot, status, fromCache } = useMetaStore();
  const addFromMeta = useAddFromMeta();

  const [busca, setBusca] = useState('');
  const [tipos, setTipos] = useState<string[]>([]);
  const [modoTipo, setModoTipo] = useState<'e' | 'ou'>('e');
  const [golpe, setGolpe] = useState('');
  const [ability, setAbility] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('usage');
  const [escala, setEscala] = useState<Escala>('lvl50');
  const [comGolpe, setComGolpe] = useState<Set<string> | null>(null);
  const [filtrandoGolpe, setFiltrandoGolpe] = useState(false);

  const entradas = snapshot?.entries ?? [];

  /**
   * Filtrar por golpe exige o movepool de todo o roster, que sao centenas de
   * consultas. So pagamos esse custo quando o campo tem texto suficiente para
   * valer a pena, e o resultado fica em memoria enquanto a busca nao muda.
   */
  useEffect(() => {
    const alvo = golpe.trim();
    if (alvo.length < 3) {
      setComGolpe(null);
      return;
    }
    let vivo = true;
    setFiltrandoGolpe(true);
    void (async () => {
      const encontrados = new Set<string>();
      const q = alvo.toLowerCase();
      for (const e of entradas) {
        if (!vivo) return;
        const pool = await learnsetOf(e.id);
        if (pool.some((m) => m.toLowerCase().includes(q))) encontrados.add(e.id);
      }
      if (vivo) {
        setComGolpe(encontrados);
        setFiltrandoGolpe(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [golpe, entradas]);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qAbility = ability.trim().toLowerCase();

    const filtradas = entradas.filter((e) => {
      const s = getSpecies(e.id);
      if (!s) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;

      if (tipos.length) {
        const seus = (s.types as readonly string[]).map(String);
        // "E" pede que o Pokemon tenha todos os tipos marcados; "OU" aceita
        // qualquer um. Monotipos so aparecem no modo OU quando ha dois filtros.
        const bate = modoTipo === 'e' ? tipos.every((t) => seus.includes(t)) : tipos.some((t) => seus.includes(t));
        if (!bate) return false;
      }

      if (qAbility && !abilitiesOf(s).some((a) => a.toLowerCase().includes(qAbility))) return false;
      if (comGolpe && !comGolpe.has(e.id)) return false;
      return true;
    });

    return filtradas.sort((a, b) => {
      if (ordem === 'usage') return b.usage - a.usage;
      if (ordem === 'nome') {
        return (getSpecies(a.id)?.name ?? '').localeCompare(getSpecies(b.id)?.name ?? '');
      }
      const sa = getSpecies(a.id);
      const sb = getSpecies(b.id);
      if (!sa || !sb) return 0;
      return baseStatsOf(sb)[ordem] - baseStatsOf(sa)[ordem];
    });
  }, [entradas, busca, tipos, modoTipo, ability, comGolpe, ordem]);

  if (status === 'carregando') return <Spinner label="Carregando o ladder..." />;
  if (!snapshot) {
    return <Empty title="Sem dados de meta." hint="Confira Ajustes › Diagnostico para ver o que a API respondeu." />;
  }

  const limparFiltros = () => {
    setBusca('');
    setTipos([]);
    setGolpe('');
    setAbility('');
  };
  const temFiltro = busca || tipos.length || golpe || ability;

  return (
    <div>
      <Section
        title="Dex do ladder"
        subtitle={`${linhas.length} de ${entradas.length}${snapshot.label ? ` · ${snapshot.label}` : ''}${
          fromCache ? ' · do cache' : ''
        }`}
      >
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar Pokemon..."
          className="mb-2 w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-base outline-none focus:border-accent"
        />

        <div className="mb-2 grid grid-cols-2 gap-2">
          <input
            value={golpe}
            onChange={(e) => setGolpe(e.target.value)}
            placeholder="Aprende o golpe..."
            className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            value={ability}
            onChange={(e) => setAbility(e.target.value)}
            placeholder="Tem a ability..."
            className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        {filtrandoGolpe && <Spinner label="Varrendo movepools..." />}

        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-[10px] tracking-wide text-ink-500 uppercase">Tipo</span>
          <div className="flex overflow-hidden rounded-lg border border-ink-700">
            {(['e', 'ou'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setModoTipo(m)}
                className={`px-2 py-0.5 text-[10px] uppercase ${
                  modoTipo === m ? 'bg-accent text-white' : 'text-ink-400'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {temFiltro && (
            <button onClick={limparFiltros} className="ml-auto text-[11px] text-accent">
              Limpar filtros
            </button>
          )}
        </div>

        <div className="mb-2 grid grid-cols-6 gap-1">
          {BATTLE_TYPES.map((t) => {
            const ativo = tipos.includes(t);
            return (
              <button
                key={t}
                onClick={() => setTipos((v) => (ativo ? v.filter((x) => x !== t) : [...v, t]))}
                className="rounded px-1 py-1 text-[9px] font-bold tracking-wide text-ink-950 uppercase transition active:scale-95"
                style={{ background: TYPE_COLOR[t] ?? '#6b7896', opacity: tipos.length && !ativo ? 0.3 : 1 }}
              >
                {t.slice(0, 3)}
              </button>
            );
          })}
        </div>

        <div className="scroll-x flex items-center gap-1 pb-1">
          <span className="shrink-0 text-[10px] tracking-wide text-ink-500 uppercase">Ordenar</span>
          {([['usage', 'Uso'], ['nome', 'Nome'], ...STAT_IDS.map((s) => [s, STAT_LABEL[s]] as const)] as [Ordem, string][]).map(
            ([valor, rotulo]) => (
              <button
                key={valor}
                onClick={() => setOrdem(valor)}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition active:scale-95 ${
                  ordem === valor ? 'border-accent bg-accent/15 text-accent' : 'border-ink-700 text-ink-400'
                }`}
              >
                {rotulo}
              </button>
            ),
          )}
          <div className="ml-1 flex shrink-0 overflow-hidden rounded-lg border border-ink-700">
            {(['lvl50', 'base'] as const).map((e) => (
              <button
                key={e}
                onClick={() => setEscala(e)}
                className={`px-2 py-1 text-[10px] ${escala === e ? 'bg-accent text-white' : 'text-ink-400'}`}
              >
                {e === 'lvl50' ? 'Nv 50' : 'Base'}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <div className="space-y-1.5">
        {linhas.map((e) => {
          const s = getSpecies(e.id)!;
          const bs = baseStatsOf(s);
          const perfil = defensiveProfile(s.types as TypeName[]);
          const fraquezas = BATTLE_TYPES.filter((t) => perfil[t] > 1);

          return (
            <Card key={e.id} className="p-2.5">
              <div className="flex items-start gap-2.5">
                <Sprite species={s} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-ink-100">{s.name}</span>
                    <Pill>#{e.rank}</Pill>
                    {(s.types as readonly string[]).map((t) => (
                      <TypeBadge key={t} type={t} />
                    ))}
                  </div>
                  <div className="mt-1">
                    <UsageBar value={e.usage} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-400">{(e.usage * 100).toFixed(1)}% de uso</p>
                </div>
                <button
                  onClick={() => void addFromMeta(e.id)}
                  className="shrink-0 rounded-lg border border-ink-700 px-3 py-2 text-[11px] text-ink-300 transition active:scale-95"
                >
                  + Time
                </button>
              </div>

              <div className="mt-1.5 grid grid-cols-6 gap-1 border-t border-ink-800 pt-1.5 text-center">
                {STAT_IDS.map((id) => (
                  <div key={id}>
                    <p className="text-[9px] text-ink-600">{STAT_LABEL[id]}</p>
                    <p className={`text-[11px] tabular-nums ${ordem === id ? 'font-bold text-accent' : 'text-ink-200'}`}>
                      {escala === 'base' ? bs[id] : championsStat(bs[id], 0, id, 1)}
                    </p>
                  </div>
                ))}
              </div>

              {fraquezas.length > 0 && (
                <p className="mt-1 text-[10px] text-ink-600">
                  Fraco a: {fraquezas.map((t) => `${t}${perfil[t] === 4 ? ' (4x)' : ''}`).join(', ')}
                </p>
              )}
            </Card>
          );
        })}
        {!linhas.length && <Empty title="Nada encontrado com esses filtros." />}
      </div>
    </div>
  );
}
