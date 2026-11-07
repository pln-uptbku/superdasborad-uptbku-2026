import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { FileDown } from 'lucide-react';
import { ChartThemeProvider, LIGHT_CHART_THEME } from '../components/ui';

/**
 * Export ringkasan 1 halaman (A4 portrait) — BUKAN screenshot halaman panjang.
 *
 * Setiap halaman merender satu <ExportSheet> berisi layout ringkasan khusus
 * (header + KPI krusial + chart utama + tabel kunci) yang muat di kotak A4
 * 794x1123 px. Node itu diposisikan off-screen (tidak mengubah tampilan
 * dashboard) dan di-capture html2canvas -> PNG, atau ditempel ke jsPDF
 * A4 portrait sebagai 1 halaman penuh. Teks tetap teks di DOM sampai
 * capture, jadi tidak ada pengecilan halaman panjang yang tidak terbaca.
 *
 * Cara pakai di halaman: render <ExportSheet meta={...}>...</ExportSheet>
 * (cukup 1 per halaman, di dalam JSX halaman). TopBar menampilkan
 * <ExportMenu /> yang mengekspor sheet halaman yang sedang aktif.
 *
 * QA visual: buka halaman dengan ?exportPreview=1 — sheet tampil di layar
 * (posisi statis, di atas konten) supaya bisa di-screenshot/di-review.
 */
export const EXPORT_W = 794; // A4 @96dpi
export const EXPORT_H = 1123;

export interface ExportMeta {
  /** Judul halaman, tampil di header sheet. */
  title: string;
  /** Subjudul: konteks pilihan (bulan/tab/filter) halaman saat ini. */
  subtitle?: string;
  /** Dasar nama file, tanpa tanggal & ekstensi. */
  fileBase: string;
  /** Waktu update data (sumber) yang ditampilkan. */
  updatedAt?: Date | null;
}

interface Current { node: HTMLElement; meta: ExportMeta }
interface ExportCtxValue {
  ready: boolean;
  busy: boolean;
  error: string | null;
  exportKind: (kind: 'pdf' | 'png') => Promise<void>;
  register: (node: HTMLElement | null, meta: ExportMeta | null) => void;
}

