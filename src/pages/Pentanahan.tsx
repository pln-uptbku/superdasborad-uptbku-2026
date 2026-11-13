import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PlugZap } from 'lucide-react';
import { PentanahanData, useData, usePageSources, useSource } from '../lib/data';
import { PentanahanChecklistRekap, PentanahanChecklistRow, PentanahanJadwalRow, PentanahanTower, PentanahanYearData } from '../lib/parsers';
import { fmtDate, fmtNum } from '../lib/sheets';
import { Badge, C, Card, ChartCard, Col, ExportButton, Gate, PageHeader, Search, Select, SortableTable, StatCard, Tabs, useChartTheme } from '../components/ui';
import { SimplePie } from '../components/charts';
import { Term } from '../components/Glossary';
import { ExportSheet, XKpis, XNote, XSection, XTable } from '../lib/export';

/**
 * Pentanahan Tower (NEW SRINTAMI) — pengukuran tahanan pentanahan per tower.
 *
 * Aturan Kondisi (SKDIR, Gambar 2-10): tower ujung (5 pertama + 5 terakhir
 * tiap penghantar) ambang 3 Ohm (70/150/275 kV) atau 1 Ohm (500 kV); tower
 * lain 10 Ohm (SPLN). Kondisi dihitung dari Nilai Max + posisi tower,
 * BUKAN dari kolom Kondisi sheet (sheet memakai 10 Ohm rata). Rekap per
 * tower UNIK (duplikat → pengukuran terbaru). Tahun 2024 hanya checklist
 * V/X (tanpa nilai tahanan). Jadwal: minggu diturunkan dari urutan baris
 * per penghantar (baris ke-i = Feb M1 + i minggu) karena sel minggu di
 * sheet masih kosong (CSV tidak membawa warna fill).
 *
 * Target per slice struktural (tahun + ULTG + PHT) — % Realisasi & Belum
 * Diukur mengikuti slice itu (lihat sliceTarget): target(slice) = Σ per
 * penghantar [target_PHT × (terukur PHT di slice / terukur PHT total)].
 * Filter hasil (Kondisi/Alat/Rekomendasi/Terpasang/pencarian) TIDAK mengubah
 * kedua kartu itu — target tidak terbagi menurut hasil/alat.
 */
function sliceTarget(y: PentanahanYearData, ultg: string, pht: string) {
  const inSlice = (t: PentanahanTower) =>
    (ultg === 'Semua' || t.ultg === ultg) && (pht === 'Semua' || t.pht === pht);
  const measured = y.towers.filter(inSlice).length;
  const perPht = new Map<string, { tot: number; in: number }>();
  for (const t of y.towers) {
    const o = perPht.get(t.phtKey) ?? { tot: 0, in: 0 };
    o.tot += 1;
    if (inSlice(t)) o.in += 1;
    perPht.set(t.phtKey, o);
  }
  let target = 0;
  let unalloc = 0;
  const unallocPht: string[] = [];
  for (const r of y.rekap) {
    const o = perPht.get(r.phtKey);
    const mTot = o?.tot ?? 0;
    const mIn = o?.in ?? 0;
    if (mTot > 0) target += (r.target * mIn) / mTot;
    else if (pht === 'Semua' || r.pht === pht) {
      // Penghantar tanpa satu pun tower terukur di tahun ini: targetnya
      // dihitung penuh bila slice tidak membatasi ULTG; bila ULTG dibatasi,
      // targetnya TIDAK dialokasikan (ULTG tower belum terukur tidak dapat
      // ditentukan dari data tahun ini) — dicatat di `unalloc`.
      if (ultg === 'Semua') target += r.target;
      else { unalloc += r.target; unallocPht.push(r.pht); }
    }
  }
  const targetR = Math.round(target);
  return { target: targetR, measured, belum: Math.max(0, targetR - measured), pct: targetR ? (measured / targetR) * 100 : 0, unalloc, unallocPht };
}

export default function Pentanahan() {
  usePageSources(['pentanahan']);
  const s = useSource('pentanahan');
  const { refresh } = useData();
  return <Gate sources={[s]} onRetry={() => refresh(['pentanahan'])} text="Memuat data Pentanahan Tower…">{() => <Body data={s.data!} />}</Gate>;
}

type Tab = 'ringkasan' | 'detail' | 'jadwal';

