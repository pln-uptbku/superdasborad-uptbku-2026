import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { FileDown, X } from 'lucide-react';
import { ChartThemeProvider, LIGHT_CHART_THEME } from '../components/ui';
import { themeFor } from './ultgPdf';

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
 * Gaya visual lembar mengikuti model poster PDF ULTG (ultgPdf.ts): header
 * art tematik bulanan + logo Danantara/UPT/PLN + badge tema, footer pita
 * merah + slogan — isi tetap ringkasan 1 halaman, bukan poster multi-halaman.
 *
 * Cara pakai di halaman: render <ExportSheet meta={...}>...</ExportSheet>
 * (cukup 1 per halaman, di dalam JSX halaman). TopBar menampilkan
 * <ExportMenu /> — tombol Export membuka jendela preview (modal) berisi
 * salinan lembar yang sama, dengan pilihan PDF / IMAGE di atas preview;
 * unduhan tetap di-capture dari node off-screen yang sama, jadi hasil
 * export persis sama dengan yang terlihat di preview.
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
  /** Jendela preview (modal) terbuka / tidak. */
  previewOpen: boolean;
  openPreview: () => void;
  closePreview: () => void;
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const currentRef = useRef(current); currentRef.current = current;
  const busyRef = useRef(false);
  const openPreview = useCallback(() => { setError(null); setPreviewOpen(true); }, []);
  const closePreview = useCallback(() => setPreviewOpen(false), []);

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
    <ExportCtx.Provider value={{ ready: !!current, busy, error, exportKind, register, previewOpen, openPreview, closePreview }}>
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

/** Isi lembar A4 — dipakai 2x: node capture (off-screen) dan salinan preview
    di modal. Salinan preview TIDAK di-capture (bukan node terdaftar), jadi
    transform scale di salinan tidak memengaruhi hasil export. */
function SheetInner({ meta, th, artOk, setArtOk, children }: {
  meta: ExportMeta;
  th: ReturnType<typeof themeFor>;
  artOk: boolean;
  setArtOk: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const now = new Date();
  return (
    <ChartThemeProvider theme={LIGHT_CHART_THEME}>
      <div style={{ padding: '18px 30px 12px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', fontFamily: SHEET_FONT, color: '#0B2340' }}>
        {/* Header gaya poster: art tematik + logo Danantara/UPT/PLN + badge tema bulanan + judul halaman.
            Tinggi 96px: Kinerja (35 baris + catatan) hanya muat bila chrome sehemat ini. */}
        <div style={{ position: 'relative', height: 96, borderRadius: 10, overflow: 'hidden', background: '#0B2340', flexShrink: 0 }}>
          {artOk && (
            <img src={`/pdf/hdr-${th.month}.jpg`} alt="" onError={() => setArtOk(false)}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 22%' }} />
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(11,35,64,0.15) 0%, rgba(11,35,64,0) 40%, rgba(11,35,64,0.55) 100%)' }} />
          <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '7px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ background: '#ffffff', borderRadius: 6, padding: '3px 6px', display: 'inline-flex' }}>
                <img src="/pdf/danantara.png" alt="Danantara" style={{ width: 84, height: 21, display: 'block' }} />
              </span>
              <span style={{ background: '#ffffff', borderRadius: 6, padding: '2px 4px', display: 'inline-flex' }}>
                <img src="/pdf/upt.png" alt="UPT Bengkulu" style={{ width: 32, height: 40, display: 'block' }} />
              </span>
              <span style={{ background: '#ffffff', borderRadius: 6, padding: '2px 4px', display: 'inline-flex' }}>
                <img src="/pdf/pln.png" alt="PLN" style={{ width: 30, height: 45, display: 'block' }} />
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
              <span style={{ background: '#CE1126', borderRadius: 6, padding: '4px 10px', lineHeight: 1.25, flexShrink: 0 }}>
                <span style={{ display: 'block', color: '#ffffff', fontSize: 10.5, fontWeight: 800 }}>{th.badge.toUpperCase()}</span>
                <span style={{ display: 'block', color: '#FFC940', fontSize: 7, fontWeight: 700 }}>{th.badgeSub.toUpperCase()}</span>
              </span>
              <span style={{ color: '#ffffff', fontSize: 19, fontWeight: 800, textAlign: 'right', lineHeight: 1.15, textShadow: '1px 0 0 #0B2340, -1px 0 0 #0B2340, 0 1px 0 #0B2340, 0 -1px 0 #0B2340, 1px 1px 0 #0B2340, -1px -1px 0 #0B2340, 1px -1px 0 #0B2340, -1px 1px 0 #0B2340' }}>{meta.title}</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 11, color: '#5B6B80' }}>
            {meta.subtitle}
            {meta.updatedAt ? <> · Update data: {meta.updatedAt.toLocaleString('id-ID')}</> : ''}
          </div>
          <div style={{ height: 3, background: '#FFC940', borderRadius: 2, marginTop: 4, width: 120 }} />
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {children}
        </div>
        {/* Footer gaya poster: pita merah + slogan + identitas. */}
        <div style={{ background: '#CE1126', borderRadius: 8, padding: '5px 12px', marginTop: 10, display: 'flex', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: '#ffffff', lineHeight: 1.4, maxWidth: 380 }}>
            <b>CATATAN:</b> Sumber data: Google Sheets (live) · Ringkasan 1 halaman — detail lengkap lihat dashboard
          </div>
          <div style={{ textAlign: 'right', color: '#ffffff', flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, fontStyle: 'italic' }}>{th.slogan}</div>
            <div style={{ fontSize: 8.5, marginTop: 2, opacity: 0.95 }}>PT PLN (Persero) UPT Bengkulu · plnuptbengkulu.web.id · Diekspor {now.toLocaleString('id-ID')} · 1 dari 1</div>
          </div>
        </div>
      </div>
    </ChartThemeProvider>
  );
}

