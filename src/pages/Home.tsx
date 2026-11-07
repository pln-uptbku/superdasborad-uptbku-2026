import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Axe, Gauge, TreePine, TrendingDown, Map as MapIcon, LayoutGrid } from 'lucide-react';
import { SourceState, useData, usePageSources, useSource } from '../lib/data';
import { GangguanRow, KerawananRow, NkoMonth, pctOf } from '../lib/parsers';
import { fmtDate, fmtNum, MONTHS_LONG, MONTHS_SHORT } from '../lib/sheets';
import { Badge, C, Card, ChartCard, Col, ErrorState, LIGHT_CHART_THEME, LoadingScreen, PageHeader, SortableTable, StatCard, Tabs, groupSum, useChartTheme } from '../components/ui';
import { GaugeDonut, SimplePie, TegakanUltgChart } from '../components/charts';
import { MonthChips, lowestProblem, statusCounts } from './Kinerja';
import { sumJml } from './Tegakan';
import { penebanganYear } from './Penebangan';
import { AnalisaNkoLine } from '../components/AnalisaNko';
import { ExportSheet, XKpis, XSection, XTable } from '../lib/export';

/** Section-level gate so one failing sheet never blanks the whole HOME page. */
function Slot({ s, children, h = 280 }: { s: SourceState<unknown>; children: () => React.ReactNode; h?: number }) {
  const { refresh } = useData();
  if (s.status === 'error') return <div className="flex items-center justify-center text-center text-xs t-muted" style={{ height: h }}>Data tidak dapat dimuat<br />{s.error}</div>;
  if (s.status !== 'ok') return <div className="flex items-center justify-center" style={{ height: h }}><div className="w-10 h-10 rounded-full border-2 border-t-transparent refresh-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} /></div>;
  return <>{children()}</>;
}
function MiniCard({ s, render }: { s: SourceState<unknown>; render: () => React.ReactNode }) {
  if (s.status === 'ok') return <>{render()}</>;
  return <Card className="flex items-center justify-center text-xs t-muted min-h-[130px]">{s.status === 'error' ? 'Data tidak dapat dimuat' : 'Memuat…'}</Card>;
}

/** Sel status gangguan di lembar export: OPEN merah, CLOSE hijau
    (masukan user 2026-11-07); nilai lain tampil apa adanya. */
const statusCell = (s: string) => s === 'OPEN'
  ? <span style={{ color: '#DC2626', fontWeight: 700 }}>OPEN</span>
  : s === 'CLOSE'
    ? <span style={{ color: '#16A34A', fontWeight: 700 }}>CLOSE</span>
    : s;