function Body({ data }: { data: PentanahanData }) {
  const nowY = new Date().getFullYear();
  const defY = data.availableYears.includes(nowY) ? nowY : data.availableYears[0];
  const [year, setYearState] = useState(defY);
  const [tab, setTab] = useState<Tab>('ringkasan');
  const y = data.years[year] ?? null;
  const is2024 = year === 2024 && !y;
  const [f, setF] = useState({ ultg: 'Semua', pht: 'Semua', kondisi: 'Semua', alat: 'Semua', rekomendasi: 'Semua', terpasang: 'Semua', q: '' });
  const set = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));
  /** Ganti tahun: opsi Rekomendasi/Terpasang dihitung dari tahun yang aktif,
      jadi kedua filter itu dikembalikan ke 'Semua' (nilai tahun lama tidak
      boleh nyangkut). Filter lain (ULTG/PHT/Kondisi/Alat) dipertahankan. */
  const changeYear = (yy: number) => { setYearState(yy); setF((o) => ({ ...o, rekomendasi: 'Semua', terpasang: 'Semua' })); };
  /** Cocokkan nilai kolom dengan opsi dropdown: 'Semua' = semua baris,
      '(Kosong)' = nilai kosong di sheet, selain itu nilai persis. */
  const matchOpt = (v: string, sel: string) => sel === 'Semua' || (sel === '(Kosong)' ? v === '' : v === sel);
  const filtered = useMemo(() => {
    if (!y) return [];
    const q = f.q.trim().toLowerCase();
    return y.towers.filter((t) =>
      (f.ultg === 'Semua' || t.ultg === f.ultg) && (f.pht === 'Semua' || t.pht === f.pht) &&
      (f.kondisi === 'Semua' || t.kondisi === f.kondisi) && (f.alat === 'Semua' || t.alat === f.alat) &&
      matchOpt(t.rekomendasi, f.rekomendasi) && matchOpt(t.terpasang, f.terpasang) &&
      (!q || `${t.lokasi} ${t.pht} ${t.rekomendasi} ${t.terpasang} ${t.ultg}`.toLowerCase().includes(q)));
  }, [y, f]);
  /** Opsi dropdown dihitung dari data tower unik tahun yang AKTIF (bukan
      hardcode) — bila 2027 menambah nilai baru (mis. 'MGGS2'), opsi itu
      muncul otomatis. '(Kosong)' hanya muncul bila ada nilai kosong. */
  const distinctOpt = (vals: string[]) => {
    const nonEmpty = [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));
    return vals.some((v) => !v) ? [...nonEmpty, '(Kosong)'] : nonEmpty;
  };
  const opts = useMemo(() => y ? {
    ultg: [...new Set(y.towers.map((t) => t.ultg))].sort(),
    pht: [...new Set(y.towers.map((t) => t.pht))].sort((a, b) => a.localeCompare(b, 'id')),
    alat: [...new Set(y.towers.map((t) => t.alat))].sort(),
    rekomendasi: distinctOpt(y.towers.map((t) => t.rekomendasi)),
    terpasang: distinctOpt(y.towers.map((t) => t.terpasang)),
  } : { ultg: [], pht: [], alat: [], rekomendasi: [], terpasang: [] }, [y]);
  const baikF = filtered.filter((t) => t.kondisi === 'BAIK').length;
  const burukF = filtered.length - baikF;
  /** % Realisasi & Belum Diukur mengikuti slice STRUKTURAL (tahun + ULTG +
      PHT) saja — filter hasil (Kondisi/Alat/Rekomendasi/Terpasang/pencarian)
      tidak mengubah kedua kartu itu (target tidak terbagi menurut hasil). */
  const slice = useMemo(() => (y ? sliceTarget(y, f.ultg, f.pht) : null), [y, f.ultg, f.pht]);
  const sliceLabel = !y ? '' : f.ultg !== 'Semua' && f.pht !== 'Semua' ? `${f.pht} · ${f.ultg}` : f.ultg !== 'Semua' ? f.ultg : f.pht !== 'Semua' ? f.pht : `tahun ${y.year}`;
  const filterActive = f.ultg !== 'Semua' || f.pht !== 'Semua' || f.kondisi !== 'Semua' || f.alat !== 'Semua' || f.rekomendasi !== 'Semua' || f.terpasang !== 'Semua' || f.q.trim() !== '';
  const filterNote = filterActive ? ` · terfilter: ${[f.ultg !== 'Semua' && f.ultg, f.pht !== 'Semua' && f.pht, f.kondisi !== 'Semua' && f.kondisi, f.alat !== 'Semua' && f.alat, f.rekomendasi !== 'Semua' && `Rekomendasi ${f.rekomendasi}`, f.terpasang !== 'Semua' && `Terpasang ${f.terpasang}`, f.q.trim() && `"${f.q.trim()}"`].filter(Boolean).join(' · ')}` : '';
  return (
    <div className="space-y-5">
      <PageHeader
        title={<><Term term="Pentanahan">Pentanahan</Term> Tower <Term term="NS">(NS)</Term></>}
        subtitle={<>Sheet “REKAP PENGUKURAN PENTANAHAN UPT BKU” · Tahun {year}{y ? <> · <b className="t-accent">{fmtNum(y.total)}</b> tower terukur · {fmtNum(y.baik)} BAIK · {fmtNum(y.buruk)} BURUK</> : data.data2024 ? <> · <b className="t-accent">{fmtNum(data.data2024.v)}</b> sudah diukur (V) dari target {fmtNum(data.data2024.target)} tower</> : ''}</>}
        right={
          <div className="flex flex-wrap items-end gap-3">
            <Tabs<string> value={String(year)} onChange={(v) => changeYear(+v)} tabs={data.availableYears.map((yy) => ({ id: String(yy), label: String(yy) }))} />
            <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'ringkasan', label: '📊 Ringkasan' }, { id: 'detail', label: '📋 Detail Pengukuran' }, { id: 'jadwal', label: `🗓️ Jadwal ${year}` }]} />
          </div>
        } />
      {y && (
        <Card>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            <Select label="ULTG" value={f.ultg} onChange={set('ultg')} options={['Semua', ...opts.ultg]} />
            <Select label="Penghantar" value={f.pht} onChange={set('pht')} options={['Semua', ...opts.pht]} />
            <Select label="Kondisi (SKDIR)" value={f.kondisi} onChange={set('kondisi')} options={['Semua', 'BAIK', 'BURUK']} />
            <Select label="Alat" value={f.alat} onChange={set('alat')} options={['Semua', ...opts.alat]} />
            <Select label="Rekomendasi" value={f.rekomendasi} onChange={set('rekomendasi')} options={['Semua', ...opts.rekomendasi]} />
            <Select label="Terpasang" value={f.terpasang} onChange={set('terpasang')} options={['Semua', ...opts.terpasang]} />
            <Search value={f.q} onChange={set('q')} placeholder="Lokasi tower / rekomendasi…" />
            <div className="text-xs t-muted self-end pb-2">Opsi Rekomendasi &amp; Terpasang dihitung dari data tower unik tahun {year} — ganti tahun, opsi ikut berubah.</div>
          </div>
          <div className="text-xs t-muted mt-3">Kondisi dihitung aturan SKDIR (tower ujung 3 Ω, lainnya 10 Ω) — bukan kolom Kondisi sheet. % Realisasi &amp; Belum Diukur mengikuti ULTG/Penghantar yang dipilih: target dialokasikan per penghantar dari sebaran tower terukur penghantar itu (tower belum diukur diasumsikan mengikuti sebaran yang sama); filter Kondisi/Alat/Rekomendasi/Terpasang/pencarian tidak mengubah kedua kartu itu{y.hasRealisasi ? '.' : '; tab REALISASI ' + year + ' belum ada sehingga target ditampilkan —.'}</div>
        </Card>
      )}
      {y && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total Diukur" value={fmtNum(filtered.length)} color={C.cyan} icon={<PlugZap />} sub={`target ${fmtNum(y.target)} tower · ${fmtNum(y.rawRows)} baris ASESMEN`} />
          <StatCard label="BAIK" value={fmtNum(baikF)} color={C.ok} sub={`${filtered.length ? ((baikF / filtered.length) * 100).toFixed(1) : '0'}% dari terukur`} />
          <StatCard label="BURUK" value={fmtNum(burukF)} color={C.crit} sub={`${fmtNum(y.flipped)} di antaranya tower ujung (SKDIR 3 Ω, sheet: BAIK)`} />
          <StatCard label="% Realisasi" value={y.hasRealisasi && slice && slice.target ? `${fmtNum(slice.pct, 1)}%` : '—'} color={C.blue} sub={y.hasRealisasi && slice ? (slice.target ? `${sliceLabel} · terukur ${fmtNum(slice.measured)} / target ${fmtNum(slice.target)}` : `${sliceLabel} · target belum dapat ditentukan (penghantar tanpa pengukuran)`) : `tab REALISASI ${y.year} belum ada`} />
          <StatCard label="Belum Diukur" value={y.hasRealisasi && slice && slice.target ? fmtNum(slice.belum) : '—'} color={C.warn} sub={y.hasRealisasi && slice ? (slice.target ? `${sliceLabel} · target − terukur${slice.unalloc ? ` · + ${fmtNum(slice.unalloc)} tower tanpa pengukuran (${slice.unallocPht.join(', ')}) tidak teralokasi ke ULTG` : ''}` : `${sliceLabel} · target belum dapat ditentukan (penghantar tanpa pengukuran)`) : `tab REALISASI ${y.year} belum ada`} />
        </div>
      )}
      {is2024 && data.data2024 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Target Tower" value={fmtNum(data.data2024.target)} color={C.cyan} icon={<PlugZap />} sub={`${fmtNum(data.data2024.checklistRows)} baris CHECKLIST 2024`} />
          <StatCard label="Sudah Diukur (V)" value={fmtNum(data.data2024.v)} color={C.ok} sub="V = sudah diukur" />
          <StatCard label="Belum Diukur (X)" value={fmtNum(data.data2024.x)} color={C.warn} sub="X = belum diukur" />
          <StatCard label="% Terukur" value={`${fmtNum(data.data2024.pct, 1)}%`} color={C.blue} sub={`V ${fmtNum(data.data2024.v)} / target ${fmtNum(data.data2024.target)}`} />
        </div>
      )}
      {tab === 'ringkasan' && y && <Ringkasan y={y} towers={filtered} filterActive={filterActive} />}
      {tab === 'ringkasan' && is2024 && data.data2024 && <Ringkasan2024 d={data.data2024} />}
      {tab === 'detail' && y && <DetailTable towers={filtered} />}
      {tab === 'detail' && is2024 && data.data2024 && <Detail2024 d={data.data2024} />}
      {tab === 'jadwal' && <JadwalTab data={data} year={year} />}

      {/* Lembar ringkasan 1 halaman tegak (Export PDF/PNG) — off-screen, lihat src/lib/export.tsx */}
      {y && slice && <ExportSheetYear y={y} towers={filtered} baik={baikF} buruk={burukF} filterNote={filterNote} slice={slice} sliceLabel={sliceLabel} />}
      {is2024 && data.data2024 && <ExportSheet2024 d={data.data2024} />}
    </div>
  );
}

