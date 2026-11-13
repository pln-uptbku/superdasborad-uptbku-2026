import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, FileDown, X, AlertTriangle } from 'lucide-react';
import { SourceState } from '../lib/data';

/* ---------- theme ---------- */
const ThemeCtx = React.createContext<{ dark: boolean; toggle: () => void }>({ dark: false, toggle: () => {} });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('uptbku-theme-v2') === 'dark'; } catch { return false; } });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('uptbku-theme-v2', dark ? 'dark' : 'light'); } catch { /* ignore */ }
  }, [dark]);
  return <ThemeCtx.Provider value={{ dark, toggle: () => setDark((d) => !d) }}>{children}</ThemeCtx.Provider>;
}
export const useTheme = () => React.useContext(ThemeCtx);

export const C = {
  cyan: '#00E5FF', blue: '#00AEEF', pln: '#0072CE', bar: '#009DFF', ok: '#00D26A', warn: '#FFB800', alert: '#FF8A00', crit: '#FF3B3B', purple: '#7B61FF', gold: '#FFC940',
};
export const STATUS_COLORS: Record<string, string> = {
  NORMAL: C.ok, BAHAYA_II: C.warn, BAHAYA_I: C.alert, KRITIS: C.crit,
  'BAHAYA 2': C.warn, 'BAHAYA 1': C.alert, AMAN: C.ok, WASPADA: C.blue,
  BAIK: C.ok, 'HATI-HATI': C.warn, MASALAH: C.crit, OPEN: C.crit, CLOSE: C.ok,
};
export const PALETTE = [C.blue, C.ok, C.warn, C.alert, C.crit, C.purple, C.cyan, '#FF6FB5', '#9BE15D', '#5B8CFF', C.gold, '#36CFC9'];

/** Tema chart terang untuk lembar export (sheet selalu putih, apa pun tema dashboard). */
export interface ChartTheme {
  axis: string;
  grid: string;
  tooltip: {
    contentStyle: React.CSSProperties;
    labelStyle: React.CSSProperties;
    itemStyle: React.CSSProperties;
    cursor: { fill: string };
  };
  legend: { color: string };
  text: string;
  /** True bila chart dirender di dalam lembar export (SheetInner) — dipakai
      SimplePie untuk label % di luar diagram + legenda bernilai. */
  exportLabels?: boolean;
}
export const LIGHT_CHART_THEME: ChartTheme = {
  axis: '#4b6585',
  grid: 'rgba(11,35,64,0.08)',
  tooltip: {
    contentStyle: { background: '#ffffff', border: '1px solid rgba(0,114,206,0.25)', borderRadius: 10, color: '#0b2340' },
    labelStyle: { color: '#0072ce', fontWeight: 700 },
    itemStyle: { color: '#0b2340' },
    cursor: { fill: 'rgba(0,114,206,0.06)' },
  },
  legend: { color: '#0b2340' },
  text: '#0b2340',
  // Lembar export selalu memakai tema terang ini (SheetInner) — penanda bahwa
  // chart sedang dirender untuk export, bukan dashboard.
  exportLabels: true,
};
const ChartThemeCtx = React.createContext<ChartTheme | null>(null);
export function ChartThemeProvider({ theme, children }: { theme: ChartTheme; children: React.ReactNode }) {
  return <ChartThemeCtx.Provider value={theme}>{children}</ChartThemeCtx.Provider>;
}

export function useChartTheme(): ChartTheme {
  const { dark } = useTheme();
  const override = React.useContext(ChartThemeCtx);
  if (override) return override;
  return {
    axis: dark ? '#FFD978' : '#4b6585',
    grid: dark ? 'rgba(142,170,199,0.15)' : 'rgba(11,35,64,0.08)',
    tooltip: {
      contentStyle: { background: dark ? '#071426' : '#ffffff', border: `1px solid ${dark ? 'rgba(0,229,255,0.35)' : 'rgba(0,114,206,0.25)'}`, borderRadius: 10, color: dark ? '#EAF6FF' : '#0b2340' },
      labelStyle: { color: dark ? '#FFC940' : '#0072ce', fontWeight: 700 },
      itemStyle: { color: dark ? '#EAF6FF' : '#0b2340' },
      cursor: { fill: dark ? 'rgba(0,229,255,0.08)' : 'rgba(0,114,206,0.06)' },
    },
    legend: { color: dark ? '#EAF6FF' : '#0b2340' },
    text: dark ? '#EAF6FF' : '#0b2340',
  };
}

/* ---------- building blocks ---------- */
export function Card({ children, className = '', hover = false, ...rest }: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return <div className={`card ${hover ? 'card-hover' : ''} ${className}`} {...rest}>{children}</div>;
}

