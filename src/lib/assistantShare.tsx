// Lembar share 1 jawaban AI Assistant — Fase 3 (rencana-ai-assistant.md §8).
// Satu jawaban = satu lembar A4 tegak 794×1123 px, memakai primitif
// ExportSheet yang sudah ada (XKpis, XSection, XTable) + chrome poster yang
// sama (art header + logo Danantara/UPT/PLN + pita merah #CE1126).
// Isi: Pertanyaan -> Jawaban -> Angka kunci (kartu KPI kecil, dari konteks
// halaman) -> Sumber (sheet/tab + filter aktif + tanggal akses).
// Footer: slogan + "PT PLN (Persero) UPT Bengkulu" + tanggal unduh
// (mengikuti tema bulanan yang sama seperti lembar export lain).
//
// CATATAN ARSITEKTUR — kenapa lembar ini TIDAK memakai <ExportSheet>:
// ExportProvider hanya menyimpan SATU sheet terdaftar. Bila widget memasang
// ExportSheet kedua, sheet itu merebut registrasi halaman (tombol Export
// halaman jadi mengekspor lembar share), dan saat ditutup, cleanup
// ExportSheet mengosongkan registrasi sehingga Export halaman rusak sampai
// navigasi/refresh berikutnya. Karena itu lembar share punya node capture +
// modal preview sendiri (pola yang sama dengan ExportPreview di export.tsx),
// dengan primitif dan chrome yang sama. src/lib/export.tsx TIDAK diubah.
// v1: share PER JAWABAN saja, bukan seluruh percakapan.
import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { EXPORT_W, EXPORT_H, XKpis, XSection, XTable } from './export';
import { themeFor } from './ultgPdf';
import type { AssistantContext } from './assistant';

export interface ShareEntry {
  question: string;
  answer: string;
  sources: string[];
  /** Label halaman, mis. "Pentanahan (NS)". */
  pageLabel: string;
  /** Filter aktif, mis. "Tahun 2026 · ULTG LAHAT" atau "Semua". */
  filterText: string;
  /** Tanggal akses data, YYYY-MM-DD. */
  diakses: string;
  fromFaq: boolean;
  providerLabel?: string;
  /** Konteks halaman saat bertanya (untuk kartu KPI). */
  ctx: AssistantContext | null;
}

const SHEET_FONT = "Inter, 'Plus Jakarta Sans', Arial, sans-serif";
/** Posisi crop art header per bulan — sama dengan ExportSheet (export.tsx). */
const ART_POS: Record<number, string> = { 10: 'center 55%', 11: 'center 62%', 12: 'center 45%' };
/** Jawaban yang sangat panjang dipotong di lembar (aslinya tetap utuh di chat). */
const MAX_ANSWER_CHARS = 2400;

/** Render jawaban: dukung **tebal** (sama seperti balon chat). */
function renderRich(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') && p.length > 4
    ? <b key={i}>{p.slice(2, -2)}</b>
    : <span key={i}>{p}</span>));
}

/** Angka kunci dari konteks halaman — label Indonesia, maks. 3 kartu. */
const KPI_LABELS: Record<string, string> = {
  nko110: 'NKO 110', nko100: 'NKO 100',
  totalDiukur: 'Total diukur', baik: 'BAIK', buruk: 'BURUK',
  belumDiukur: 'Belum diukur', persenRealisasi: '% Realisasi',
  gangguanOpenUpt: 'Gangguan OPEN', openUpt: 'OPEN',
  totalGangguan: 'Total gangguan', total: 'Total', kritis: 'KRITIS',
  totalFoto: 'Total foto', trip: 'Trip', reclose: 'Reclose',
  target: 'Target', sudahDiukurV: 'Sudah diukur (V)',
  belumDiukurX: 'Belum diukur (X)', persenTerukur: '% Terukur',
};
const KPI_ORDER = [
  'nko110', 'nko100', 'totalDiukur', 'baik', 'buruk', 'belumDiukur',
  'persenRealisasi', 'gangguanOpenUpt', 'openUpt', 'totalGangguan',
  'total', 'kritis', 'totalFoto', 'trip', 'reclose',
  'target', 'sudahDiukurV', 'belumDiukurX', 'persenTerukur',
];