function Ringkasan({ y, towers, filterActive }: { y: PentanahanYearData; towers: PentanahanTower[]; filterActive: boolean }) {
  const t = useChartTheme();
  const rekap = useMemo(() => {
    const agg = new Map<string, { terukur: number; baik: number; buruk: number; maxNilai: number | null }>();
    for (const tw of towers) {
      const o = agg.get(tw.phtKey) ?? { terukur: 0, baik: 0, buruk: 0, maxNilai: null as number | null };
      o.terukur += 1;
      if (tw.kondisi === 'BAIK') o.baik += 1; else o.buruk += 1;
      if (tw.nilaiMax != null) o.maxNilai = o.maxNilai == null ? tw.nilaiMax : Math.max(o.maxNilai, tw.nilaiMax);
      agg.set(tw.phtKey, o);
    }
    return y.rekap.map((r) => {
      const a = agg.get(r.phtKey);
      if (!a) return { ...r, terukur: 0, baik: 0, buruk: 0, pct: 0, maxNilai: null };
      return { ...r, terukur: a.terukur, baik: a.baik, buruk: a.buruk, pct: r.target ? (a.terukur / r.target) * 100 : null, maxNilai: a.maxNilai };
    }).sort((a, b) => b.buruk - a.buruk || b.terukur - a.terukur);
  }, [y, towers]);
  const burukTop = useMemo(() => [...towers].filter((tw) => tw.kondisi === 'BURUK').sort((a, b) => (b.nilaiMax ?? 0) - (a.nilaiMax ?? 0)).slice(0, 15), [towers]);
  const barData = useMemo(() => [...rekap].sort((a, b) => b.terukur - a.terukur), [rekap]);
  const axis = { tick: { fill: t.axis, fontSize: 10 } };
  const rekapCols: Col<(typeof rekap)[number]>[] = [
    { key: 'pht', label: 'PENGHANTAR', value: (r) => r.pht },
    { key: 'pj', label: 'PENANGGUNG JAWAB', value: (r) => r.pj },
    { key: 'target', label: 'TARGET', value: (r) => r.target, render: (r) => fmtNum(r.target), align: 'right' },
    { key: 'terukur', label: 'TERUKUR', value: (r) => r.terukur, render: (r) => <b>{fmtNum(r.terukur)}</b>, align: 'right' },
    { key: 'baik', label: 'BAIK', value: (r) => r.baik, render: (r) => <span style={{ color: C.ok, fontWeight: 700 }}>{fmtNum(r.baik)}</span>, align: 'right' },
    { key: 'buruk', label: 'BURUK', value: (r) => r.buruk, render: (r) => <span style={{ color: r.buruk ? C.crit : undefined, fontWeight: r.buruk ? 700 : 400 }}>{fmtNum(r.buruk)}</span>, align: 'right' },
    { key: 'pct', label: '% REALISASI', value: (r) => r.pct, render: (r) => (r.pct == null ? '—' : `${fmtNum(r.pct, 1)}%`), align: 'right' },
    { key: 'maxNilai', label: 'NILAI MAX TERTINGGI (Ω)', value: (r) => r.maxNilai, render: (r) => fmtNum(r.maxNilai, 2), align: 'right' },
  ];
  const burukCols: Col<PentanahanTower>[] = [
    { key: 'lokasi', label: 'LOKASI', value: (r) => r.lokasi, className: 'min-w-[260px]' },
    { key: 'pht', label: 'PENGHANTAR', value: (r) => r.pht },
    { key: 'ultg', label: 'ULTG', value: (r) => r.ultg },
    { key: 'tanggal', label: 'TANGGAL', value: (r) => r.tanggal, render: (r) => fmtDate(r.tanggal) },
    { key: 'nilaiMax', label: 'NILAI MAX (Ω)', value: (r) => r.nilaiMax, render: (r) => <b style={{ color: C.crit }}>{fmtNum(r.nilaiMax, 2)}</b>, align: 'right' },
    { key: 'ambang', label: 'AMBANG (Ω)', value: (r) => r.ambang, render: (r) => `${r.ambang} Ω${r.ujung ? ' *' : ''}`, align: 'right' },
    { key: 'rekomendasi', label: 'REKOMENDASI', value: (r) => r.rekomendasi },
    { key: 'terpasang', label: 'TERPASANG', value: (r) => r.terpasang },
  ];
  const outlier = useMemo(() => towers.filter((tw) => tw.nilaiMax != null && tw.nilaiMax > 1000).sort((a, b) => (b.nilaiMax ?? 0) - (a.nilaiMax ?? 0))[0], [towers]);
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        <ChartCard title="1. Kondisi Tower (SKDIR)">
          <SimplePie data={[{ name: 'BAIK', value: towers.filter((tw) => tw.kondisi === 'BAIK').length }, { name: 'BURUK', value: towers.filter((tw) => tw.kondisi === 'BURUK').length }]} colors={{ BAIK: C.ok, BURUK: C.crit }} />
        </ChartCard>
        <ChartCard title="2. Terukur & BURUK per Bulan" height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={y.months} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="label" {...axis} />
              <YAxis {...axis} tickFormatter={(v) => fmtNum(v)} />
              <Tooltip {...t.tooltip} formatter={(v: number, n: string) => [fmtNum(v), n === 'total' ? 'Terukur' : 'BURUK']} />
              <Legend formatter={(v) => <span style={{ color: t.legend.color }}>{v === 'total' ? 'Terukur' : 'BURUK'}</span>} />
              <Bar dataKey="total" fill={C.blue} radius={[4, 4, 0, 0]} />
              <Bar dataKey="buruk" fill={C.crit} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="3. BAIK vs BURUK per Penghantar" height={420} className="lg:col-span-2 xl:col-span-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={t.grid} horizontal={false} />
              <XAxis type="number" {...axis} tickFormatter={(v) => fmtNum(v)} />
              <YAxis type="category" dataKey="pht" width={110} {...axis} />
              <Tooltip {...t.tooltip} formatter={(v: number, n: string) => [fmtNum(v), n]} />
              <Legend formatter={(v) => <span style={{ color: t.legend.color }}>{v}</span>} />
              <Bar dataKey="baik" stackId="a" fill={C.ok} name="BAIK" />
              <Bar dataKey="buruk" stackId="a" fill={C.crit} name="BURUK" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <Card>
        <h3 className="h-section mb-3">Rekap per Penghantar{filterActive ? ' (terfilter)' : ''}</h3>
        <SortableTable rows={rekap} cols={rekapCols} />
        <div className="text-xs t-muted mt-3">
          {y.hasRealisasi ? <>Target &amp; penanggung jawab dari tab REALISASI {y.year}; Terukur/BAIK/BURUK dihitung dari ASESMEN (tower unik, Kondisi SKDIR).</> : <>Tab REALISASI {y.year} belum ada — target &amp; penanggung jawab belum tersedia; Terukur/BAIK/BURUK dihitung dari ASESMEN (tower unik, Kondisi SKDIR).</>}
          {y.missingRekap.length > 0 && <> Penghantar di REALISASI tanpa baris ASESMEN {y.year}: {y.missingRekap.join(', ')} (terukur 0).</>}
          {y.sheetTotal && <> Total sheet REALISASI: target {fmtNum(y.sheetTotal.target)} · BAIK {fmtNum(y.sheetTotal.baik)} · BURUK {fmtNum(y.sheetTotal.buruk)} ({y.sheetTotal.pct}) — BAIK/BURUK sheet memakai 10 Ω rata, sehingga berbeda {fmtNum(y.flipped)} tower dari hitungan SKDIR.</>}
        </div>
      </Card>
      <Card>
        <h3 className="h-section mb-3">BURUK Prioritas — Nilai Max Tertinggi</h3>
        <SortableTable rows={burukTop} cols={burukCols} />
        <div className="text-xs t-muted mt-3">
          * Ambang 3 Ω = tower ujung (5 pertama / 5 terakhir tiap penghantar, SKDIR Gambar 2-10); tower lain 10 Ω (SPLN).
          {outlier && <> Catatan kualitas data: {outlier.lokasi} — Nilai Max {fmtNum(outlier.nilaiMax, 2)} Ω, padahal Leg A–D {fmtNum(outlier.legA, 1)}/{fmtNum(outlier.legB, 1)}/{fmtNum(outlier.legC, 1)}/{fmtNum(outlier.legD, 1)} Ω — kemungkinan salah ketik di sheet; nilai ditampilkan apa adanya, status tetap BURUK.</>}
        </div>
      </Card>
    </>
  );
}

