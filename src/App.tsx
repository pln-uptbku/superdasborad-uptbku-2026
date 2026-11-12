import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, Axe, ChevronLeft, ChevronRight, Gauge, Home as HomeIcon, Images, LayoutDashboard, Menu, Moon, RefreshCw, ShieldAlert, Sun, TreePine, Zap, X } from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { DataProvider, PageSourcesProvider, useData, usePageSourceKeys } from './lib/data';
import { LoadingScreen, ThemeProvider, UptLogo, useTheme } from './components/ui';
import { ExportMenu, ExportProvider } from './lib/export';
// Setiap halaman dimuat terpisah (code splitting) supaya loading awal lebih ringan.
const Beranda = lazy(() => import('./pages/Beranda'));
const Home = lazy(() => import('./pages/Home'));
const Kinerja = lazy(() => import('./pages/Kinerja'));
const Tegakan = lazy(() => import('./pages/Tegakan'));
const Penebangan = lazy(() => import('./pages/Penebangan'));
const Kerawanan = lazy(() => import('./pages/Kerawanan'));
const Gangguan = lazy(() => import('./pages/Gangguan'));
const Ultg = lazy(() => import('./pages/Ultg'));
const Galeri = lazy(() => import('./pages/Galeri'));

const NAV = [
  { to: '/', label: 'Beranda', icon: HomeIcon, end: true },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/kinerja', label: 'Kinerja NKO', icon: Gauge },
  { to: '/tegakan', label: 'Tegakan (NS)', icon: TreePine },
  { to: '/penebangan', label: 'Realisasi Penebangan', icon: Axe },
  { to: '/kerawanan', label: 'Kerawanan Transmisi', icon: ShieldAlert },
  { to: '/gangguan', label: 'Monitoring Gangguan', icon: Activity },
  { to: '/galeri', label: 'Galeri Kegiatan', icon: Images },
  { to: '/ultg', label: 'Kinerja ULTG', icon: Zap, soon: false },
];

function Sidebar({ open, onClose, collapsed }: { open: boolean; onClose: () => void; collapsed: boolean }) {
  const { dark, toggle } = useTheme();
  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-[260px] shrink-0 flex flex-col transition-transform ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} ${collapsed ? 'lg:hidden' : ''}`}
        style={{ background: 'var(--side)', borderRight: '1px solid var(--card-border)' }}
      >
        <div className="flex items-center gap-3 px-5 py-5" style={{ color: 'var(--heading)' }}>
          <UptLogo size={60} />
          <div className="leading-tight">
            <div className="text-[11px] font-bold tracking-widest" style={{ color: 'var(--heading)' }}>PT PLN (PERSERO)</div>
            <div className="text-base font-extrabold t-accent">UPT BENGKULU</div>
            <div className="text-[10px] t-muted">KPI Command Center</div>
          </div>
          <button className="ml-auto lg:hidden btn" onClick={onClose}><X size={16} /></button>
        </div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${isActive ? 'text-white' : ''}`
              }
              style={({ isActive }) => (isActive
                ? { background: 'linear-gradient(135deg,#0072CE,#00AEEF)', boxShadow: '0 0 14px rgba(0,229,255,0.45)' }
                : { color: dark ? '#FFD978' : '#0b2340' })}
            >
              <n.icon size={18} />
              <span className="flex-1">{n.label}</span>
              {n.soon && <span className="badge badge-warn">SOON</span>}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 space-y-2" style={{ borderTop: '1px solid var(--card-border)' }}>
          <div className="t-label">Tema</div>
          <button className="btn w-full justify-center" onClick={toggle} aria-label="Ganti tema">
            {dark ? <><Moon size={16} color="#FFC940" /> Dark <span className="t-muted">→</span> <Sun size={16} /> </> : <><Sun size={16} color="#FFB800" /> Light <span className="t-muted">→</span> <Moon size={16} /></>}
          </button>
          <div className="text-[10px] t-muted text-center">Data live dari Google Sheets</div>
          <div className="pt-2 mt-1 text-center leading-relaxed" style={{ borderTop: '1px solid var(--card-border)' }}>
            <div className="text-[10px] t-muted">© {new Date().getFullYear()} PLN UPT Bengkulu</div>
            <div className="text-[10px] t-muted opacity-80">Dikembangkan oleh <a href="https://www.linkedin.com/in/febbyutomo/" target="_blank" rel="noopener noreferrer" className="hover:underline">Febby P. Utomo</a></div>
          </div>
        </div>
      </aside>
    </>
  );
}

