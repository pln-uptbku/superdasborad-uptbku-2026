import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, ImageOff, X } from 'lucide-react';
import { usePageSources } from '../lib/data';
import { Card, LoadingScreen, PageHeader, Select } from '../components/ui';
import { ExportSheet, XKpis, XSection, XTable } from '../lib/export';

type Folder = { id: string; name: string };
type Photo = { id: string; name: string; bidang: string };
const BULAN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const monthLabel = (n: string) => { const m = n.match(/^(\d{4})\.(\d{2})/); return m ? `${BULAN[+m[2]]} ${m[1]}` : n; };
const title = (n: string) => n.replace(/\.[a-z0-9]+$/i, '').replace(/\s+/g, ' ').trim();
const cap = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(K3|Pdkb|Ultg|Keu)\b/gi, (w) => w.toUpperCase());
const thumb = (id: string, w = 800) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
const ROOT_URL = 'https://drive.google.com/drive/folders/19QVQSmJnXXAu01hJMb7vgvxI3U4bGDlm';

function Img({ id, w, className, alt }: { id: string; w: number; className: string; alt: string }) {
  const [err, setErr] = useState(false);
  if (err) return <div className={`${className} flex items-center justify-center t-muted`} style={{ background: 'rgba(127,140,160,.15)' }}><ImageOff size={28} /></div>;
  return <img src={thumb(id, w)} alt={alt} loading="lazy" referrerPolicy="no-referrer" className={className} onError={() => setErr(true)} />;
}

