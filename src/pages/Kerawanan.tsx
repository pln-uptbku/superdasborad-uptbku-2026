import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { KerawananData, useData, usePageSources, useSource } from '../lib/data';
import { KerawananRow } from '../lib/parsers';
import { fmtNum, num, num0 } from '../lib/sheets';
import { Badge, C, Card, ChartCard, Col, ExportButton, Gate, LIGHT_CHART_THEME, PageHeader, Search, Select, SortableTable, StatCard, Tabs, groupSum, uniq, useChartTheme } from '../components/ui';
import { SimplePie } from '../components/charts';
import { ExportSheet, XKpis, XSection, XTable } from '../lib/export';

const K = {
  petir: 'DATA GANGGUAN|PETIR', temuanPetir: 'DATA GANGGUAN|TEMUAN PETIR', hewan: 'DATA GANGGUAN|HEWAN', temuanHewan: 'DATA GANGGUAN|TEMUAN', pohon: 'DATA GANGGUAN|POHON',
  ab: (s: string) => `REALISASI PEMASANGAN ANTI BINATANG|${s}`,
  rawan: 'PETA KERAWANAN|ADA / TIDAK', rBinatang: 'PETA KERAWANAN|KERAWANAN BINATANG', rSosial: 'PETA KERAWANAN|KERAWANAN SOSIAL', rLingk: 'PETA KERAWANAN|KERAWANAN LINGKUNGAN', rNilai: 'PETA KERAWANAN|NILAI ASESMEN LINGKUNGAN',
  anomali: 'ANOMALI DARI NEW SRINTAMI|ANOMALI', anomKet: 'ANOMALI DARI NEW SRINTAMI|KETERANGAN', stTower: 'ANOMALI DARI NEW SRINTAMI|STATUS TOWER', stSpan: 'ANOMALI DARI NEW SRINTAMI|STATUS SPAN',
  sambar: (y: string) => `JUMLAH SAMBARAN PETIR|${y}`, kaMax: 'DATA PETIR|MAX KA PETIR 2022-2026', kaMin: 'DATA PETIR|MIN KA PETIR 2022-2026',
  pp: (s: string) => `PROTEKSI PETIR TERPASANG|${s}`,
  pt: (y: string, s: string) => `PENTANAHAN ${y}|${s}`,
  drone: 'INSPEKSI LIDAR|INSPEKSI DRONE', lipo: 'INSPEKSI LIDAR|LAPORAN LIPO', validasi: 'INSPEKSI LIDAR|VALIDASI LAPANGAN',
};
const AB_TYPES = ['TOP SKOR', 'KAWAT SILET', 'PELAKOR', 'BOLUVES', 'JARING', 'AURA DARAH', 'GREASE'];
const PP_TYPES = ['MRG', 'MGGS', 'DGS', 'MDG', 'POLYMER L1', 'POLYMER L2', 'TLA L1', 'TLA L2', 'CLEANING ISOLATOR'];
const YEARS = ['2022', '2023', '2024', '2025', '2026'];
const has = (v: string) => !!v && !v.startsWith('#') && v !== '-' && v.toUpperCase() !== 'FALSE' && v !== '0';

type TabId = 'gangguan' | 'anti' | 'peta' | 'anomali' | 'petir' | 'proteksi' | 'pentanahan' | 'lidar' | 'cek';
const TABS: { id: TabId; label: string }[] = [
  { id: 'gangguan', label: '1. Data Gangguan' }, { id: 'anti', label: '2. Anti Binatang' }, { id: 'peta', label: '3. Peta Kerawanan' },
  { id: 'anomali', label: '4. Anomali dari NS' }, { id: 'petir', label: '5. Data Petir' }, { id: 'proteksi', label: '6. Proteksi Petir' },
  { id: 'pentanahan', label: '7. Pentanahan 2025/2026' }, { id: 'lidar', label: '8. Inspeksi LiDAR' }, { id: 'cek', label: '⚠ Ketidaksesuaian' },
];

export default function Kerawanan() {
  usePageSources(['kerawanan']);
  const s = useSource('kerawanan');
  const { refresh } = useData();
  return <Gate sources={[s]} onRetry={() => refresh(['kerawanan'])} text="Memuat Kerawanan Transmisi…">{() => <Body data={s.data!} />}</Gate>;
}