function TopBar({ onMenu, collapsed, onToggleSidebar }: { onMenu: () => void; collapsed: boolean; onToggleSidebar: () => void }) {
  const { refresh, state } = useData();
  const keys = usePageSourceKeys();
  const { pathname } = useLocation();
  // Beranda tidak punya export sheet dan bukan halaman data: sembunyikan
  // Export + Refresh Data hanya di sini; halaman lain tidak berubah.
  const isBeranda = pathname === '/';
  const loading = keys.some((k) => state[k].status === 'loading');
  const times = keys.map((k) => state[k].updatedAt).filter(Boolean) as Date[];
  const last = times.length ? new Date(Math.min(...times.map((t) => t.getTime()))) : null;
  const errs = keys.filter((k) => state[k].error);
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 px-4 lg:px-8 py-3" style={{ background: 'color-mix(in srgb, var(--bg) 85%, transparent)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--card-border)' }}>
      <button className="btn lg:hidden" onClick={onMenu} aria-label="Buka menu"><Menu size={16} /></button>
      <button className="btn hidden lg:inline-flex" onClick={onToggleSidebar} aria-label={collapsed ? 'Tampilkan sidebar' : 'Sembunyikan sidebar'} title={collapsed ? 'Tampilkan sidebar' : 'Sembunyikan sidebar'}>{collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
      <div className="text-xs t-muted hidden sm:block">
        {last ? <>Update data: <span className="t-accent font-semibold">{last.toLocaleString('id-ID')}</span></> : 'Memuat data…'}
        {errs.length > 0 && <span className="ml-2 badge badge-crit">{errs.length} sumber gagal dimuat ulang</span>}
      </div>
      {!isBeranda && (
        <span className="ml-auto flex items-center gap-2">
          <ExportMenu />
          <button className="btn btn-primary" onClick={() => refresh(keys)} disabled={loading || !keys.length}>
            <RefreshCw size={15} className={loading ? 'refresh-spin' : ''} /> Refresh Data
          </button>
        </span>
      )}
    </header>
  );
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function Shell() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="flex min-h-screen cyber-grid">
      <Sidebar open={open} onClose={() => setOpen(false)} collapsed={collapsed} />
      <div className="flex-1 min-w-0 relative z-10">
        <TopBar onMenu={() => setOpen(true)} collapsed={collapsed} onToggleSidebar={() => setCollapsed((v) => !v)} />
        <main className="px-4 lg:px-8 py-6 max-w-[1700px] mx-auto">
          <ScrollTop />
          <Suspense fallback={<LoadingScreen text="Membuka halaman…" />}>
          <Routes>
            <Route path="/" element={<Beranda />} />
            <Route path="/dashboard" element={<Home />} />
            <Route path="/kinerja" element={<Kinerja />} />
            <Route path="/tegakan" element={<Tegakan />} />
            <Route path="/penebangan" element={<Penebangan />} />
            <Route path="/kerawanan" element={<Kerawanan />} />
            <Route path="/gangguan" element={<Gangguan />} />
            <Route path="/ultg" element={<Ultg />} />
            <Route path="/galeri" element={<Galeri />} />
            <Route path="*" element={<Beranda />} />
          </Routes>
          </Suspense>
          <footer className="text-center text-[11px] t-muted py-8">© {new Date().getFullYear()} PLN UPT Bengkulu · Dikembangkan oleh <a href="https://www.linkedin.com/in/febbyutomo/" target="_blank" rel="noopener noreferrer" className="hover:underline">Febby P. Utomo</a></footer>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <DataProvider>
        <PageSourcesProvider>
          <BrowserRouter>
            <ExportProvider>
              <Shell />
            </ExportProvider>
            <Analytics />
            <SpeedInsights />
          </BrowserRouter>
        </PageSourcesProvider>
      </DataProvider>
    </ThemeProvider>
  );
}