export default function Galeri() {
  usePageSources([]);
  const [months, setMonths] = useState<Folder[] | null>(null);
  const [month, setMonth] = useState('');
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [bidang, setBidang] = useState('Semua');
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(-1);

  useEffect(() => {
    fetch('/api/galeri').then((r) => r.json()).then((d) => { setMonths(d.months || []); if (d.months?.[0]) setMonth(d.months[0].id); })
      .catch(() => setErr('Daftar folder tidak dapat dimuat.'));
  }, []);
  useEffect(() => {
    if (!month) return;
    setPhotos(null); setBidang('Semua');
    fetch(`/api/galeri?month=${month}`).then((r) => r.json()).then((d) => setPhotos(d.photos || [])).catch(() => setErr('Foto tidak dapat dimuat.'));
  }, [month]);

  const bidangList = useMemo(() => ['Semua', ...[...new Set((photos || []).map((p) => p.bidang))]], [photos]);
  const shown = useMemo(() => (photos || []).filter((p) => bidang === 'Semua' || p.bidang === bidang), [photos, bidang]);
  const curMonth = months?.find((m) => m.id === month);

  useEffect(() => {
    if (open < 0) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(-1);
      if (e.key === 'ArrowRight') setOpen((i) => (i + 1) % shown.length);
      if (e.key === 'ArrowLeft') setOpen((i) => (i - 1 + shown.length) % shown.length);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, shown.length]);

  const p = open >= 0 ? shown[open] : null;
  /* Lembar ringkasan 1 halaman tegak (Export PDF/PNG): foto pilihan + rekap per bidang.
     Thumbnail memakai lh3.googleusercontent.com (CORS: Access-Control-Allow-Origin: *)
     supaya html2canvas bisa menggambarnya; thumb drive.google.com tidak dipakai di sheet. */
  const perBidang = useMemo(() => {
    const m = new Map<string, number>(); shown.forEach((ph) => m.set(cap(ph.bidang), (m.get(cap(ph.bidang)) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [shown]);
  const sheetEl = photos ? (
    <ExportSheet meta={{ title: 'Galeri Kegiatan UPT Bengkulu', subtitle: `Bulan ${curMonth ? monthLabel(curMonth.name) : '—'} · Bidang ${bidang}`, fileBase: `Galeri_UPT_Bengkulu_${curMonth ? curMonth.name : ''}` }}>
      <XKpis items={[
        { label: 'Total Foto', value: String(shown.length), sub: curMonth ? monthLabel(curMonth.name) : '', color: '#0072CE' },
        { label: 'Bidang', value: String(perBidang.length), sub: 'terwakili', color: '#2E7D32' },
        { label: 'Bulan', value: curMonth ? (curMonth.name.match(/^\d{4}\.(\d{2})/)?.[1] ?? '—') : '—', sub: curMonth ? monthLabel(curMonth.name) : '', color: '#F57C00' },
      ]} />
      <XSection title="Foto Pilihan" height={shown.slice(0, 8).length > 4 ? 360 : 320} right={shown.length > 8 ? `+${shown.length - 8} foto lainnya` : undefined}>
        <div className="grid grid-cols-4 gap-2.5">
          {shown.slice(0, 8).map((ph) => (
            <div key={ph.id}>
              <img src={`https://lh3.googleusercontent.com/d/${ph.id}=w400`} crossOrigin="anonymous" alt={title(ph.name)}
                className="w-full rounded-lg object-cover" style={{ height: 200 }} />
              <div className="mt-1 text-[11px] font-semibold leading-tight" style={{ color: '#0b2340' }}>{(() => { const t = title(ph.name); return t.length > 44 ? `${t.slice(0, 44)}…` : t; })()}</div>
              <div className="text-[10px]" style={{ color: '#4b6585' }}>{cap(ph.bidang)}</div>
            </div>
          ))}
        </div>
      </XSection>
      <XTable title="Foto per Bidang" headers={['BIDANG', 'JUMLAH']}
        aligns={['left', 'right']}
        rows={perBidang.map(([b, n]) => [b, String(n)])} />
    </ExportSheet>
  ) : null;
  return (
    <div className="space-y-5">
      <PageHeader title="Galeri Kegiatan UPT Bengkulu" subtitle="Foto otomatis dari Google Drive · Flyer Konten Publikasi UPTBKU"
        right={<a href={ROOT_URL} target="_blank" rel="noopener noreferrer" className="badge" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '8px 14px' }}>Buka folder Drive <ExternalLink size={14} /></a>} />
      <Card className="space-y-4">
        {err && <div className="t-muted">{err}</div>}
        {!months && !err && <LoadingScreen text="Memuat galeri…" />}
        {months && (
          <div className="flex flex-wrap gap-4 items-end">
            <Select label="Bulan" value={month} onChange={setMonth} options={months.map((m) => ({ value: m.id, label: monthLabel(m.name) }))} className="w-56" />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide t-muted mb-1">Bidang</div>
              <div className="flex flex-wrap gap-2">
                {bidangList.map((b) => (
                  <button key={b} onClick={() => setBidang(b)} className="px-3 py-1.5 rounded-full text-sm font-semibold border transition"
                    style={bidang === b ? { background: '#0072CE', color: '#fff', borderColor: '#0072CE' } : { borderColor: 'rgba(127,140,160,.35)' }}>
                    {b === 'Semua' ? b : cap(b)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {months && !photos && !err && <LoadingScreen text="Memuat foto…" />}
        {photos && (
          <>
            <div className="text-sm font-semibold t-muted">{shown.length} foto · {curMonth ? monthLabel(curMonth.name) : ''}</div>
            {shown.length === 0 ? <div className="t-muted py-10 text-center">Belum ada foto untuk pilihan ini.</div> : (
              <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {shown.map((ph, i) => (
                  <button key={ph.id} onClick={() => setOpen(i)} className="text-left group">
                    <div className="relative overflow-hidden rounded-xl">
                      <Img id={ph.id} w={600} alt={title(ph.name)} className="w-full aspect-[4/3] object-cover transition group-hover:scale-105" />
                      <span className="absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#0B2340', color: '#fff' }}>{cap(ph.bidang)}</span>
                    </div>
                    <div className="mt-2 text-sm font-semibold line-clamp-2">{title(ph.name)}</div>
                    <div className="text-xs t-muted">{curMonth ? monthLabel(curMonth.name) : ''}</div>
                  </button>
                ))}
              </div>
            )}
            <div className="text-xs t-muted">Klik foto untuk memperbesar (tombol panah kiri/kanan untuk foto berikutnya).</div>
          </>
        )}
      </Card>
      {sheetEl}
      {p && (
        <div className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4" onClick={() => setOpen(-1)}>
          <button className="absolute top-4 right-4 text-white" onClick={() => setOpen(-1)} aria-label="Tutup"><X size={30} /></button>
          <button className="absolute left-3 text-white p-2" onClick={(e) => { e.stopPropagation(); setOpen((i) => (i - 1 + shown.length) % shown.length); }} aria-label="Sebelumnya"><ChevronLeft size={40} /></button>
          <button className="absolute right-3 text-white p-2" onClick={(e) => { e.stopPropagation(); setOpen((i) => (i + 1) % shown.length); }} aria-label="Berikutnya"><ChevronRight size={40} /></button>
          <div onClick={(e) => e.stopPropagation()} className="max-w-5xl w-full flex flex-col items-center">
            <Img id={p.id} w={1600} alt={title(p.name)} className="max-h-[80vh] max-w-full object-contain rounded-lg" />
            <div className="text-white mt-3 text-center font-semibold">{title(p.name)}</div>
            <div className="text-white/70 text-sm">{cap(p.bidang)} · {curMonth ? monthLabel(curMonth.name) : ''} · {open + 1}/{shown.length} ·{' '}
              <a href={`https://drive.google.com/file/d/${p.id}/view`} target="_blank" rel="noopener noreferrer" className="underline">buka di Drive</a></div>
          </div>
        </div>
      )}
    </div>
  );
}