const baseCols: Col<KerawananRow>[] = [
  { key: 'no', label: 'NO', value: (r) => +r.no },
  { key: 'ultg', label: 'ULTG', value: (r) => r.ultg },
  { key: 'pht', label: 'PHT', value: (r) => r.pht, className: 'min-w-[180px]' },
  { key: 'tower', label: 'TOWER', value: (r) => r.tower.replace(/^TOWER\s+/i, ''), className: 'min-w-[200px]' },
];
const colOf = (key: string, label: string, opts: Partial<Col<KerawananRow>> = {}): Col<KerawananRow> => ({ key, label, value: (r) => r.get(key), ...opts });
const numCol = (key: string, label: string): Col<KerawananRow> => ({ key, label, value: (r) => num(r.get(key)), render: (r) => fmtNum(num(r.get(key)), Number.isInteger(num(r.get(key)) ?? 0) ? 0 : 2), align: 'right' });

function Body({ data }: { data: KerawananData }) {
  const t = useChartTheme();
  const [tab, setTab] = useState<TabId>('gangguan');
  const [g, setG] = useState({ ultg: 'Semua', pht: 'Semua', q: '' });
  const [tf, setTf] = useState<Record<string, string>>({});
  const tset = (k: string) => (v: string) => setTf((o) => ({ ...o, [`${tab}.${k}`]: v }));
  const tv = (k: string, d = 'Semua') => tf[`${tab}.${k}`] ?? d;
  const phts = uniq(data.rows.filter((r) => g.ultg === 'Semua' || r.ultg === g.ultg).map((r) => r.pht));
  const scoped = useMemo(() => {
    const q = g.q.trim().toLowerCase();
    return data.rows.filter((r) => (g.ultg === 'Semua' || r.ultg === g.ultg) && (g.pht === 'Semua' || r.pht === g.pht) && (!q || r.tower.toLowerCase().includes(q) || r.span.toLowerCase().includes(q)));
  }, [data.rows, g]);
  /* Lembar ringkasan 1 halaman tegak (Export PDF/PNG) — gambaran umum, tidak tergantung tab aktif. */
  const sheetData = useMemo(() => {
    const rawan = scoped.filter((r) => r.get(K.rawan).toUpperCase() === 'TRUE');
    const petir = scoped.filter((r) => has(r.get(K.petir)) || has(r.get(K.temuanPetir)));
    const hewan = scoped.filter((r) => has(r.get(K.hewan)));
    const pohon = scoped.filter((r) => has(r.get(K.pohon)));
    const kritis = scoped.filter((r) => r.get(K.stTower) === 'KRITIS MAYOR');
    const perPht = groupSum(scoped, (r) => r.pht);
    return { rawan, petir, hewan, pohon, kritis, perPht };
  }, [scoped]);
  const sheetEl = (
    <ExportSheet meta={{ title: 'Kerawanan Transmisi', subtitle: 'Sheet “SELURUH DATA” · ringkasan per tower UPT Bengkulu', fileBase: 'Kerawanan_Transmisi' }}>
      <XKpis items={[
        { label: 'Total Tower', value: fmtNum(scoped.length), sub: 'terfilter', color: C.cyan },
        { label: 'Tower Rawan', value: fmtNum(sheetData.rawan.length), sub: `${scoped.length ? ((sheetData.rawan.length / scoped.length) * 100).toFixed(1) : '0'}%`, color: C.crit },
        { label: 'Gangguan Petir', value: fmtNum(sheetData.petir.length), sub: 'tower', color: C.gold },
        { label: 'Kritis Mayor', value: fmtNum(sheetData.kritis.length), sub: 'status tower', color: C.alert },
      ]} />
      <XSection title="Tower per PHT — terbanyak" height={200}>
        <ResponsiveContainer><BarChart data={sheetData.perPht.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 16 }}><CartesianGrid stroke={LIGHT_CHART_THEME.grid} horizontal={false} /><XAxis type="number" tick={{ fill: LIGHT_CHART_THEME.axis, fontSize: 10 }} /><YAxis type="category" dataKey="name" width={150} tick={{ fill: LIGHT_CHART_THEME.axis, fontSize: 10 }} tickFormatter={(v: string) => shortPht(v)} /><Tooltip {...LIGHT_CHART_THEME.tooltip} formatter={(v: number) => [fmtNum(v), 'Tower']} /><Bar dataKey="value" fill={C.crit} radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer>
      </XSection>
      <XTable title="Tower per PHT — Top 10" headers={['PHT', 'ULTG', 'TOWER']}
        aligns={['left', 'left', 'right']}
        rows={sheetData.perPht.map((d) => [d.name, scoped.find((r) => r.pht === d.name)?.ultg ?? '—', fmtNum(d.value)])}
        maxRows={10} />
      <XTable title="Tower Kritis Mayor" headers={['TOWER', 'PHT', 'ULTG']}
        aligns={['left', 'left', 'left']}
        rows={sheetData.kritis.map((r) => [r.tower.replace(/^TOWER\s+/i, ''), r.pht, r.ultg])}
        maxRows={6} />
    </ExportSheet>
  );

  /* Label PHT pendek untuk chart export (tanpa awalan "SUTT 150 kV " agar muat satu baris). */
  const shortPht = (s: string) => { const v = s.replace(/^SUTT \d+ kV /, ''); return v.length > 18 ? `${v.slice(0, 18)}…` : v; };

  const axis = { tick: { fill: t.axis, fontSize: 10 } };
  const lg = (v: string) => <span style={{ color: t.legend.color }}>{v}</span>;
  const hbar = (d: { name: string; value: number }[], color = C.bar, w = 130) => (
    <ResponsiveContainer><BarChart data={d} layout="vertical" margin={{ left: 10, right: 16 }}><CartesianGrid stroke={t.grid} horizontal={false} /><XAxis type="number" {...axis} /><YAxis type="category" dataKey="name" width={w} {...axis}
      tickFormatter={(v: string) => (v.length > 28 ? `${v.slice(0, 28)}…` : v)} /><Tooltip {...t.tooltip} formatter={(v: number) => fmtNum(v)} /><Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer>
  );

  // ---- per-tab content ----
  let filters: React.ReactNode = null, stats: React.ReactNode = null, charts: React.ReactNode = null;
  let rows: KerawananRow[] = scoped; let cols: Col<KerawananRow>[] = baseCols; let title = '';

  if (tab === 'gangguan') {
    const jenis = tv('jenis');
    const base = scoped.filter((r) => has(r.get(K.petir)) || has(r.get(K.temuanPetir)) || has(r.get(K.hewan)) || has(r.get(K.pohon)));
    const jenisOf = (r: KerawananRow) => [has(r.get(K.petir)) || has(r.get(K.temuanPetir)) ? 'PETIR' : '', has(r.get(K.hewan)) ? 'HEWAN' : '', has(r.get(K.pohon)) ? 'POHON' : ''].filter(Boolean);
    rows = base.filter((r) => jenis === 'Semua' || jenisOf(r).includes(jenis));
    filters = <Select label="Jenis" value={jenis} onChange={tset('jenis')} options={['Semua', 'PETIR', 'HEWAN', 'POHON']} />;
    const counts = ['PETIR', 'HEWAN', 'POHON'].map((j) => ({ name: j, value: rows.filter((r) => jenisOf(r).includes(j)).length }));
    stats = <><StatCard label="Tower dgn Gangguan" value={fmtNum(rows.length)} color={C.cyan} />{counts.map((c) => <StatCard key={c.name} label={c.name} value={fmtNum(c.value)} color={c.name === 'PETIR' ? C.gold : c.name === 'HEWAN' ? C.alert : C.ok} />)}</>;
    charts = <><ChartCard title="Distribusi Jenis Gangguan"><SimplePie data={counts.filter((c) => c.value)} colors={{ PETIR: C.gold, HEWAN: C.alert, POHON: C.ok }} /></ChartCard><ChartCard title="Gangguan per PHT">{hbar(groupSum(rows, (r) => r.pht).slice(0, 12), C.bar, 180)}</ChartCard></>;
    cols = [...baseCols, colOf(K.petir, 'TGL PETIR'), colOf(K.temuanPetir, 'TEMUAN PETIR', { className: 'min-w-[220px]' }), colOf(K.hewan, 'HEWAN'), colOf(K.temuanHewan, 'TEMUAN HEWAN'), colOf(K.pohon, 'POHON')];
    title = 'Data Gangguan per Tower';
  } else if (tab === 'anti') {
    const jenis = tv('jenis');
    const base = scoped.filter((r) => AB_TYPES.some((a) => num0(r.get(K.ab(a))) > 0));
    rows = base.filter((r) => jenis === 'Semua' || num0(r.get(K.ab(jenis))) > 0);
    const per = AB_TYPES.map((a) => ({ name: a, value: rows.reduce((s, r) => s + num0(r.get(K.ab(a))), 0) }));
    filters = <Select label="Jenis Perangkat" value={jenis} onChange={tset('jenis')} options={['Semua', ...AB_TYPES]} />;
    stats = <><StatCard label="Tower Terpasang" value={fmtNum(rows.length)} color={C.cyan} /><StatCard label="Total Perangkat" value={fmtNum(per.reduce((a, b) => a + b.value, 0))} color={C.ok} /></>;
    charts = <><ChartCard title="Perangkat per Jenis">{hbar(per)}</ChartCard><ChartCard title="Tower Terpasang per ULTG"><SimplePie data={groupSum(rows, (r) => r.ultg)} /></ChartCard></>;
    cols = [...baseCols, ...AB_TYPES.map((a) => numCol(K.ab(a), a))];
    title = 'Realisasi Pemasangan Anti Binatang';
  } else if (tab === 'peta') {
    const jenis = tv('jenis');
    const kinds = (r: KerawananRow) => [has(r.get(K.rBinatang)) ? 'BINATANG' : '', has(r.get(K.rSosial)) ? 'SOSIAL' : '', has(r.get(K.rLingk)) ? 'LINGKUNGAN' : ''].filter(Boolean);
    const base = scoped.filter((r) => kinds(r).length > 0 || r.get(K.rawan).toUpperCase() === 'TRUE');
    rows = base.filter((r) => jenis === 'Semua' || kinds(r).includes(jenis));
    filters = <Select label="Jenis Kerawanan" value={jenis} onChange={tset('jenis')} options={['Semua', 'BINATANG', 'SOSIAL', 'LINGKUNGAN']} />;
    const kc = ['BINATANG', 'SOSIAL', 'LINGKUNGAN'].map((k) => ({ name: k, value: rows.filter((r) => kinds(r).includes(k)).length }));
    stats = <><StatCard label="Tower Rawan" value={fmtNum(rows.length)} color={C.crit} />{kc.map((k) => <StatCard key={k.name} label={k.name} value={fmtNum(k.value)} color={C.warn} />)}</>;
    charts = <><ChartCard title="Jenis Binatang">{hbar(groupSum(rows.filter((r) => has(r.get(K.rBinatang))), (r) => r.get(K.rBinatang)).slice(0, 12), C.alert)}</ChartCard><ChartCard title="Tower Rawan per PHT">{hbar(groupSum(rows, (r) => r.pht).slice(0, 12), C.crit, 180)}</ChartCard></>;
    cols = [...baseCols, colOf(K.rBinatang, 'BINATANG'), colOf(K.rSosial, 'SOSIAL'), colOf(K.rLingk, 'LINGKUNGAN'), colOf(K.rNilai, 'NILAI ASESMEN')];
    title = 'Peta Kerawanan per Tower';
  } else if (tab === 'anomali') {
    const st = tv('status');
    rows = scoped.filter((r) => st === 'Semua' || r.get(K.stTower) === st);
    const sts = uniq(data.rows.map((r) => r.get(K.stTower)));
    filters = <Select label="Status Tower" value={st} onChange={tset('status')} options={['Semua', ...sts]} />;
    const dist = groupSum(rows, (r) => r.get(K.stTower));
    const ultgs = uniq(rows.map((r) => r.ultg));
    const perUltg = ultgs.map((u) => { const o: Record<string, any> = { ultg: u }; for (const s of sts) o[s] = rows.filter((r) => r.ultg === u && r.get(K.stTower) === s).length; return o; });
    const stColor: Record<string, string> = { NORMAL: C.ok, 'KRITIS MAYOR': C.crit, 'KRITIS MINOR': C.alert, 'FAIR MAYOR': C.warn, 'FAIR MINOR': C.blue };
    stats = <>{dist.slice(0, 5).map((d) => <StatCard key={d.name} label={d.name} value={fmtNum(d.value)} color={stColor[d.name] ?? C.cyan} />)}</>;
    charts = <><ChartCard title="Status Tower per ULTG"><ResponsiveContainer><BarChart data={perUltg}><CartesianGrid stroke={t.grid} vertical={false} /><XAxis dataKey="ultg" {...axis} /><YAxis {...axis} /><Tooltip {...t.tooltip} /><Legend formatter={lg} />{sts.map((s) => <Bar key={s} dataKey={s} stackId="a" fill={stColor[s] ?? C.purple} />)}</BarChart></ResponsiveContainer></ChartCard>
      <ChartCard title="Jenis Anomali (Top 10)">{hbar(groupSum(rows.filter((r) => r.get(K.anomali) && r.get(K.anomali) !== 'NORMAL'), (r) => r.get(K.anomali).split(' - ')[0]).slice(0, 10), C.alert, 200)}</ChartCard></>;
    cols = [...baseCols, colOf(K.anomali, 'ANOMALI', { className: 'min-w-[220px]' }), colOf(K.anomKet, 'KETERANGAN'), colOf(K.stTower, 'STATUS TOWER', { render: (r) => <Badge status={r.get(K.stTower)} /> }), colOf(K.stSpan, 'STATUS SPAN', { render: (r) => <Badge status={r.get(K.stSpan)} /> })];
    title = 'Anomali dari New SRINTAMI';
  } else if (tab === 'petir') {
    const yr = tv('tahun', '2026'), inten = tv('intensitas');
    const val = (r: KerawananRow) => (yr === 'Semua' ? YEARS.reduce((a, y) => a + num0(r.get(K.sambar(y))), 0) : num0(r.get(K.sambar(yr))));
    const lvl = (v: number) => (yr === 'Semua' ? (v >= 250 ? 'TINGGI' : v >= 100 ? 'SEDANG' : 'RENDAH') : v >= 50 ? 'TINGGI' : v >= 20 ? 'SEDANG' : 'RENDAH');
    rows = scoped.filter((r) => inten === 'Semua' || lvl(val(r)) === inten);
    filters = <><Select label="Tahun" value={yr} onChange={tset('tahun')} options={['Semua', ...YEARS]} /><Select label="Intensitas" value={inten} onChange={tset('intensitas')} options={['Semua', 'TINGGI', 'SEDANG', 'RENDAH']} /></>;
    const total = rows.reduce((a, r) => a + val(r), 0);
    const perYear = YEARS.map((y) => ({ tahun: y, sambaran: rows.reduce((a, r) => a + num0(r.get(K.sambar(y))), 0) }));
    stats = <><StatCard label={`Total Sambaran ${yr === 'Semua' ? '2022–2026' : yr}`} value={fmtNum(total)} color={C.gold} /><StatCard label="Tower" value={fmtNum(rows.length)} color={C.cyan} />{['TINGGI', 'SEDANG'].map((l) => <StatCard key={l} label={`Intensitas ${l}`} value={fmtNum(rows.filter((r) => lvl(val(r)) === l).length)} color={l === 'TINGGI' ? C.crit : C.warn} sub="tower" />)}</>;
    charts = <><ChartCard title="Tren Sambaran per Tahun"><ResponsiveContainer><LineChart data={perYear}><CartesianGrid stroke={t.grid} /><XAxis dataKey="tahun" {...axis} /><YAxis {...axis} tickFormatter={(v) => fmtNum(v)} /><Tooltip {...t.tooltip} formatter={(v: number) => [fmtNum(v), 'Sambaran']} /><Line dataKey="sambaran" stroke={C.gold} strokeWidth={3} dot={{ r: 5 }} /></LineChart></ResponsiveContainer></ChartCard>
      <ChartCard title="Sambaran per PHT (Top 12)">{hbar(groupSum(rows, (r) => r.pht, val).slice(0, 12), C.gold, 180)}</ChartCard></>;
    cols = [...baseCols, ...YEARS.map((y) => numCol(K.sambar(y), y)), numCol(K.kaMax, 'MAX KA'), numCol(K.kaMin, 'MIN KA'), { key: 'lvl', label: 'INTENSITAS', value: (r) => lvl(val(r)), render: (r) => <Badge status={lvl(val(r)) === 'TINGGI' ? 'KRITIS · TINGGI' : lvl(val(r)) === 'SEDANG' ? 'HATI · SEDANG' : 'NORMAL · RENDAH'} /> }];
    title = 'Data Petir Lengkap';
  } else if (tab === 'proteksi') {
    const st = tv('status'), jenis = tv('jenis');
    const anyP = (r: KerawananRow) => PP_TYPES.some((p) => has(r.get(K.pp(p))));
    rows = scoped.filter((r) => (st === 'Semua' || (st === 'ADA' ? anyP(r) : !anyP(r))) && (jenis === 'Semua' || has(r.get(K.pp(jenis)))));
    filters = <><Select label="Status" value={st} onChange={tset('status')} options={['Semua', 'ADA', 'TANPA']} /><Select label="Jenis" value={jenis} onChange={tset('jenis')} options={['Semua', ...PP_TYPES]} /></>;
    const per = PP_TYPES.map((p) => ({ name: p, value: rows.filter((r) => has(r.get(K.pp(p)))).length }));
    stats = <><StatCard label="Tower dgn Proteksi" value={fmtNum(rows.filter(anyP).length)} color={C.ok} /><StatCard label="Tanpa Proteksi" value={fmtNum(rows.filter((r) => !anyP(r)).length)} color={C.crit} /></>;
    charts = <><ChartCard title="Tower per Jenis Proteksi">{hbar(per)}</ChartCard><ChartCard title="Rencana Proteksi Petir">{hbar(groupSum(rows, (r) => r.get(K.pp('RENCANA PROTEKSI PETIR')).split(';')[0]).slice(0, 10), C.purple, 200)}</ChartCard></>;
    cols = [...baseCols, ...PP_TYPES.map((p) => colOf(K.pp(p), p)), colOf(K.pp('RENCANA PROTEKSI PETIR'), 'RENCANA', { className: 'min-w-[200px]' })];
    title = 'Proteksi Petir Terpasang';
  } else if (tab === 'pentanahan') {
    const yr = tv('tahun', '2026'), kondisi = tv('kondisi'), ohm = tv('ohm');
    const nilai = (r: KerawananRow) => num(r.get(K.pt(yr, 'NILAI PENTANAHAN')));
    const band = (v: number | null) => (v == null ? '-' : v <= 5 ? '≤ 5 Ω' : v <= 10 ? '5–10 Ω' : '> 10 Ω');
    rows = scoped.filter((r) => (kondisi === 'Semua' || r.get(K.pt(yr, 'KONDISI')) === kondisi) && (ohm === 'Semua' || band(nilai(r)) === ohm));
    filters = <><Select label="Tahun" value={yr} onChange={tset('tahun')} options={['2025', '2026']} /><Select label="Kondisi" value={kondisi} onChange={tset('kondisi')} options={['Semua', ...uniq(data.rows.map((r) => r.get(K.pt(yr, 'KONDISI'))))]} /><Select label="Nilai Ω" value={ohm} onChange={tset('ohm')} options={['Semua', '≤ 5 Ω', '5–10 Ω', '> 10 Ω']} /></>;
    const kd = groupSum(rows, (r) => r.get(K.pt(yr, 'KONDISI')) || 'BELUM ADA DATA');
    stats = <>{kd.slice(0, 4).map((k) => <StatCard key={k.name} label={k.name} value={fmtNum(k.value)} color={k.name === 'BAIK' ? C.ok : k.name === 'BURUK' ? C.crit : C.warn} sub="tower" />)}</>;
    charts = <><ChartCard title={`Kondisi Pentanahan ${yr}`}><SimplePie data={kd} colors={{ BAIK: C.ok, BURUK: C.crit, 'BELUM DIUKUR': C.warn, 'BELUM ADA DATA': '#5b6b80' }} /></ChartCard><ChartCard title="Sebaran Nilai Pentanahan">{hbar(groupSum(rows, (r) => band(nilai(r))), C.blue, 90)}</ChartCard></>;
    cols = [...baseCols, numCol(K.pt(yr, 'NILAI PENTANAHAN'), 'NILAI (Ω)'), colOf(K.pt(yr, 'ALAT'), 'ALAT'), colOf(K.pt(yr, `TANGGAL ${yr}`), 'TANGGAL'), colOf(K.pt(yr, 'RESISTIVITAS'), 'RESISTIVITAS'), colOf(K.pt(yr, 'KONDISI'), 'KONDISI', { render: (r) => <Badge status={r.get(K.pt(yr, 'KONDISI'))} /> }), colOf(K.pt(yr, 'REKOMENDASI'), 'REKOMENDASI', { className: 'min-w-[200px]' })];
    title = `Pentanahan ${yr}`;
  } else if (tab === 'lidar') {
    const jenis = tv('jenis');
    const kinds = (r: KerawananRow) => [has(r.get(K.drone)) ? 'DRONE' : '', has(r.get(K.lipo)) ? 'LIPO' : '', has(r.get(K.validasi)) ? 'VALIDASI' : ''].filter(Boolean);
    rows = scoped.filter((r) => jenis === 'Semua' || (jenis === 'BELUM' ? kinds(r).length === 0 : kinds(r).includes(jenis)));
    filters = <Select label="Jenis Inspeksi" value={jenis} onChange={tset('jenis')} options={['Semua', 'DRONE', 'LIPO', 'VALIDASI', 'BELUM']} />;
    const kc = ['DRONE', 'LIPO', 'VALIDASI'].map((k) => ({ name: k, value: rows.filter((r) => kinds(r).includes(k)).length }));
    stats = <>{kc.map((k) => <StatCard key={k.name} label={`Inspeksi ${k.name}`} value={fmtNum(k.value)} color={C.cyan} sub="tower" />)}<StatCard label="Belum Inspeksi" value={fmtNum(rows.filter((r) => !kinds(r).length).length)} color={C.warn} /></>;
    charts = <><ChartCard title="Cakupan Inspeksi"><SimplePie data={[...kc, { name: 'BELUM', value: rows.filter((r) => !kinds(r).length).length }].filter((x) => x.value)} /></ChartCard><ChartCard title="Inspeksi per PHT">{hbar(groupSum(rows.filter((r) => kinds(r).length), (r) => r.pht).slice(0, 12), C.cyan, 180)}</ChartCard></>;
    cols = [...baseCols, colOf(K.drone, 'INSPEKSI DRONE'), colOf(K.lipo, 'LAPORAN LiPO'), colOf(K.validasi, 'VALIDASI LAPANGAN')];
    title = 'Inspeksi LiDAR';
  } else {
    // Ketidaksesuaian data — checks inside SELURUH DATA
    type Issue = { row: KerawananRow; sev: 'ERROR' | 'WARNING' | 'INFO'; tipe: string; detail: string };
    const issues: Issue[] = [];
    for (const r of scoped) {
      const errCells = data.keys.filter((k) => /^#(N\/A|VALUE!|REF!|DIV\/0!|NAME\?)/.test(r.get(k)));
      if (errCells.length) issues.push({ row: r, sev: 'ERROR', tipe: 'Formula error', detail: errCells.map((k) => `${k.replace('|', ' › ')}: ${r.get(k)}`).join('; ') });
      for (const y of ['2025', '2026']) {
        const v = num(r.get(K.pt(y, 'NILAI PENTANAHAN'))); const kd = r.get(K.pt(y, 'KONDISI')).toUpperCase();
        if (v != null && v > 10 && kd === 'BAIK') issues.push({ row: r, sev: 'WARNING', tipe: `Pentanahan ${y}`, detail: `Nilai ${v} Ω > 10 Ω tetapi kondisi BAIK` });
        if (kd === 'BURUK' && !r.get(K.pt(y, 'REKOMENDASI'))) issues.push({ row: r, sev: 'INFO', tipe: `Pentanahan ${y}`, detail: 'Kondisi BURUK tanpa rekomendasi' });
      }
      if (!r.get(K.stTower)) issues.push({ row: r, sev: 'WARNING', tipe: 'Anomali NS', detail: 'Status tower kosong' });
      if (r.get(K.rawan).toUpperCase() === 'TRUE' && !has(r.get(K.rBinatang)) && !has(r.get(K.rSosial)) && !has(r.get(K.rLingk))) issues.push({ row: r, sev: 'INFO', tipe: 'Peta Kerawanan', detail: 'Ditandai rawan (TRUE) tanpa jenis kerawanan' });
    }
    const sev = tv('sev'), tipe = tv('tipe');
    const view = issues.filter((i) => (sev === 'Semua' || i.sev === sev) && (tipe === 'Semua' || i.tipe === tipe));
    const icols: Col<Issue>[] = [
      { key: 'sev', label: 'SEVERITY', value: (i) => i.sev, render: (i) => <Badge status={i.sev} /> }, { key: 'tipe', label: 'TIPE', value: (i) => i.tipe },
      { key: 'ultg', label: 'ULTG', value: (i) => i.row.ultg }, { key: 'pht', label: 'PHT', value: (i) => i.row.pht },
      { key: 'tower', label: 'TOWER', value: (i) => i.row.tower.replace(/^TOWER\s+/i, '') }, { key: 'detail', label: 'DETAIL', value: (i) => i.detail, className: 'min-w-[320px]' },
    ];
    return (
      <><Shell tab={tab} setTab={setTab} g={g} setG={setG} phts={phts} ultgs={uniq(data.rows.map((r) => r.ultg))}
        filters={<><Select label="Severity" value={sev} onChange={tset('sev')} options={['Semua', 'ERROR', 'WARNING', 'INFO']} /><Select label="Tipe" value={tipe} onChange={tset('tipe')} options={['Semua', ...uniq(issues.map((i) => i.tipe))]} /></>}
        stats={<>{(['ERROR', 'WARNING', 'INFO'] as const).map((s) => <StatCard key={s} label={s} value={fmtNum(issues.filter((i) => i.sev === s).length)} color={s === 'ERROR' ? C.crit : s === 'WARNING' ? C.warn : C.blue} />)}</>}
        charts={null}
        table={<Card><div className="flex justify-between items-center mb-3 flex-wrap gap-2"><h3 className="h-section">Ketidaksesuaian Data ({fmtNum(view.length)})</h3><ExportButton title="Ketidaksesuaian Data Kerawanan" subtitle="Pemeriksaan otomatis sheet SELURUH DATA" cols={icols} rows={view} /></div><SortableTable rows={view} cols={icols} pageSize={50} /></Card>}
      />
      {sheetEl}</>
    );
  }

  return (
    <><Shell tab={tab} setTab={setTab} g={g} setG={setG} phts={phts} ultgs={uniq(data.rows.map((r) => r.ultg))} filters={filters} stats={stats}
      charts={charts}
      table={<Card><div className="flex justify-between items-center mb-3 flex-wrap gap-2"><h3 className="h-section">{title} ({fmtNum(rows.length)} tower)</h3><ExportButton title={`Kerawanan Transmisi - ${title}`} subtitle={`ULTG ${g.ultg} · PHT ${g.pht}${g.q ? ` · cari "${g.q}"` : ''}`} cols={cols} rows={rows} /></div><SortableTable rows={rows} cols={cols} pageSize={50} maxHeight={600} /></Card>}
    />
    {sheetEl}</>
  );
}