export default function Home() {
  usePageSources(['nko', 'tegakan', 'penebangan', 'gangguan', 'kerawananMap']);
  const nko = useSource('nko');
  const teg = useSource('tegakan');
  const pen = useSource('penebangan');
  const ggn = useSource('gangguan');
  const ker = useSource('kerawananMap');
  const nav = useNavigate();
  const t = useChartTheme();
  const tx = LIGHT_CHART_THEME; // tema terang untuk lembar export (selalu putih)
  const months = nko.data?.months ?? [];
  const [selRaw, setSel] = useState<number | null>(null);
  const sel = selRaw ?? months[months.length - 1]?.monthNo ?? 1;
  const m: NkoMonth | undefined = months.find((x) => x.monthNo === sel) ?? months[months.length - 1];
  const year = new Date().getFullYear();

  const gRows = ggn.data?.rows ?? [];
  const openRows = useMemo(() => gRows.filter((r) => r.isOpen), [gRows]);
  const openUpt = gRows.filter((r) => r.statusUpt === 'OPEN').length;
  const overdue = gRows.filter((r) => r.overdueUpt || r.overdueFois).length;
  const nkoTrend = months.map((x) => ({ bulan: MONTHS_SHORT[x.monthNo - 1], cap100: x.total100, cap110: x.total110 != null ? Math.min(110, x.total110) : null }));
  const openPerLokasi = groupSum(openRows, (r) => r.lokasi);

  if (nko.status === 'loading' && teg.status !== 'ok' && ggn.status !== 'ok' && !months.length) return <LoadingScreen text="Memuat Dashboard…" />;
  const allErr = [nko, teg, pen, ggn].every((s) => s.status === 'error');
  if (allErr) return <ErrorState detail="Semua sumber Google Sheets gagal dimuat." />;

  const openCols: Col<GangguanRow>[] = [
    { key: 'no', label: 'NO', value: (r) => +r.no },
    { key: 'lokasi', label: 'LOKASI GANGGUAN', value: (r) => r.lokasi, render: (r) => <b className="uppercase">{r.lokasi}</b>, className: 'min-w-[220px]' },
    { key: 'tanggal', label: 'TANGGAL', value: (r) => r.tanggal, render: (r) => fmtDate(r.tanggal) },
    { key: 'penyebab', label: 'PENYEBAB', value: (r) => r.penyebab },
    { key: 'statusUpt', label: 'STATUS UPT', value: (r) => r.statusUpt, render: (r) => <Badge status={r.statusUpt} /> },
    { key: 'statusFois', label: 'STATUS FOIS', value: (r) => r.statusFois, render: (r) => <Badge status={r.statusFois} /> },
    { key: 'target', label: 'TARGET PENUTUPAN', value: (r) => r.target, render: (r) => <>{r.target ? fmtDate(r.target) : r.targetRaw || '—'}{(r.overdueUpt || r.overdueFois) && <span className="badge badge-crit ml-1">⚠ OVERDUE</span>}</> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard Kinerja UPT Bengkulu"
        subtitle={<>Ringkasan seluruh data · NKO bulan <span className="t-accent font-semibold">{m ? MONTHS_LONG[m.monthNo - 1] : '—'} {year}</span></>}
        right={months.length ? <MonthChips months={months} value={sel} onChange={setSel} /> : null}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <MiniCard s={ggn} render={() => (
          <StatCard label="Total Gangguan" labelSub="(2023 s.d tahun berjalan)" value={fmtNum(gRows.length)} valueSub={<>(Tahun Berjalan {year} = {fmtNum(gRows.filter((r) => (r.tahun || String(r.tanggal?.getFullYear() ?? '')).trim() === String(year)).length)})</>} color={C.cyan} icon={<Activity />} onClick={() => nav('/gangguan')}
            sub={<><b style={{ color: C.warn }}>{openUpt} open</b> · <b style={{ color: C.crit }}>{overdue} overdue</b></>} badge={<span className="badge badge-info">Monitoring Gangguan →</span>} />
        )} />
        <MiniCard s={nko} render={() => (
          <StatCard label="NKO Score (cap 110%)" value={fmtNum(m?.total110 != null ? Math.min(110, m.total110) : null, 2)} color={(m?.total110 ?? 0) >= 100 ? C.ok : C.warn} icon={<Gauge />} onClick={() => nav('/kinerja')}
            sub={<>cap 100%: {fmtNum(m?.total100, 2)} · {m ? MONTHS_SHORT[m.monthNo - 1] : ''}</>} badge={<span className="badge badge-info">Dashboard Kinerja →</span>} />
        )} />
        <MiniCard s={pen} render={() => { const p = penebanganYear(pen.data!.rows, year); return (
          <StatCard label={`Realisasi Penebangan ${year}`} value={fmtNum(p.total)} color={C.ok} icon={<Axe />} onClick={() => nav('/penebangan')}
            sub={<>{fmtNum(p.tebang)} tebang · {fmtNum(p.pangkas)} pangkas</>} badge={<span className="badge badge-ok">{p.total ? Math.round((p.tebang / p.total) * 100) : 0}% tebang · {fmtNum(p.records)} record</span>} />
        ); }} />
        <MiniCard s={teg} render={() => { const rows = teg.data!.rows; return (
          <StatCard label="Tegakan Kritis" value={fmtNum(sumJml(rows, 'KRITIS'))} color={C.crit} icon={<TreePine />} onClick={() => nav('/tegakan')}
            sub={<>dari {fmtNum(sumJml(rows))} total tegakan</>} badge={<span className="badge badge-crit">{fmtNum((sumJml(rows, "KRITIS") / Math.max(1, sumJml(rows))) * 100, 2)}% kritis</span>} />
        ); }} />
        <MiniCard s={nko} render={() => { const low = m ? lowestProblem(m) : null; return (
          <StatCard label="Kinerja Terendah" value={low ? low.short : 'Semua BAIK'} color={low ? (low.status === 'MASALAH' ? C.crit : C.warn) : C.ok} icon={<TrendingDown />} onClick={() => nav('/kinerja')}
            sub={low ? <>{low.no}. {low.name.slice(0, 48)} · {fmtNum(pctOf(low), 2)}%</> : 'Tidak ada indikator MASALAH / HATI-HATI'} badge={low ? <Badge status={low.status} /> : undefined} />
        ); }} />
      </div>

      {months.length > 1 && m && <AnalisaNkoLine months={months} sel={m.monthNo} onOpen={() => nav('/kinerja#analisa-nko', { state: { month: m.monthNo } })} />}

      {/* Charts — numbered, ordered left → right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        <ChartCard title="1. Trend NKO Bulanan">
          <Slot s={nko}>{() => (
            <ResponsiveContainer><AreaChart data={nkoTrend} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
              <defs><linearGradient id="gNko" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.blue} stopOpacity={0.5} /><stop offset="1" stopColor={C.blue} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke={t.grid} /><XAxis dataKey="bulan" tick={{ fill: t.axis, fontSize: 11 }} /><YAxis domain={['dataMin - 3', 'dataMax + 2']} tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={(v) => fmtNum(v, 0)} />
              <Tooltip {...t.tooltip} formatter={(v: number, n: string) => [fmtNum(v, 2), n === 'cap110' ? 'NKO cap 110%' : 'NKO cap 100%']} />
              <Legend formatter={(v) => <span style={{ color: t.legend.color }}>{v === 'cap110' ? 'cap 110%' : 'cap 100%'}</span>} />
              <Area type="monotone" dataKey="cap110" stroke={C.blue} fill="url(#gNko)" strokeWidth={3} dot={{ r: 3 }} />
              <Area type="monotone" dataKey="cap100" stroke={C.ok} fill="transparent" strokeWidth={2} dot={{ r: 2 }} />
            </AreaChart></ResponsiveContainer>
          )}</Slot>
        </ChartCard>
        <ChartCard title="2. Data Tegakan per ULTG" right={<button className="text-[11px] t-accent" onClick={() => nav('/tegakan')}>Tegakan (NS) →</button>}>
          <Slot s={teg}>{() => <TegakanUltgChart rows={teg.data!.rows} />}</Slot>
        </ChartCard>
        <ChartCard title="3. Target Pencapaian NKO">
          <Slot s={nko}>{() => <GaugeDonut value={m?.total110 != null ? Math.min(110, m.total110) : null} label="NKO cap 110%" sub={`Target 100 · ${m ? MONTHS_SHORT[m.monthNo - 1] : ''}`} />}</Slot>
        </ChartCard>
        <ChartCard title="4. Status KPI">
          <Slot s={nko}>{() => <SimplePie data={m ? Object.entries(statusCounts(m)).map(([name, value]) => ({ name, value })).filter((d) => d.value) : []} colors={{ BAIK: C.ok, MASALAH: C.crit, 'HATI-HATI': C.warn }} />}</Slot>
        </ChartCard>
        <ChartCard title="5. Perbandingan NKO per Bulan">
          <Slot s={nko}>{() => (
            <ResponsiveContainer><BarChart data={nkoTrend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={t.grid} vertical={false} /><XAxis dataKey="bulan" tick={{ fill: t.axis, fontSize: 11 }} /><YAxis domain={[80, 110]} tick={{ fill: t.axis, fontSize: 11 }} />
              <Tooltip {...t.tooltip} formatter={(v: number, n: string) => [fmtNum(v, 2), n === 'cap110' ? 'cap 110%' : 'cap 100%']} />
              <Legend formatter={(v) => <span style={{ color: t.legend.color }}>{v === 'cap110' ? 'cap 110%' : 'cap 100%'}</span>} />
              <Bar dataKey="cap100" fill={C.pln} radius={[4, 4, 0, 0]} /><Bar dataKey="cap110" fill={C.cyan} radius={[4, 4, 0, 0]} />
            </BarChart></ResponsiveContainer>
          )}</Slot>
        </ChartCard>
        <KerawananMap s={ker} />
      </div>

      {/* Data gangguan OPEN per lokasi */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="h-section">Data Gangguan OPEN per Lokasi ({openRows.length})</h3>
          <button className="btn" onClick={() => nav('/gangguan')}>Monitoring Gangguan →</button>
        </div>
        <Slot s={ggn} h={160}>{() => <SortableTable rows={openRows} cols={openCols} maxHeight={420} empty="Tidak ada gangguan berstatus OPEN" />}</Slot>
      </Card>

      {/* moved to the bottom (revision 2) */}
      <ChartCard title="7. Gangguan OPEN per Lokasi" height={Math.max(240, openPerLokasi.length * 30)}>
        <Slot s={ggn}>{() => (
          <ResponsiveContainer><BarChart data={openPerLokasi} layout="vertical" margin={{ left: 10, right: 20 }}>
            <CartesianGrid stroke={t.grid} horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fill: t.axis, fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={300} tick={{ fill: t.axis, fontSize: 10 }}
              tickFormatter={(v: string) => (v.length > 38 ? `${v.slice(0, 38)}…` : v)} />
            <Tooltip {...t.tooltip} formatter={(v: number) => [v, 'Gangguan OPEN']} />
            <Bar dataKey="value" fill={C.crit} radius={[0, 6, 6, 0]} />
          </BarChart></ResponsiveContainer>
        )}</Slot>
      </ChartCard>

      {/* Lembar ringkasan 1 halaman tegak (Export PDF/PNG) — off-screen, lihat src/lib/export.tsx */}
      <ExportSheet meta={{ title: 'Dashboard Kinerja UPT Bengkulu', subtitle: `Ringkasan seluruh data · NKO bulan ${m ? MONTHS_LONG[m.monthNo - 1] : '—'} ${year}`, fileBase: 'Dashboard_UPT_Bengkulu', updatedAt: nko.updatedAt ?? null }}>
        <XKpis items={[
          { label: 'Total Gangguan', value: fmtNum(gRows.length), sub: <>Tahun berjalan {year}: {fmtNum(gRows.filter((r) => (r.tahun || String(r.tanggal?.getFullYear() ?? '')).trim() === String(year)).length)}</>, color: C.cyan },
          { label: 'NKO Score (cap 110%)', value: fmtNum(m?.total110 != null ? Math.min(110, m.total110) : null, 2), sub: <>cap 100%: {fmtNum(m?.total100, 2)} · {m ? MONTHS_SHORT[m.monthNo - 1] : ''}</>, color: (m?.total110 ?? 0) >= 100 ? C.ok : C.warn },
          { label: `Realisasi Penebangan ${year}`, value: fmtNum(pen.data ? penebanganYear(pen.data.rows, year).total : null), sub: pen.data ? <>{fmtNum(penebanganYear(pen.data.rows, year).tebang)} tebang · {fmtNum(penebanganYear(pen.data.rows, year).pangkas)} pangkas</> : '—', color: C.ok },
          { label: 'Tegakan Kritis', value: fmtNum(teg.data ? sumJml(teg.data.rows, 'KRITIS') : null), sub: teg.data ? <>dari {fmtNum(sumJml(teg.data.rows))} total · {((sumJml(teg.data.rows, 'KRITIS') / Math.max(1, sumJml(teg.data.rows))) * 100).toFixed(1)}% kritis</> : '—', color: C.crit },
          { label: 'Kinerja Terendah', value: (() => { const low = m ? lowestProblem(m) : null; return low ? low.short : 'Semua BAIK'; })(), sub: (() => { const low = m ? lowestProblem(m) : null; return low ? <>{low.no}. {low.name} · {fmtNum(pctOf(low), 2)}%</> : 'Tidak ada MASALAH'; })(), color: (() => { const low = m ? lowestProblem(m) : null; return low ? (low.status === 'MASALAH' ? C.crit : C.warn) : C.ok; })() },
        ]} />
        <XSection title="Trend NKO Bulanan" height={180}>
          <ResponsiveContainer><AreaChart data={nkoTrend} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <defs><linearGradient id="gNkoX" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.blue} stopOpacity={0.5} /><stop offset="1" stopColor={C.blue} stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid stroke={tx.grid} /><XAxis dataKey="bulan" tick={{ fill: tx.axis, fontSize: 11 }} /><YAxis domain={['dataMin - 3', 'dataMax + 2']} tick={{ fill: tx.axis, fontSize: 11 }} tickFormatter={(v) => fmtNum(v, 0)} />
            <Tooltip {...tx.tooltip} formatter={(v: number, n: string) => [fmtNum(v, 2), n === 'cap110' ? 'NKO cap 110%' : 'NKO cap 100%']} />
            <Legend formatter={(v) => <span style={{ color: tx.legend.color }}>{v === 'cap110' ? 'cap 110%' : 'cap 100%'}</span>} />
            <Area type="monotone" dataKey="cap110" stroke={C.blue} fill="url(#gNkoX)" strokeWidth={3} dot={{ r: 3 }} />
            <Area type="monotone" dataKey="cap100" stroke={C.ok} fill="transparent" strokeWidth={2} dot={{ r: 2 }} />
          </AreaChart></ResponsiveContainer>
        </XSection>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <XSection title="Status KPI" height={180}>
              <SimplePie data={m ? Object.entries(statusCounts(m)).map(([name, value]) => ({ name, value })).filter((d) => d.value) : []} colors={{ BAIK: C.ok, MASALAH: C.crit, 'HATI-HATI': C.warn }} />
            </XSection>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <XSection title="Target Pencapaian NKO" height={180}>
              <GaugeDonut value={m?.total110 != null ? Math.min(110, m.total110) : null} label="NKO cap 110%" sub={`Target 100 · ${m ? MONTHS_SHORT[m.monthNo - 1] : ''}`} />
            </XSection>
          </div>
        </div>
        <XTable title={`Gangguan OPEN — ${openRows.length} kasus`} headers={['LOKASI', 'TANGGAL', 'PENYEBAB', 'STATUS UPT', 'STATUS FOIS', 'TARGET']}
          rows={[...openRows].sort((a, b) => (b.tanggal?.getTime() ?? 0) - (a.tanggal?.getTime() ?? 0)).map((r) => [r.lokasi, fmtDate(r.tanggal), r.penyebab.length > 46 ? `${r.penyebab.slice(0, 46)}…` : r.penyebab, statusCell(r.statusUpt), statusCell(r.statusFois), r.target ? fmtDate(r.target) : (r.targetRaw || '—')])}
          maxRows={11} />
      </ExportSheet>
    </div>
  );
}

/* ---------------- 6. Peta Kerawanan (SVG schematic ↔ Ringkasan) ---------------- */
const NODES: Record<string, [number, number, string]> = {
  ARMUR: [110, 60, 'Arga Makmur'], PBAAI: [80, 230, 'Pulau Baai'], SKMDU: [130, 250, 'Sukamerindu'], PKLGN: [200, 185, 'Pekalongan'],
  MUSI: [170, 130, 'PLTA Musi'], TESS: [255, 105, 'Tes'], ARPTH: [300, 55, 'Air Putih'], LBGAU: [355, 125, 'Lubuk Linggau'],
  EPLWG: [380, 205, 'Empat Lawang'], LAHAT: [470, 235, 'Lahat'], BKSAM: [545, 290, 'Bukit Asam'], LMBAI: [555, 190, 'Lumut Balai'],
  PNDPO: [560, 120, 'Pendopo'], KBANG: [505, 335, 'Kebang'], BJSARI: [430, 320, 'Banjarsari'], PGLAM: [370, 300, 'Pagar Alam'], MANNA: [240, 345, 'Manna'],
};
function phtEnds(pht: string): [string, string] | null {
  const toks = pht.toUpperCase().replace(/SUTET|SUTT|\d+\s*KV/g, ' ').match(/[A-Z]{4,6}/g) || [];
  const t = toks.filter((x) => NODES[x]);
  return t.length >= 2 ? [t[0], t[1]] : null;
}
function KerawananMap({ s }: { s: SourceState<{ rows: KerawananRow[] }> }) {
  const [mode, setMode] = useState<'peta' | 'ringkasan'>('peta');
  const nav = useNavigate();
  const stats = useMemo(() => {
    const rows = s.data?.rows ?? [];
    const per = new Map<string, { towers: number; kritis: number; rawan: number; petir: number }>();
    for (const r of rows) {
      const o = per.get(r.pht) ?? { towers: 0, kritis: 0, rawan: 0, petir: 0 };
      o.towers++;
      if (r.get('ANOMALI DARI NEW SRINTAMI|STATUS TOWER') === 'KRITIS MAYOR') o.kritis++;
      if (r.get('PETA KERAWANAN|ADA / TIDAK').toUpperCase() === 'TRUE') o.rawan++;
      const pt = r.get('DATA GANGGUAN|PETIR'); if (pt && !pt.startsWith('#')) o.petir++;
      per.set(r.pht, o);
    }
    const lines = [...per.entries()].map(([pht, o]) => {
      const score = (o.kritis + o.rawan * 0.5 + o.petir * 2) / Math.max(1, o.towers);
      return { pht, ...o, score, level: score > 0.45 ? 'TINGGI' : score > 0.25 ? 'SEDANG' : 'RENDAH', ends: phtEnds(pht) };
    });
    const total = { towers: rows.length, kritis: lines.reduce((a, l) => a + l.kritis, 0), rawan: lines.reduce((a, l) => a + l.rawan, 0), petir: lines.reduce((a, l) => a + l.petir, 0) };
    return { lines, total };
  }, [s.data]);
  const color = (lvl: string) => (lvl === 'TINGGI' ? C.crit : lvl === 'SEDANG' ? C.warn : C.ok);
  const [hover, setHover] = useState<string | null>(null);
  const hv = stats.lines.find((l) => l.pht === hover);
  return (
    <ChartCard title="6. Peta Kerawanan Transmisi" right={<Tabs value={mode} onChange={setMode} tabs={[{ id: 'peta', label: <span className="inline-flex items-center gap-1"><MapIcon size={12} /> Peta</span> }, { id: 'ringkasan', label: <span className="inline-flex items-center gap-1"><LayoutGrid size={12} /> Ringkasan</span> }]} />}>
      <Slot s={s}>{() => mode === 'peta' ? (
        <div className="relative w-full h-full rounded-xl overflow-hidden" style={{ background: 'var(--side)' }}>
          <svg viewBox="0 0 620 380" className="w-full h-full">
            <path d="M20 40 C 60 140, 40 260, 160 370 L 0 380 L 0 0 Z" fill="rgba(0,174,239,0.10)" />
            <text x="24" y="330" fontSize="10" fill="#00AEEF" opacity="0.7">Samudra Hindia</text>
            {stats.lines.filter((l) => l.ends).map((l) => {
              const [a, b] = l.ends!; const A = NODES[a], B = NODES[b];
              return <line key={l.pht} x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke={color(l.level)} strokeWidth={hover === l.pht ? 6 : 3.5} strokeLinecap="round" opacity={hover && hover !== l.pht ? 0.35 : 0.95}
                style={{ filter: `drop-shadow(0 0 4px ${color(l.level)})`, cursor: 'pointer' }} onMouseEnter={() => setHover(l.pht)} onMouseLeave={() => setHover(null)} onClick={() => nav('/kerawanan')} />;
            })}
            {Object.entries(NODES).map(([k, [x, y]]) => (
              <g key={k}><circle cx={x} cy={y} r={6} fill="#00E5FF" style={{ filter: 'drop-shadow(0 0 6px #00E5FF)' }} /><text x={x + 8} y={y - 7} fontSize="10" fontWeight={700} fill="var(--heading)">{k}</text></g>
            ))}
          </svg>
          <div className="absolute left-3 bottom-2 flex gap-3 text-[10px]">
            {['RENDAH', 'SEDANG', 'TINGGI'].map((l) => <span key={l} className="inline-flex items-center gap-1" style={{ color: color(l) }}><span className="w-3 h-1 rounded" style={{ background: color(l) }} />{l}</span>)}
          </div>
          {hv && <div className="absolute right-2 top-2 text-[11px] p-2 rounded-lg" style={{ background: 'var(--bg2)', border: '1px solid var(--card-border)' }}>
            <div style={{ color: 'var(--heading)' }} className="font-bold">{hv.pht}</div>
            <div>{hv.towers} tower · Kritis mayor {hv.kritis} · Rawan {hv.rawan} · Ggn petir {hv.petir}</div>
            <div>Risiko: <b style={{ color: color(hv.level) }}>{hv.level}</b></div>
          </div>}
          <div className="absolute right-2 bottom-2 text-[9px] t-muted">Skematik (bukan skala geografis)</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 h-full content-start overflow-auto">
          {[['Total Tower', stats.total.towers, C.cyan], ['Kritis Mayor (NS)', stats.total.kritis, C.crit], ['Tower Rawan', stats.total.rawan, C.warn], ['Tower Ggn Petir', stats.total.petir, C.gold]].map(([l, v, c]) => (
            <div key={l as string} className="rounded-xl p-3" style={{ border: '1px solid var(--card-border)', background: 'var(--bg2)' }}>
              <div className="t-label">{l}</div><div className="text-2xl font-extrabold" style={{ color: c as string }}>{fmtNum(v as number)}</div>
            </div>
          ))}
          <div className="col-span-2 text-xs space-y-1">
            {[...stats.lines].sort((a, b) => b.score - a.score).slice(0, 4).map((l) => (
              <div key={l.pht} className="flex justify-between gap-2"><span className="truncate">{l.pht}</span><b style={{ color: color(l.level) }}>{l.level}</b></div>
            ))}
          </div>
        </div>
      )}</Slot>
    </ChartCard>
  );
}