export function ChartCard({ title, right, children, className = '', height = 280 }: { title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string; height?: number }) {
  return (
    <Card className={`flex flex-col ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="h-section">{title}</h3>
        {right}
      </div>
      <div style={{ height }} className="w-full min-w-0">{children}</div>
    </Card>
  );
}

export function StatCard({ label, labelSub, value, sub, valueSub, color = C.cyan, icon, onClick, badge, bgImage }: { label: React.ReactNode; labelSub?: React.ReactNode; value: React.ReactNode; valueSub?: React.ReactNode; sub?: React.ReactNode; color?: string; icon?: React.ReactNode; onClick?: () => void; badge?: React.ReactNode; bgImage?: string }) {
  return (
    <Card hover className={`relative overflow-hidden ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick}>
      {/* Logo sebagai background SELURUH kartu (watermark): gambar yang sama
          dengan ikon badge, diperbesar menutupi kartu, dengan overlay warna
          kartu di atasnya supaya teks tetap terbaca. */}
      {bgImage && (<>
        <img src={bgImage} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ opacity: 0.4 }} />
        <div className="pointer-events-none absolute inset-0" style={{ background: 'var(--card)', opacity: 0.72 }} />
      </>)}
      <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-20 blur-2xl" style={{ background: color }} />
      <div className="relative flex items-start justify-between gap-2">
        <div><div className="t-label">{label}</div>{labelSub && <div className="text-[11px] t-muted mt-0.5">{labelSub}</div>}</div>
        {icon && <div style={{ color, filter: `drop-shadow(0 0 6px ${color})` }}>{icon}</div>}
      </div>
      <div className="relative mt-2 text-[28px] leading-tight font-extrabold" style={{ color }}>{value}</div>
      {valueSub && <div className="relative text-xs font-bold mt-0.5" style={{ color: 'var(--accent)' }}>{valueSub}</div>}
      {sub && <div className="relative text-xs t-muted mt-1">{sub}</div>}
      {badge && <div className="relative mt-2">{badge}</div>}
    </Card>
  );
}

export function Badge({ status }: { status: string }) {
  const s = (status || '').toUpperCase();
  let cls = 'badge-info';
  if (/^(BAIK|CLOSE|NORMAL|AMAN|ON TRACK)/.test(s)) cls = 'badge-ok';
  else if (/MASALAH|KRITIS|OPEN|BURUK|ERROR|OVERDUE/.test(s)) cls = 'badge-crit';
  else if (/HATI|BAHAYA_II|BAHAYA 2|WARNING|PERHATIAN|FAIR/.test(s)) cls = 'badge-warn';
  else if (/BAHAYA/.test(s)) cls = 'badge-alert';
  if (!s) return <span className="t-muted">—</span>;
  return <span className={`badge ${cls}`}>{status}</span>;
}