function Ringkasan2024({ d }: { d: import('../lib/parsers').PentanahanData2024 }) {
  const cols: Col<PentanahanChecklistRekap>[] = [
    { key: 'pht', label: 'PENGHANTAR', value: (r) => r.pht },
    { key: 'pj', label: 'PENANGGUNG JAWAB', value: (r) => r.pj },
    { key: 'target', label: 'TARGET', value: (r) => r.target, render: (r) => fmtNum(r.target), align: 'right' },
    { key: 'v', label: 'SUDAH DIUKUR (V)', value: (r) => r.v, render: (r) => <span style={{ color: C.ok, fontWeight: 700 }}>{fmtNum(r.v)}</span>, align: 'right' },
    { key: 'x', label: 'BELUM DIUKUR (X)', value: (r) => r.x, render: (r) => fmtNum(r.x), align: 'right' },
    { key: 'pct', label: '% TERUKUR', value: (r) => r.pct, render: (r) => (r.pct == null ? '—' : `${fmtNum(r.pct, 1)}%`), align: 'right' },
    { key: 'kendala', label: 'KENDALA', value: (r) => r.kendala },
  ];
  return (
    <Card>
      <h3 className="h-section mb-3">Rekap Checklist 2024 per Penghantar</h3>
      <SortableTable rows={d.rekap} cols={cols} />
      <div className="text-xs t-muted mt-3">
        Tahun 2024 tidak ada nilai tahanan — V = sudah diukur, X = belum diukur (sesuai database). Target &amp; penanggung jawab dari tab REALISASI 2024; V/X dihitung dari tab CHECKLIST 2024 (per tower).
        {d.mismatch.length > 0 && <> Selisih data: {d.mismatch.join('; ')}.</>}
      </div>
    </Card>
  );
}