export function shareKpis(ctx: AssistantContext | null): { label: string; value: string }[] {
  if (!ctx || typeof ctx.ringkasan !== 'object') return [];
  const out: { label: string; value: string }[] = [];
  for (const key of KPI_ORDER) {
    if (out.length >= 3) break;
    const v = (ctx.ringkasan as Record<string, unknown>)[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const isPct = key.toLowerCase().includes('persen') || key.toLowerCase().includes('pct');
    out.push({
      label: KPI_LABELS[key] ?? key,
      value: isPct
        ? `${v.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`
        : v.toLocaleString('id-ID'),
    });
  }
  return out;
}

/** Perkiraan tinggi blok teks (font ~11,5px, lebar isi ~734px, ~92 karakter/baris). */
function estHeight(text: string): number {
  const lines = Math.max(1, Math.ceil(text.length / 92));
  return Math.min(520, Math.max(48, lines * 17 + 8));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Isi lembar A4 — dipakai 2x: node capture (off-screen) dan salinan preview
    di modal. Salinan preview TIDAK di-capture, jadi transform scale di
    salinan tidak memengaruhi hasil unduhan. */
function ShareSheetInner({ entry, th, artOk, setArtOk }: {
  entry: ShareEntry;
  th: ReturnType<typeof themeFor>;
  artOk: boolean;
  setArtOk: (v: boolean) => void;
}) {
  const now = new Date();
  const kpis = shareKpis(entry.ctx);
  const answer = entry.answer.length > MAX_ANSWER_CHARS
    ? `${entry.answer.slice(0, MAX_ANSWER_CHARS)}… (dipotong — jawaban lengkap ada di chat)`
    : entry.answer;
  const sourceRows: React.ReactNode[][] = [
    ...entry.sources.map((s) => [s, 'Sheet/tab dashboard'] as React.ReactNode[]),
    ['Filter aktif', entry.filterText],
    ['Diakses', entry.diakses],
    ['Dijawab oleh', entry.fromFaq ? 'FAQ terverifikasi' : (entry.providerLabel || 'AI')],
  ];
  return (
    <div style={{ padding: '18px 30px 12px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', fontFamily: SHEET_FONT, color: '#0B2340' }}>
      {/* Header gaya poster — sama dengan ExportSheet (export.tsx). */}
      <div style={{ position: 'relative', height: 96, borderRadius: 10, overflow: 'hidden', background: '#0B2340', flexShrink: 0 }}>
        {artOk && (
          <img src={`/pdf/hdr-${th.month}.jpg`} alt="" onError={() => setArtOk(false)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: ART_POS[th.month] ?? 'center 55%' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(11,35,64,0.08) 0%, rgba(11,35,64,0) 40%, rgba(11,35,64,0.40) 100%)' }} />
        <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '7px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ background: 'rgba(255,255,255,0.82)', borderRadius: 6, padding: '3px 6px', display: 'inline-flex' }}>
              <img src="/pdf/danantara.png" alt="Danantara" style={{ width: 84, height: 21, display: 'block' }} />
            </span>
            <span style={{ background: 'rgba(255,255,255,0.82)', borderRadius: 6, padding: '2px 4px', display: 'inline-flex' }}>
              <img src="/pdf/upt.png" alt="UPT Bengkulu" style={{ width: 32, height: 40, display: 'block' }} />
            </span>
            <span style={{ background: 'rgba(255,255,255,0.82)', borderRadius: 6, padding: '2px 4px', display: 'inline-flex' }}>
              <img src="/pdf/pln.png" alt="PLN" style={{ width: 30, height: 45, display: 'block' }} />
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
            <span style={{ background: '#CE1126', borderRadius: 6, padding: '4px 10px', lineHeight: 1.25, flexShrink: 0 }}>
              <span style={{ display: 'block', color: '#ffffff', fontSize: 10.5, fontWeight: 800 }}>{th.badge.toUpperCase()}</span>
              <span style={{ display: 'block', color: '#FFC940', fontSize: 7, fontWeight: 700 }}>{th.badgeSub.toUpperCase()}</span>
            </span>
            <span style={{ color: '#ffffff', fontSize: 19, fontWeight: 800, textAlign: 'right', lineHeight: 1.15, textShadow: '1px 0 0 #0B2340, -1px 0 0 #0B2340, 0 1px 0 #0B2340, 0 -1px 0 #0B2340, 1px 1px 0 #0B2340, -1px -1px 0 #0B2340, 1px -1px 0 #0B2340, -1px 1px 0 #0B2340' }}>Tanya Data UPT</span>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, color: '#5B6B80' }}>
          {entry.pageLabel} · {entry.filterText} · Diakses {entry.diakses}
        </div>
        <div style={{ height: 3, background: '#FFC940', borderRadius: 2, marginTop: 4, width: 120 }} />
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        <XSection title="Pertanyaan" right={entry.pageLabel} height={estHeight(entry.question)}>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{entry.question}</div>
        </XSection>
        <XSection title="Jawaban" right={entry.fromFaq ? '✓ dari FAQ terverifikasi' : `Powered by ${entry.providerLabel || 'AI'}`} height={estHeight(answer)}>
          <div style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderRich(answer)}</div>
        </XSection>
        {kpis.length > 0 && (
          <XKpis items={kpis.map((k) => ({ label: k.label, value: k.value }))} />
        )}
        <XTable title="Sumber data" headers={['Sumber', 'Keterangan']} rows={sourceRows} widths={['42%', '58%']} />
      </div>
      {/* Footer gaya poster: pita merah + slogan + identitas. */}
      <div style={{ background: '#CE1126', borderRadius: 8, padding: '5px 12px', marginTop: 10, display: 'flex', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
        <div style={{ fontSize: 9, color: '#ffffff', lineHeight: 1.4, maxWidth: 380 }}>
          <b>CATATAN:</b> Jawaban hanya dari data yang tampil di dashboard · Cek sumbernya bila ragu
        </div>
        <div style={{ textAlign: 'right', color: '#ffffff', flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, fontStyle: 'italic' }}>{th.slogan}</div>
          <div style={{ fontSize: 8.5, marginTop: 2, opacity: 0.95 }}>PT PLN (Persero) UPT Bengkulu · plnuptbengkulu.web.id · Diekspor {now.toLocaleString('id-ID')} · 1 dari 1</div>
        </div>
      </div>
    </div>
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Node capture + modal preview untuk 1 jawaban. Dipasang saat pengguna
    mengetuk PDF/IMG di bawah balon jawaban; dilepas saat modal ditutup. */
export default function AssistantShareSheet({ entry, onClose }: { entry: ShareEntry; onClose: () => void }) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artOk, setArtOk] = useState(true);
  const [scale, setScale] = useState(1);
  const th = themeFor(new Date());
  const debugPreview = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('sharePreview');

  useEffect(() => {
    const calc = () => setScale(Math.min(1, (window.innerWidth - 32) / EXPORT_W, (window.innerHeight - 160) / EXPORT_H));
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  // Kunci scroll halaman + tutup dengan Esc selama preview terbuka.
  // stopPropagation: Esc di sini hanya menutup preview, BUKAN panel chat
  // (panel juga punya handler Esc sendiri di window — tanpa ini keduanya
  // tertutup sekaligus).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  async function download(kind: 'pdf' | 'png') {
    if (!nodeRef.current || busy) return;
    setBusy(true); setError(null);
    try {
      // Beri waktu font + gambar header selesai dimuat sebelum capture.
      await document.fonts.ready.catch(() => undefined);
      await sleep(300);
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(nodeRef.current, {
        scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false,
        width: EXPORT_W, height: EXPORT_H,
      });
      const stamp = new Date().toISOString().slice(0, 10);
      const base = `tanya-data-upt_${stamp}`;
      if (kind === 'png') {
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
        if (!blob) throw new Error('Gagal membuat gambar PNG.');
        downloadBlob(blob, `${base}.png`);
      } else {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
        doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 595.28, 841.89);
        doc.save(`${base}.pdf`);
      }
    } catch (e) {
      setError(`Export gagal: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        ref={nodeRef}
        data-assistant-share-sheet
        style={debugPreview
          ? { width: EXPORT_W, height: EXPORT_H, margin: '24px auto', background: '#ffffff', boxShadow: '0 8px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }
          : { position: 'fixed', left: -12000, top: 0, width: EXPORT_W, height: EXPORT_H, overflow: 'hidden', background: '#ffffff' }}
      >
        <ShareSheetInner entry={entry} th={th} artOk={artOk} setArtOk={setArtOk} />
      </div>
      <div data-export-backdrop onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(11,35,64,0.65)', zIndex: 1000 }} />
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1002, background: '#0B2340', color: '#ffffff', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Preview Export — Tanya Data UPT</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Inilah tampilan yang akan diekspor · 1 halaman, A4 tegak · pilih format di kanan</div>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={() => download('pdf')}>{busy ? 'Membuat…' : 'PDF'}</button>
        <button className="btn" disabled={busy} onClick={() => download('png')} style={{ background: '#ffffff', color: '#0B2340' }}>{busy ? 'Membuat…' : 'IMAGE'}</button>
        <button className="btn" onClick={onClose} aria-label="Tutup preview" title="Tutup (Esc)" style={{ background: 'transparent', color: '#ffffff', border: '1px solid rgba(255,255,255,0.5)' }}><X size={16} /></button>
        {error && <div style={{ width: '100%', fontSize: 11, color: '#FF8A8A' }}>{error}</div>}
      </div>
      <div style={{ position: 'fixed', inset: 0, top: 72, zIndex: 1001, overflow: 'auto', padding: '12px 8px 32px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: EXPORT_W * scale, height: EXPORT_H * scale, overflow: 'hidden', flexShrink: 0, boxShadow: '0 8px 40px rgba(0,0,0,0.35)', background: '#ffffff' }}>
          <div style={{ width: EXPORT_W, height: EXPORT_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <ShareSheetInner entry={entry} th={th} artOk={artOk} setArtOk={setArtOk} />
          </div>
        </div>
      </div>
    </>
  );
}