export function Select({ label, value, onChange, options, className = '' }: { label?: string; value: string; onChange: (v: string) => void; options: (string | { value: string; label: string })[]; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 min-w-0 ${className}`}>
      {label && <span className="t-label">{label}</span>}
      <select className="inp w-full" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
export function Search({ value, onChange, placeholder = 'Cari…', label = 'Pencarian' }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="t-label">{label}</span>
      <input className="inp w-full" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: React.ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => (
        <button key={t.id} className={`chip ${value === t.id ? 'chip-on' : ''}`} onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="card max-w-3xl w-full max-h-[85vh] overflow-auto" style={{ background: 'var(--bg2)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="h-title text-lg">{title}</h3>
          <button className="btn" onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- sortable table ---------- */
export interface Col<T> {
  key: string;
  label: React.ReactNode;
  render?: (row: T, i: number) => React.ReactNode;
  value?: (row: T) => string | number | Date | null | undefined; // sort + export value
  className?: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
}
type SortDir = 'asc' | 'desc' | null;
function cmp(a: unknown, b: unknown): number {
  const na = a == null || a === '' || (typeof a === 'number' && !Number.isFinite(a));
  const nb = b == null || b === '' || (typeof b === 'number' && !Number.isFinite(b));
  if (na && nb) return 0; if (na) return 1; if (nb) return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'id', { numeric: true, sensitivity: 'base' });
}
export function SortableTable<T>({ rows, cols, pageSize = 0, onRowClick, rowClassName, maxHeight = 520, empty = 'Tidak ada data', hideWhenSorted, fullRow }: {
  rows: T[]; cols: Col<T>[]; pageSize?: number; onRowClick?: (r: T) => void; rowClassName?: (r: T) => string; maxHeight?: number; empty?: string;
  hideWhenSorted?: (r: T) => boolean; fullRow?: (r: T) => React.ReactNode | null;
}) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({ key: '', dir: null });
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [rows, sort]);
  const sorted = useMemo(() => {
    if (!sort.dir) return rows;
    const col = cols.find((c) => c.key === sort.key);
    if (!col) return rows;
    const get = col.value ?? ((r: T) => (r as any)[col.key]);
    const base = hideWhenSorted ? rows.filter((r) => !hideWhenSorted(r)) : rows;
    const out = [...base].sort((a, b) => cmp(get(a), get(b)));
    if (sort.dir === 'desc') {
      // keep empty values at bottom
      const filled = out.filter((r) => { const v = get(r); return !(v == null || v === ''); }).reverse();
      const blanks = out.filter((r) => { const v = get(r); return v == null || v === ''; });
      return [...filled, ...blanks];
    }
    return out;
  }, [rows, sort, cols]);
  const pages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const view = pageSize ? sorted.slice(page * pageSize, page * pageSize + pageSize) : sorted;
  const click = (c: Col<T>) => {
    if (c.sortable === false) return;
    setSort((s) => (s.key !== c.key ? { key: c.key, dir: 'asc' } : s.dir === 'asc' ? { key: c.key, dir: 'desc' } : { key: '', dir: null }));
  };
  return (
    <div>
      <div className="overflow-auto rounded-xl" style={{ maxHeight, border: '1px solid var(--row-border)' }}>
        <table className="tbl">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} onClick={() => click(c)} className={`${c.sortable === false ? '' : 'cursor-pointer select-none'} ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}>
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {c.sortable !== false && (sort.key === c.key && sort.dir === 'asc' ? <ArrowUp size={12} /> : sort.key === c.key && sort.dir === 'desc' ? <ArrowDown size={12} /> : <ArrowUpDown size={12} className="opacity-50" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && <tr><td colSpan={cols.length} className="text-center t-muted py-6">{empty}</td></tr>}
            {view.map((r, i) => { const fr = fullRow?.(r); return fr ? (
              <tr key={i} className={rowClassName ? rowClassName(r) : ''}><td colSpan={cols.length}>{fr}</td></tr>
            ) : (
              <tr key={i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={`${onRowClick ? 'cursor-pointer' : ''} ${rowClassName ? rowClassName(r) : ''}`}>
                {cols.map((c) => (
                  <td key={c.key} className={`${c.className ?? ''} ${c.align === 'right' ? 'text-right tabular-nums' : c.align === 'center' ? 'text-center' : ''}`}>
                    {c.render ? c.render(r, page * pageSize + i) : String((c.value ? c.value(r) : (r as any)[c.key]) ?? '')}
                  </td>
                ))}
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
      {pageSize > 0 && sorted.length > pageSize && (
        <div className="flex items-center justify-between mt-3 text-xs t-muted">
          <span>{sorted.length.toLocaleString('id-ID')} baris · halaman {page + 1}/{pages}</span>
          <div className="flex gap-2">
            <button className="btn" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}><ChevronLeft size={14} /></button>
            <button className="btn" disabled={page >= pages - 1} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}><ChevronRight size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- PDF export of filtered data (format poster: header + logo) ---------- */
async function loadLogo(src: string): Promise<string | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => resolve('');
      r.readAsDataURL(blob);
    });
    return dataUrl || null;
  } catch { return null; }
}

export async function exportPdf<T>(title: string, subtitle: string, cols: Col<T>[], rows: T[]) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = (autoTableMod as any).default ?? (autoTableMod as any).autoTable;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const stamp = new Date().toLocaleString('id-ID');
  const [danantara, upt, pln] = await Promise.all([loadLogo('/pdf/danantara.png'), loadLogo('/pdf/upt.png'), loadLogo('/pdf/pln.png')]);
  // Header gaya poster: pita navy + garis emas + logo Danantara/UPT/PLN di pelat putih.
  const drawHeader = () => {
    doc.setFillColor(11, 35, 64); doc.rect(0, 0, W, 58, 'F');
    doc.setFillColor(255, 201, 64); doc.rect(0, 58, W, 3, 'F');
    let right = W - 30;
    const place = (img: string | null, w: number) => {
      if (!img) return;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(right - w - 8, 8, w + 8, 42, 4, 4, 'F');
      doc.addImage(img, 'PNG', right - w - 4, 12, w, 34);
      right -= w + 16;
    };
    place(pln, 23);
    place(upt, 27);
    place(danantara, 136);
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text(title, 40, 26);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(200, 210, 225);
    doc.text(subtitle, 40, 43);
  };
  const val = (c: Col<T>, r: T) => {
    const v = c.value ? c.value(r) : (r as any)[c.key];
    if (v instanceof Date) return v.toLocaleDateString('id-ID');
    if (typeof v === 'number') return v.toLocaleString('id-ID');
    return v == null ? '' : String(v);
  };
  autoTable(doc, {
    startY: 76,
    head: [cols.map((c) => (typeof c.label === 'string' ? c.label : c.key).toUpperCase())],
    body: rows.map((r) => cols.map((c) => val(c, r))),
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [7, 20, 38], textColor: [255, 201, 64] },
    alternateRowStyles: { fillColor: [240, 246, 252] },
    margin: { left: 30, right: 30, top: 76, bottom: 30 },
    didDrawPage: () => drawHeader(),
  });
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
    doc.text('PT PLN (Persero) UPT Bengkulu · plnuptbengkulu.web.id', 30, H - 16);
    doc.text(`dicetak ${stamp} · ${rows.length} baris · halaman ${i} dari ${n}`, W - 30, H - 16, { align: 'right' });
  }
  doc.save(`${title.replace(/[^\w]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
export function ExportButton<T>({ title, subtitle, cols, rows }: { title: string; subtitle: string; cols: Col<T>[]; rows: T[] }) {
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); try { await exportPdf(title, subtitle, cols, rows); } finally { setBusy(false); } }}>
      <FileDown size={15} /> {busy ? 'Membuat PDF…' : 'Export PDF'}
    </button>
  );
}

/* ---------- loading / error ---------- */
export function UptLogo({ size = 120 }: { size?: number | string }) {
  return (
    <div
      aria-label="Logo UPT Bengkulu"
      style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
    >
      <img src="/logo-uptbku.png" alt="UPT Bengkulu — Camkoha Bisa" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.18))' }} />
    </div>
  );
}
export function LoadingScreen({ text = 'Memuat data…', full = false }: { text?: string; full?: boolean }) {
  const size: number | string = 'min(850px, 68vh, 88vw)';
  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${full ? 'fixed inset-0 z-50' : 'py-16'}`} style={full ? { background: 'var(--bg)' } : undefined}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="absolute inset-0 spin" viewBox="0 0 200 200">
          <defs><linearGradient id="r1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#00E5FF" /><stop offset="1" stopColor="#0072CE" stopOpacity="0" /></linearGradient></defs>
          <circle cx="100" cy="100" r="94" fill="none" stroke="url(#r1)" strokeWidth="4" strokeDasharray="420 180" strokeLinecap="round" />
        </svg>
        <svg className="absolute inset-0 spin-rev" viewBox="0 0 200 200">
          <defs><linearGradient id="r2" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#FFC940" /><stop offset="1" stopColor="#FF3B3B" stopOpacity="0.2" /></linearGradient></defs>
          <circle cx="100" cy="100" r="80" fill="none" stroke="url(#r2)" strokeWidth="3" strokeDasharray="260 240" strokeLinecap="round" />
        </svg>
        <svg className="absolute inset-0 spin-slow" viewBox="0 0 200 200">
          {Array.from({ length: 6 }).map((_, i) => {
            const a = (i / 6) * Math.PI * 2;
            return <circle key={i} cx={100 + 99 * Math.cos(a)} cy={100 + 99 * Math.sin(a)} r="3.2" fill="#00E5FF" style={{ filter: 'drop-shadow(0 0 4px #00E5FF)' }} />;
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pulse-logo" style={{ color: 'var(--heading)' }}>
          <UptLogo size={typeof size === 'number' ? size * 0.56 : '56%'} />
        </div>
      </div>
      <div className="h-section">{text}</div>
      <div className="text-xs t-muted">PT PLN (Persero) · UPT Bengkulu</div>
    </div>
  );
}
export function ErrorState({ title = 'Data tidak dapat dimuat', detail, onRetry }: { title?: string; detail?: string; onRetry?: () => void }) {
  return (
    <Card className="flex flex-col items-center text-center gap-2 py-10">
      <AlertTriangle size={36} color={C.crit} />
      <div className="h-title text-lg">{title}</div>
      {detail && <div className="text-xs t-muted max-w-xl break-words">{detail}</div>}
      {onRetry && <button className="btn btn-primary mt-2" onClick={onRetry}>Coba muat ulang</button>}
    </Card>
  );
}
/** Render children only when the given sources are loaded. */
export function Gate({ sources, onRetry, children, text }: { sources: SourceState<unknown>[]; onRetry: () => void; children: () => React.ReactNode; text?: string }) {
  const err = sources.find((s) => s.status === 'error');
  if (err) return <ErrorState detail={err.error} onRetry={onRetry} />;
  if (sources.some((s) => s.status !== 'ok')) return <LoadingScreen text={text} />;
  return <>{children()}</>;
}

export function PageHeader({ title, subtitle, right }: { title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="h-title text-2xl">{title}</h1>
        {subtitle && <div className="text-sm t-muted mt-1">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

/** Count/sum helpers */
export function groupSum<T>(rows: T[], key: (r: T) => string, val: (r: T) => number = () => 1) {
  const m = new Map<string, number>();
  for (const r of rows) { const k = key(r) || '-'; m.set(k, (m.get(k) ?? 0) + val(r)); }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
export const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