function DetailTable({ towers }: { towers: PentanahanTower[] }) {
  const cols: Col<PentanahanTower>[] = [
    { key: 'pht', label: 'PENGHANTAR', value: (r) => r.pht },
    { key: 'lokasi', label: 'LOKASI', value: (r) => r.lokasi, className: 'min-w-[280px]' },
    { key: 'tanggal', label: 'TANGGAL', value: (r) => r.tanggal, render: (r) => fmtDate(r.tanggal) },
    { key: 'ultg', label: 'ULTG', value: (r) => r.ultg },
    { key: 'alat', label: 'ALAT', value: (r) => r.alat },
    { key: 'legA', label: 'LEG A (Ω)', value: (r) => r.legA, render: (r) => fmtNum(r.legA, 1), align: 'right' },
    { key: 'legB', label: 'LEG B (Ω)', value: (r) => r.legB, render: (r) => fmtNum(r.legB, 1), align: 'right' },
    { key: 'legC', label: 'LEG C (Ω)', value: (r) => r.legC, render: (r) => fmtNum(r.legC, 1), align: 'right' },
    { key: 'legD', label: 'LEG D (Ω)', value: (r) => r.legD, render: (r) => fmtNum(r.legD, 1), align: 'right' },
    { key: 'nilaiMax', label: 'NILAI MAX (Ω)', value: (r) => r.nilaiMax, render: (r) => <b>{fmtNum(r.nilaiMax, 2)}</b>, align: 'right' },
    { key: 'ambang', label: 'AMBANG (Ω)', value: (r) => r.ambang, render: (r) => `${r.ambang} Ω${r.ujung ? ' *' : ''}`, align: 'right' },
    { key: 'kondisi', label: 'KONDISI (SKDIR)', value: (r) => r.kondisi, render: (r) => <Badge status={r.kondisi} /> },
    { key: 'rekomendasi', label: 'REKOMENDASI', value: (r) => r.rekomendasi },
    { key: 'terpasang', label: 'TERPASANG', value: (r) => r.terpasang },
  ];
  return (
    <Card>
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <h3 className="h-section">Detail Pengukuran ({fmtNum(towers.length)} tower unik)</h3>
        <ExportButton title="Detail Pentanahan Tower" subtitle="ASESMEN PENTANAHAN (terfilter, tower unik, Kondisi SKDIR)" cols={cols} rows={towers} />
      </div>
      <SortableTable rows={towers} cols={cols} pageSize={50} maxHeight={620} />
      <div className="text-xs t-muted mt-3">* Ambang 3 Ω = tower ujung (5 pertama / 5 terakhir tiap penghantar, SKDIR Gambar 2-10); tower lain 10 Ω (SPLN). Satu tower yang tercatat 2x di ASESMEN hanya dihitung 1x (pengukuran terbaru). Kolom Direct/Pspt/Dalam/Luar Gr tidak ditampilkan (hampir kosong di sheet).</div>
    </Card>
  );
}