/** Jendela preview: backdrop + bar aksi (PDF / IMAGE / Tutup) di atas +
    salinan lembar yang diskalakan agar muat layar. Unduhan tetap dari node
    capture off-screen, jadi hasil file persis sama dengan yang terlihat. */
function ExportPreview({ meta, th, artOk, setArtOk, children }: {
  meta: ExportMeta;
  th: ReturnType<typeof themeFor>;
  artOk: boolean;
  setArtOk: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const { closePreview, exportKind, busy, error } = useExport();
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const calc = () => setScale(Math.min(1, (window.innerWidth - 32) / EXPORT_W, (window.innerHeight - 160) / EXPORT_H));
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  // Kunci scroll halaman + tutup dengan Esc selama preview terbuka.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePreview(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [closePreview]);
  return (
    <>
      <div data-export-backdrop onClick={closePreview} style={{ position: 'fixed', inset: 0, background: 'rgba(11,35,64,0.65)', zIndex: 1000 }} />
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1002, background: '#0B2340', color: '#ffffff', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Preview Export — {meta.title}</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Inilah tampilan yang akan diekspor · 1 halaman, A4 tegak · pilih format di kanan</div>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={() => exportKind('pdf')}>{busy ? 'Membuat…' : 'PDF'}</button>
        <button className="btn" disabled={busy} onClick={() => exportKind('png')} style={{ background: '#ffffff', color: '#0B2340' }}>{busy ? 'Membuat…' : 'IMAGE'}</button>
        <button className="btn" onClick={closePreview} aria-label="Tutup preview" title="Tutup (Esc)" style={{ background: 'transparent', color: '#ffffff', border: '1px solid rgba(255,255,255,0.5)' }}><X size={16} /></button>
        {error && <div style={{ width: '100%', fontSize: 11, color: '#FF8A8A' }}>{error}</div>}
      </div>
      <div style={{ position: 'fixed', inset: 0, top: 72, zIndex: 1001, overflow: 'auto', padding: '12px 8px 32px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: EXPORT_W * scale, height: EXPORT_H * scale, overflow: 'hidden', flexShrink: 0, boxShadow: '0 8px 40px rgba(0,0,0,0.35)', background: '#ffffff' }}>
          <div style={{ width: EXPORT_W, height: EXPORT_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <SheetInner meta={meta} th={th} artOk={artOk} setArtOk={setArtOk}>{children}</SheetInner>
          </div>
        </div>
      </div>
    </>
  );
}

export function ExportSheet({ meta, children }: { meta: ExportMeta; children: React.ReactNode }) {
  const { register, previewOpen } = useExport();
  const ref = useRef<HTMLDivElement>(null);
  const preview = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('exportPreview');
  // Tema poster bulanan (badge + slogan) sama seperti PDF poster ULTG
  // (ultgPdf.themeFor): badge mengikuti tanggal HARI INI, bukan bulan data.
  const th = themeFor(new Date());
  // Art header /pdf/hdr-<bulan>.jpg hanya ada untuk Okt–Des; bila tidak ada,
  // <img> gagal load -> onError sembunyikan, latar navy yang tampil.
  const [artOk, setArtOk] = useState(true);
  // Daftarkan node+meta ke provider; hanya ulang bila identitasnya berubah
  // (tanpa dep array, cleanup register(null) + effect register(node) akan
  // berputar tanpa henti dan membuat tombol Export berkedip enabled/disabled).
  useEffect(() => {
    register(ref.current, meta);
    return () => register(null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.title, meta.subtitle, meta.fileBase, meta.updatedAt]);
  return (
    <>
      <div
        ref={ref}
        data-export-sheet
        style={preview
          ? { width: EXPORT_W, height: EXPORT_H, margin: '24px auto', background: '#ffffff', boxShadow: '0 8px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }
          : { position: 'fixed', left: -12000, top: 0, width: EXPORT_W, height: EXPORT_H, overflow: 'hidden', background: '#ffffff' }}
      >
        <SheetInner meta={meta} th={th} artOk={artOk} setArtOk={setArtOk}>{children}</SheetInner>
      </div>
      {previewOpen && (
        <ExportPreview meta={meta} th={th} artOk={artOk} setArtOk={setArtOk}>{children}</ExportPreview>
      )}
    </>
  );
}

/* ---------------- primitif isi ringkasan ---------------- */

export function XKpis({ items }: { items: {
  label: string;
  /** Tulisan kecil di bawah label (mis. "(2023 s.d tahun berjalan)"). */
  labelSub?: React.ReactNode;
  value: React.ReactNode;
  /** Baris tebal di bawah nilai (mis. "(Tahun Berjalan 2026 = 36)"). */
  valueSub?: React.ReactNode;
  sub?: React.ReactNode;
  /** Baris pil kecil di bawah sub (mis. "96% tebang · 355 record"). */
  badge?: React.ReactNode;
  color?: string;
  /** Ikon kecil di pojok kanan atas kartu, sewarna nilai (mis. <Activity size={20} />). */
  icon?: React.ReactNode;
}[] }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {items.map((it, i) => (
        <div key={i} style={{ flex: 1, minWidth: 0, border: '1px solid #D7E2EE', borderRadius: 10, padding: '9px 11px', background: '#F7FAFD', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: '#5B6B80', textTransform: 'uppercase' }}>{it.label}</div>
              {it.labelSub != null && <div style={{ fontSize: 9, color: '#5B6B80', marginTop: 1, lineHeight: 1.3 }}>{it.labelSub}</div>}
            </div>
            {it.icon != null && <div style={{ color: it.color ?? '#0B2340', flexShrink: 0, lineHeight: 0 }}>{it.icon}</div>}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: it.color ?? '#0B2340', lineHeight: 1.15, marginTop: 3, wordBreak: 'break-word' }}>{it.value}</div>
          {it.valueSub != null && <div style={{ fontSize: 10, fontWeight: 700, color: '#0072CE', marginTop: 2, lineHeight: 1.35 }}>{it.valueSub}</div>}
          {it.sub != null && <div style={{ fontSize: 10, color: '#5B6B80', marginTop: 2, lineHeight: 1.35 }}>{it.sub}</div>}
          {it.badge != null && <div style={{ marginTop: 5 }}>{it.badge}</div>}
        </div>
      ))}
    </div>
  );
}

/** Pil kecil untuk baris badge kartu KPI (gaya badge dashboard, inline supaya
    tercetak sama di PDF/IMAGE). */
export function XPill({ tone, children }: { tone: 'ok' | 'crit' | 'warn' | 'info'; children: React.ReactNode }) {
  const tones = {
    ok: { background: '#E7F8EE', color: '#15803D' },
    crit: { background: '#FDECEC', color: '#DC2626' },
    warn: { background: '#FFF7E0', color: '#B45309' },
    info: { background: '#E8F4FD', color: '#0072CE' },
  } as const;
  return <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, ...tones[tone] }}>{children}</span>;
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

export function XTable({ title, headers, rows, aligns, maxRows = 9, widths, compact }: {
  title?: string;
  headers: string[];
  rows: React.ReactNode[][];
  aligns?: ('left' | 'right' | 'center')[];
  maxRows?: number;
  /** Lebar kolom eksplisit (mis. ['11%','14%',...]); bila diisi, tabel pakai layout fixed
      supaya kolom sempit (tanggal/nama ULTG) tidak terjepit dan terpotong tengah kata. */
  widths?: string[];
  /** Baris rapat (font 10, padding 3px) untuk tabel panjang yang harus muat 1 halaman. */
  compact?: boolean;
}) {
  const shown = rows.slice(0, maxRows);
  return (
    <div>
      {title && <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0B2340', marginBottom: 6 }}>{title}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: compact ? 10 : 11, color: '#0B2340', tableLayout: widths ? 'fixed' : undefined }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ background: '#0B2340', color: '#FFC940', textAlign: aligns?.[i] ?? 'left', padding: compact ? '5px 6px' : '6px 8px', fontSize: 10, letterSpacing: 0.4, width: widths?.[i] }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i} style={{ background: i % 2 ? '#FFFFFF' : '#F0F6FC' }}>
              {r.map((c, j) => (
                <td key={j} style={{ padding: compact ? '2px 6px' : '5px 8px', textAlign: aligns?.[j] ?? 'left', borderBottom: '1px solid #E3ECF5', verticalAlign: 'top', wordBreak: 'break-word' }}>{c}</td>
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
  const { ready, busy, error, openPreview } = useExport();
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn btn-primary" disabled={!ready || busy} onClick={openPreview} title={ready ? 'Lihat preview lalu export ringkasan halaman ini (1 halaman, A4 tegak)' : 'Menunggu data halaman dimuat…'}>
        <FileDown size={15} /> {busy ? 'Membuat…' : 'Export'}
      </button>
      {error && <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 260, zIndex: 50, fontSize: 11, color: '#FF3B3B', background: 'var(--bg2)', border: '1px solid rgba(255,59,59,0.4)', borderRadius: 8, padding: '6px 8px' }}>{error}</div>}
    </div>
  );
}
