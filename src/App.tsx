import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useMetaStore } from './store/metaStore';
import { activeRegulation, regulationIsStale } from './data/rules';
import TeamPage from './pages/TeamPage';
import ThreatsPage from './pages/ThreatsPage';
import SynergyPage from './pages/SynergyPage';
import CalcPage from './pages/CalcPage';
import OptimizerPage from './pages/OptimizerPage';
import DexPage from './pages/DexPage';
import SettingsPage from './pages/SettingsPage';

const NAV = [
  { to: '/time', label: 'Time', icon: '⬢' },
  { to: '/ameacas', label: 'Ameacas', icon: '⚠' },
  { to: '/sinergia', label: 'Sinergia', icon: '⇄' },
  { to: '/calc', label: 'Calc', icon: '≡' },
  { to: '/sp', label: 'SP', icon: '◎' },
  { to: '/dex', label: 'Dex', icon: '☰' },
];

function StatusStrip() {
  const { status, snapshot, fromCache, error } = useMetaStore();
  const reg = activeRegulation();
  const stale = regulationIsStale(reg);

  if (status === 'carregando') {
    return <Banner tone="accent">Buscando o meta ao vivo...</Banner>;
  }
  if (status === 'erro') {
    return <Banner tone="danger">Sem dados de meta. {error} Veja Ajustes › Diagnostico.</Banner>;
  }
  if (fromCache && snapshot) {
    const dias = Math.floor((Date.now() - snapshot.fetchedAt) / 86_400_000);
    return (
      <Banner tone="warn">
        Rede indisponivel — mostrando o ultimo recorte salvo
        {dias > 0 ? ` (${dias} dia${dias > 1 ? 's' : ''} atras)` : ' (de hoje)'}.
      </Banner>
    );
  }
  if (stale) {
    return (
      <Banner tone="warn">
        {reg.label} terminou em {reg.end}. As regras exibidas podem estar desatualizadas.
      </Banner>
    );
  }
  return null;
}

function Banner({ tone, children }: { tone: 'accent' | 'warn' | 'danger'; children: React.ReactNode }) {
  const map = {
    accent: 'bg-accent/10 text-accent border-accent/25',
    warn: 'bg-warn/10 text-warn border-warn/25',
    danger: 'bg-danger/10 text-danger border-danger/25',
  } as const;
  return <div className={`border-b px-4 py-1.5 text-xs ${map[tone]}`}>{children}</div>;
}

export default function App() {
  const load = useMetaStore((s) => s.load);
  const reg = activeRegulation();

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex min-h-full flex-col bg-ink-900">
      <header className="safe-top sticky top-0 z-30 border-b border-ink-800 bg-ink-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-ink-100">Champions Lab</h1>
            <p className="truncate text-[11px] text-ink-400">
              {reg.label} · Doubles · traz {reg.teamSize} escolhe {reg.battleSize}
            </p>
          </div>
          <NavLink
            to="/ajustes"
            className={({ isActive }) =>
              `rounded-lg border px-2.5 py-1.5 text-xs ${
                isActive ? 'border-accent text-accent' : 'border-ink-700 text-ink-300'
              }`
            }
          >
            Ajustes
          </NavLink>
        </div>
        <StatusStrip />
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-28">
        <Routes>
          <Route path="/" element={<Navigate to="/time" replace />} />
          <Route path="/time" element={<TeamPage />} />
          <Route path="/ameacas" element={<ThreatsPage />} />
          <Route path="/sinergia" element={<SynergyPage />} />
          <Route path="/sinergia/:speciesId" element={<SynergyPage />} />
          <Route path="/calc" element={<CalcPage />} />
          <Route path="/sp" element={<OptimizerPage />} />
          <Route path="/dex" element={<DexPage />} />
          <Route path="/ajustes" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/time" replace />} />
        </Routes>
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-ink-800 bg-ink-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition ${
                  isActive ? 'text-accent' : 'text-ink-400'
                }`
              }
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