function Detail2024({ d }: { d: import('../lib/parsers').PentanahanData2024 }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return d.rows.filter((r) => !s || `${r.pht} ${r.tower}`.toLowerCase().includes(s));
  }, [d.rows, q]);
  const cols: Col<PentanahanChecklistRow>[] = [
    { key: 'pht', label: 'PENGHANTAR', value: (r) => r.pht },
    { key: 'tower', label: 'TOWER', value: (r) => r.tower, className: 'min-w-[280px]' },
    { key: 'status', label: 'CHECKLIST', value: (r) => r.status, render: (r) => r.status === 'V'
      ? <span className="badge badge-ok">V — Sudah diukur</span>
      : <span className="badge badge-warn">X — Belum diukur</span> },
  ];
  return (
    <Card>
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <h3 className="h-section">Detail Checklist 2024 ({fmtNum(rows.length)} tower)</h3>
        <div className="w-[280px]"><Search value={q} onChange={setQ} placeholder="Penghantar / tower…" /></div>
      </div>
      <SortableTable rows={rows} cols={cols} pageSize={50} maxHeight={620} />
    </Card>
  );
}

function JadwalTab({ data, year }: { data: PentanahanData; year: number }) {
  const [f, setF] = useState({ ultg: 'Semua', pht: 'Semua', q: '' });
  const set = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));
  const rowsAll = useMemo(() => data.jadwal.filter((r) => r.year === year), [data.jadwal, year]);
  const opts = useMemo(() => ({
    ultg: [...new Set(rowsAll.map((r) => r.ultg))].sort(),
    pht: [...new Set(rowsAll.map((r) => r.pht))].sort((a, b) => a.localeCompare(b, 'id')),
  }), [rowsAll]);
  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return rowsAll.filter((r) =>
      (f.ultg === 'Semua' || r.ultg === f.ultg) && (f.pht === 'Semua' || r.pht === f.pht) &&
      (!q || `${r.pht} ${r.range} ${r.label}`.toLowerCase().includes(q)));
  }, [rowsAll, f]);
  const cols: Col<PentanahanJadwalRow>[] = [
    { key: 'ultg', label: 'ULTG', value: (r) => r.ultg },
    { key: 'pht', label: 'PENGHANTAR', value: (r) => r.pht },
    { key: 'range', label: 'RENTANG TOWER', value: (r) => r.range, render: (r) => `${r.start}–${r.end} (${r.end - r.start + 1} tower)` },
    { key: 'label', label: 'MINGGU PELAKSANAAN', value: (r) => r.label, render: (r) => <b>{r.label}</b> },
    { key: 'bulan', label: 'BULAN', value: (r) => r.bulan },
  ];
  if (!data.jadwalYears.includes(year)) {
    return (
      <Card>
        <div className="h-title">Jadwal hanya tersedia untuk {data.jadwalYears.length ? data.jadwalYears.join(', ') : '—'}</div>
        <div className="text-sm t-muted mt-2">Tab JADWAL di sheet hanya berisi rencana tahun {data.jadwalYears.length ? data.jadwalYears.join(', ') : '—'} (ULTG PEKALONGAN &amp; LAHAT). Pilih tahun tersebut di atas untuk melihat jadwal mingguan.</div>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Select label="ULTG" value={f.ultg} onChange={set('ultg')} options={['Semua', ...opts.ultg]} />
          <Select label="Penghantar" value={f.pht} onChange={set('pht')} options={['Semua', ...opts.pht]} />
          <Search value={f.q} onChange={set('q')} placeholder="Penghantar / rentang / minggu…" />
          <div className="text-xs t-muted self-end pb-2">{fmtNum(rows.length)} rentang tower · {fmtNum(rowsAll.length)} total tahun {year}</div>
        </div>
        <div className="text-xs t-muted mt-3">
          Minggu diturunkan dari urutan baris per penghantar (baris ke-i = Feb M1 + i minggu; tiap penghantar mulai Feb M1, +1 minggu/baris — pola terverifikasi 291/291 baris dari warna fill di export XLSX). Sel minggu di sheet masih kosong (CSV tidak membawa warna), dan blok REALISASI masih kosong — jadi yang tampil baru minggu TARGET.
          {data.jadwalWarnings.length > 0 && <> Peringatan: {data.jadwalWarnings.join(' ')}</>}
        </div>
      </Card>
      <Card>
        <h3 className="h-section mb-3">Jadwal Pelaksanaan {year} per Rentang Tower</h3>
        <SortableTable rows={rows} cols={cols} pageSize={50} maxHeight={620} />
      </Card>
    </div>
  );
}