function Shell({ tab, setTab, g, setG, phts, ultgs, filters, stats, charts, table }: {
  tab: TabId; setTab: (t: TabId) => void; g: { ultg: string; pht: string; q: string }; setG: React.Dispatch<React.SetStateAction<{ ultg: string; pht: string; q: string }>>;
  phts: string[]; ultgs: string[]; filters: React.ReactNode; stats: React.ReactNode; charts: React.ReactNode; table: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <PageHeader title="Kerawanan Transmisi" subtitle="Sheet “SELURUH DATA” · monitoring kerawanan per tower UPT Bengkulu" />
      <Tabs<TabId> tabs={TABS} value={tab} onChange={setTab} />
      <Card className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 items-end">
        <Select label="ULTG" value={g.ultg} onChange={(v) => setG({ ultg: v, pht: 'Semua', q: g.q })} options={['Semua', ...ultgs]} />
        <Select label="PHT" value={g.pht} onChange={(v) => setG({ ...g, pht: v })} options={['Semua', ...phts]} />
        <Search value={g.q} onChange={(v) => setG({ ...g, q: v })} placeholder="Cari tower…" />
        {filters}
      </Card>
      {stats && <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4">{stats}</div>}
      {charts && <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{charts}</div>}
      {table}
    </div>
  );
}