const ExportCtx = createContext<ExportCtxValue | null>(null);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function ExportProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<Current | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentRef = useRef(current); currentRef.current = current;
  const busyRef = useRef(false);

  const register = useCallback((node: HTMLElement | null, meta: ExportMeta | null) => {
    const prev = currentRef.current;
    const sameMeta = prev && meta
      && prev.meta.title === meta.title && prev.meta.subtitle === meta.subtitle
      && prev.meta.fileBase === meta.fileBase
      && (prev.meta.updatedAt?.getTime() ?? null) === (meta.updatedAt?.getTime() ?? null);
    if (prev?.node === node && sameMeta) return;
    if (!node || !meta) { setCurrent(null); return; }
    setCurrent({ node, meta });
  }, []);

  const exportKind = useCallback(async (kind: 'pdf' | 'png') => {
    const cur = currentRef.current;
    if (!cur) { setError('Halaman ini belum siap diekspor (data masih dimuat).'); return; }
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      // Beri waktu animasi chart (Recharts) selesai sebelum capture.
      await sleep(800);
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(cur.node, {
        scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false,
        width: EXPORT_W, height: EXPORT_H,
      });
      const stamp = new Date().toISOString().slice(0, 10);
      const base = `${cur.meta.fileBase}_${stamp}`;
      if (kind === 'png') {
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
        if (!blob) throw new Error('Gagal membuat gambar PNG.');
        downloadBlob(blob, `${base}.png`);
      } else {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
        // JPEG 0.92: jauh lebih kecil dari PNG untuk gambar foto-grafik ini
        // (10,7 MB -> ~1 MB) dengan kualitas visual yang sama di kertas.
        doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 595.28, 841.89);
        doc.save(`${base}.pdf`);
      }
    } catch (e) {
      setError(`Export gagal: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busyRef.current = false; setBusy(false);
    }
  }, []);

  return (
    <ExportCtx.Provider value={{ ready: !!current, busy, error, exportKind, register }}>
      {children}
    </ExportCtx.Provider>
  );
}

export function useExport() {
  const c = useContext(ExportCtx);
  if (!c) throw new Error('useExport di luar ExportProvider');
  return c;
}

/* ---------------- lembar ringkasan A4 portrait ---------------- */

const SHEET_FONT = "Inter, 'Plus Jakarta Sans', Arial, sans-serif";

export function ExportSheet({ meta, children }: { meta: ExportMeta; children: React.ReactNode }) {
  const { register } = useExport();
  const ref = useRef<HTMLDivElement>(null);
  const preview = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('exportPreview');
  // Daftarkan node+meta ke provider; hanya ulang bila identitasnya berubah
  // (tanpa dep array, cleanup register(null) + effect register(node) akan
  // berputar tanpa henti dan membuat tombol Export berkedip enabled/disabled).
  useEffect(() => {
    register(ref.current, meta);
    return () => register(null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.title, meta.subtitle, meta.fileBase, meta.updatedAt]);
  const now = new Date();
  return (
    <div
      ref={ref}
      data-export-sheet
      style={preview
        ? { width: EXPORT_W, height: EXPORT_H, margin: '24px auto', background: '#ffffff', boxShadow: '0 8px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }
        : { position: 'fixed', left: -12000, top: 0, width: EXPORT_W, height: EXPORT_H, overflow: 'hidden', background: '#ffffff' }}
    >
      <ChartThemeProvider theme={LIGHT_CHART_THEME}>
        <div style={{ padding: '24px 30px 18px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', fontFamily: SHEET_FONT, color: '#0B2340' }}>
          <div style={{ background: '#0B2340', borderRadius: 10, padding: '11px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: '#FFC940', fontSize: 10, fontWeight: 800, letterSpacing: 2 }}>PT PLN (PERSERO)</div>
              <div style={{ color: '#ffffff', fontSize: 19, fontWeight: 800, lineHeight: 1.2 }}>UPT BENGKULU</div>
            </div>
            <div style={{ color: '#BFE9FF', fontSize: 11, fontWeight: 700, textAlign: 'right', lineHeight: 1.5 }}>
              KPI Command Center<br /><span style={{ color: '#7FA8C9', fontWeight: 400 }}>plnuptbengkulu.web.id</span>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 21, fontWeight: 800, color: '#0B2340', lineHeight: 1.2 }}>{meta.title}</div>
            <div style={{ fontSize: 11, color: '#5B6B80', marginTop: 3 }}>
              {meta.subtitle}
              {meta.updatedAt ? <> · Update data: {meta.updatedAt.toLocaleString('id-ID')}</> : ''}
            </div>
            <div style={{ height: 3, background: '#FFC940', borderRadius: 2, marginTop: 8, width: 120 }} />
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {children}
          </div>
          <div style={{ borderTop: '1px solid #D7E2EE', paddingTop: 8, marginTop: 12, fontSize: 9, color: '#7A8AA0', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>Sumber data: Google Sheets (live) · Ringkasan 1 halaman — detail lengkap lihat dashboard</span>
            <span style={{ whiteSpace: 'nowrap' }}>Diekspor {now.toLocaleString('id-ID')} · 1 dari 1</span>
          </div>
        </div>
      </ChartThemeProvider>
    </div>
  );
}

/* ---------------- primitif isi ringkasan ---------------- */

export function XKpis({ items }: { items: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {items.map((it, i) => (
        <div key={i} style={{ flex: 1, minWidth: 0, border: '1px solid #D7E2EE', borderRadius: 10, padding: '9px 11px', background: '#F7FAFD' }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: '#5B6B80', textTransform: 'uppercase' }}>{it.label}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: it.color ?? '#0B2340', lineHeight: 1.15, marginTop: 3, wordBreak: 'break-word' }}>{it.value}</div>
          {it.sub != null && <div style={{ fontSize: 10, color: '#5B6B80', marginTop: 2, lineHeight: 1.35 }}>{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function XSection({ title, right, height, children }: { title: string; right?: React.ReactNode; height: number; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0B2340' }}>{title}</div>
        {right != null && <div style={{ fontSize: 10, color: '#5B6B80' }}>{right}</div>}
      </div>
      <div style={{ height, width: '100%' }}>{children}</div>
    </div>
  );
}

export function XTable({ title, headers, rows, aligns, maxRows = 9, widths }: {
  title?: string;
  headers: string[];
  rows: React.ReactNode[][];
  aligns?: ('left' | 'right' | 'center')[];
  maxRows?: number;
  /** Lebar kolom eksplisit (mis. ['11%','14%',...]); bila diisi, tabel pakai layout fixed
      supaya kolom sempit (tanggal/nama ULTG) tidak terjepit dan terpotong tengah kata. */
  widths?: string[];
}) {
  const shown = rows.slice(0, maxRows);
  return (
    <div>
      {title && <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0B2340', marginBottom: 6 }}>{title}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, color: '#0B2340', tableLayout: widths ? 'fixed' : undefined }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ background: '#0B2340', color: '#FFC940', textAlign: aligns?.[i] ?? 'left', padding: '6px 8px', fontSize: 10, letterSpacing: 0.4, width: widths?.[i] }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i} style={{ background: i % 2 ? '#FFFFFF' : '#F0F6FC' }}>
              {r.map((c, j) => (
                <td key={j} style={{ padding: '5px 8px', textAlign: aligns?.[j] ?? 'left', borderBottom: '1px solid #E3ECF5', verticalAlign: 'top', wordBreak: 'break-word' }}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > maxRows && (
        <div style={{ fontSize: 10, color: '#5B6B80', marginTop: 4, fontStyle: 'italic' }}>
          +{rows.length - maxRows} baris lainnya — lihat dashboard untuk detail lengkap.
        </div>
      )}
    </div>
  );
}

export function XNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: '#5B6B80', background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 8, padding: '8px 10px', lineHeight: 1.45 }}>
      {children}
    </div>
  );
}

/* ---------------- menu Export di TopBar ---------------- */

export function ExportMenu() {
  const { ready, busy, error, exportKind } = useExport();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open ]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn btn-primary" disabled={!ready || busy} onClick={() => setOpen((o) => !o)} title={ready ? 'Export ringkasan halaman ini (1 halaman, A4 tegak)' : 'Menunggu data halaman dimuat…'}>
        <FileDown size={15} /> {busy ? 'Membuat…' : 'Export'}
      </button>
      {open && (
        <div className="card" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', minWidth: 250, zIndex: 50, padding: 6, textAlign: 'left' }}>
          <button className="btn w-full" style={{ justifyContent: 'flex-start' }} onClick={async () => { setOpen(false); await exportKind('pdf'); }}>
            PDF
          </button>
          <button className="btn w-full" style={{ justifyContent: 'flex-start', marginTop: 4 }} onClick={async () => { setOpen(false); await exportKind('png'); }}>
            IMAGE
          </button>
          <div style={{ fontSize: 10, color: 'var(--muted)', padding: '6px 8px 2px', lineHeight: 1.4 }}>
            Ringkasan halaman ini: KPI krusial, chart utama &amp; tabel kunci.
          </div>
          {error && <div style={{ fontSize: 11, color: '#FF3B3B', padding: '4px 8px' }}>{error}</div>}
        </div>
      )}
      {error && !open && <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 260, zIndex: 50, fontSize: 11, color: '#FF3B3B', background: 'var(--bg2)', border: '1px solid rgba(255,59,59,0.4)', borderRadius: 8, padding: '6px 8px' }}>{error}</div>}
    </div>
  );
}