/* ---------------- lembar export 1 halaman ---------------- */

function ExportSheetYear({ y, towers, baik, buruk, filterNote, slice, sliceLabel }: { y: PentanahanYearData; towers: PentanahanTower[]; baik: number; buruk: number; filterNote: string; slice: ReturnType<typeof sliceTarget>; sliceLabel: string }) {
  const rekap = useMemo(() => {
    const agg = new Map<string, { terukur: number; baik: number; buruk: number; maxNilai: number | null }>();
    for (const tw of towers) {
      const o = agg.get(tw.phtKey) ?? { terukur: 0, baik: 0, buruk: 0, maxNilai: null as number | null };
      o.terukur += 1;
      if (tw.kondisi === 'BAIK') o.baik += 1; else o.buruk += 1;
      if (tw.nilaiMax != null) o.maxNilai = o.maxNilai == null ? tw.nilaiMax : Math.max(o.maxNilai, tw.nilaiMax);
      agg.set(tw.phtKey, o);
    }
    return y.rekap.map((r) => {
      const a = agg.get(r.phtKey);
      if (!a) return { ...r, terukur: 0, baik: 0, buruk: 0, pct: 0, maxNilai: null };
      return { ...r, terukur: a.terukur, baik: a.baik, buruk: a.buruk, pct: r.target ? (a.terukur / r.target) * 100 : null, maxNilai: a.maxNilai };
    }).sort((a, b) => b.buruk - a.buruk || b.terukur - a.terukur);
  }, [y, towers]);
  const burukTop = useMemo(() => [...towers].filter((tw) => tw.kondisi === 'BURUK').sort((a, b) => (b.nilaiMax ?? 0) - (a.nilaiMax ?? 0)).slice(0, 5), [towers]);
  const outlier = useMemo(() => towers.filter((tw) => tw.nilaiMax != null && tw.nilaiMax > 1000).sort((a, b) => (b.nilaiMax ?? 0) - (a.nilaiMax ?? 0))[0], [towers]);
  return (
    <ExportSheet meta={{ title: 'Pentanahan Tower', subtitle: `Tahun ${y.year} · ${fmtNum(towers.length)} tower terukur · ${fmtNum(baik)} BAIK · ${fmtNum(buruk)} BURUK${filterNote}`, fileBase: `Pentanahan_Tower_${y.year}` }}>
      <XKpis items={[
        { label: 'Total Diukur', value: fmtNum(towers.length), sub: y.hasRealisasi ? `target ${fmtNum(y.target)} tower` : 'target belum tersedia', color: C.cyan },
        { label: 'BAIK', value: fmtNum(baik), sub: 'Kondisi SKDIR', color: C.ok },
        { label: 'BURUK', value: fmtNum(buruk), sub: `${fmtNum(y.flipped)} tower ujung (3 Ω)`, color: C.crit },
        { label: '% Realisasi', value: y.hasRealisasi && slice.target ? `${fmtNum(slice.pct, 1)}%` : '—', sub: `${sliceLabel} · ${fmtNum(slice.measured)}/${fmtNum(slice.target)}`, color: C.blue },
        { label: 'Belum Diukur', value: y.hasRealisasi && slice.target ? fmtNum(slice.belum) : '—', sub: `${sliceLabel} · target − terukur`, color: C.warn },
      ]} />
      <XSection title="Kondisi Tower (SKDIR)" height={160}>
        <SimplePie data={[{ name: 'BAIK', value: baik }, { name: 'BURUK', value: buruk }]} colors={{ BAIK: C.ok, BURUK: C.crit }} />
      </XSection>
      <XTable title="Rekap per Penghantar" headers={['PENGHANTAR', 'TARGET', 'TERUKUR', 'BAIK', 'BURUK', '%', 'MAX (Ω)']}
        aligns={['left', 'right', 'right', 'right', 'right', 'right', 'right']}
        rows={rekap.map((r) => [r.pht, fmtNum(r.target), fmtNum(r.terukur), fmtNum(r.baik), fmtNum(r.buruk), r.pct == null ? '—' : `${fmtNum(r.pct, 1)}%`, fmtNum(r.maxNilai, 2)])}
        maxRows={12} compact />
      <XTable title="BURUK Tertinggi" headers={['LOKASI', 'NILAI MAX (Ω)', 'AMBANG (Ω)', 'REKOMENDASI']}
        aligns={['left', 'right', 'right', 'left']}
        rows={burukTop.map((tw) => [tw.lokasi, fmtNum(tw.nilaiMax, 2), `${tw.ambang} Ω`, tw.rekomendasi || '—'])}
        maxRows={5} compact />
      <XNote>
        Kondisi dihitung aturan SKDIR Gambar 2-10 (tower ujung 5 pertama/terakhir: 3 Ω; lainnya 10 Ω) — bukan kolom Kondisi sheet (10 Ω rata). {fmtNum(y.flipped)} tower berubah BAIK→BURUK vs sheet.
        % Realisasi &amp; Belum Diukur mengikuti ULTG/Penghantar yang dipilih (target dialokasikan per penghantar dari sebaran tower terukur).
        {outlier && <> Catatan data: {outlier.lokasi} Nilai Max {fmtNum(outlier.nilaiMax, 2)} Ω (Leg A–D {fmtNum(outlier.legA, 1)}–{fmtNum(outlier.legD, 1)} Ω) — kemungkinan salah ketik, ditampilkan apa adanya.</>}
      </XNote>
    </ExportSheet>
  );
}

function ExportSheet2024({ d }: { d: import('../lib/parsers').PentanahanData2024 }) {
  return (
    <ExportSheet meta={{ title: 'Pentanahan Tower', subtitle: `Tahun 2024 · ${fmtNum(d.v)} sudah diukur (V) dari target ${fmtNum(d.target)} tower`, fileBase: 'Pentanahan_Tower_2024' }}>
      <XKpis items={[
        { label: 'Target Tower', value: fmtNum(d.target), sub: `${fmtNum(d.checklistRows)} baris CHECKLIST`, color: C.cyan },
        { label: 'Sudah Diukur (V)', value: fmtNum(d.v), sub: 'V = sudah diukur', color: C.ok },
        { label: 'Belum Diukur (X)', value: fmtNum(d.x), sub: 'X = belum diukur', color: C.warn },
        { label: '% Terukur', value: `${fmtNum(d.pct, 1)}%`, sub: `V / target`, color: C.blue },
      ]} />
      <XTable title="Rekap Checklist 2024 per Penghantar" headers={['PENGHANTAR', 'TARGET', 'V', 'X', '% TERUKUR', 'KENDALA']}
        aligns={['left', 'right', 'right', 'right', 'right', 'left']}
        rows={d.rekap.map((r) => [r.pht, fmtNum(r.target), fmtNum(r.v), fmtNum(r.x), r.pct == null ? '—' : `${fmtNum(r.pct, 1)}%`, r.kendala || '—'])}
        maxRows={14} compact />
      <XNote>
        Tahun 2024 tidak ada nilai tahanan — V = sudah diukur, X = belum diukur (sesuai database). Target &amp; penanggung jawab dari tab REALISASI 2024; V/X dihitung dari tab CHECKLIST 2024 (per tower).
        {d.mismatch.length > 0 && <> Selisih data: {d.mismatch.join('; ')}.</>}
      </XNote>
    </ExportSheet>
  );
}
