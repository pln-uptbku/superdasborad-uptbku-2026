import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TreePine } from 'lucide-react';
import { TegakanData, useData, usePageSources, useSource } from '../lib/data';
import { TegakanRow, TEG_STATUSES, TrendSeries } from '../lib/parsers';
import { fmtDate, fmtNum } from '../lib/sheets';
import { Badge, C, Card, ChartCard, Col, ExportButton, Gate, PageHeader, Search, Select, SortableTable, StatCard, STATUS_COLORS, Tabs, groupSum, uniq, useChartTheme } from '../components/ui';
import { SimplePie, TegakanUltgChart, TEG_LABEL } from '../components/charts';
import { Term } from '../components/Glossary';
import { ExportSheet, XKpis, XSection, XTable } from '../lib/export';

export const sumJml = (rows: TegakanRow[], status?: string) => rows.reduce((a, r) => a + (!status || r.status === status ? r.jml : 0), 0);

/** ULTG per penghantar sesuai database: ULTG yang paling banyak tercatat
    (jumlah record) untuk penghantar itu. Satu penghantar bisa melintasi dua
    wilayah — mis. TRS 275KV LAHAT-LBGAU tercatat di ULTG PEKALONGAN (3.595
    record) dan ULTG LAHAT (2.037 record) — jadi agregasi per penghantar
    tidak boleh asal ambil baris pertama/terakhir: keduanya harus memakai
    ULTG mayoritas yang sama supaya lembar export dan tabel dashboard tidak
    berbeda. */
function majorityUltg(rows: TegakanRow[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const m = counts.get(r.pht) ?? new Map<string, number>();
    m.set(r.ultg, (m.get(r.ultg) ?? 0) + 1);
    counts.set(r.pht, m);
  }
  const out = new Map<string, string>();
  for (const [pht, m] of counts) {
    let best = '', bestN = -1;
    for (const [u, n] of m) if (n > bestN) { best = u; bestN = n; }
    out.set(pht, best);
  }
  return out;
}

export default function Tegakan() {
  usePageSources(['tegakan']);
  const s = useSource('tegakan');
  const { refresh } = useData();
  return <Gate sources={[s]} onRetry={() => refresh(['tegakan'])} text="Memuat data Tegakan (NS)…">{() => <Body data={s.data!} />}</Gate>;
}

type Tab = 'ringkasan' | 'data' | 'tren' | 'validasi';

function Body({ data }: { data: TegakanData }) {
  const [tab, setTab] = useState<Tab>('ringkasan');
  const [f, setF] = useState({ ultg: 'Semua', status: 'Semua', tipe: 'Semua', posisi: 'Semua', pht: 'Semua', q: '' });
  const set = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));
  const opts = useMemo(() => ({
    ultg: uniq(data.rows.map((r) => r.ultg)), tipe: uniq(data.rows.map((r) => r.tipe)), posisi: uniq(data.rows.map((r) => r.posisi)), pht: uniq(data.rows.map((r) => r.pht)),
  }), [data.rows]);
  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return data.rows.filter((r) =>
      (f.ultg === 'Semua' || r.ultg === f.ultg) && (f.status === 'Semua' || r.status === f.status) && (f.tipe === 'Semua' || r.tipe === f.tipe) &&
      (f.posisi === 'Semua' || r.posisi === f.posisi) && (f.pht === 'Semua' || r.pht === f.pht) &&
      (!q || `${r.span} ${r.gi} ${r.pht} ${r.petugas} ${r.tipe}`.toLowerCase().includes(q)));
  }, [data.rows, f]);
  const total = sumJml(rows);
  const perPht = useMemo(() => {
    const ultgByPht = majorityUltg(rows);
    const mm = new Map<string, { ultg: string; NORMAL: number; BAHAYA_II: number; BAHAYA_I: number; KRITIS: number; total: number }>();
    for (const r of rows) {
      const o = mm.get(r.pht) ?? { ultg: ultgByPht.get(r.pht) ?? r.ultg, NORMAL: 0, BAHAYA_II: 0, BAHAYA_I: 0, KRITIS: 0, total: 0 };
      o[r.status as 'NORMAL' | 'BAHAYA_II' | 'BAHAYA_I' | 'KRITIS'] += r.jml;
      o.total += r.jml;
      mm.set(r.pht, o);
    }
    return [...mm.entries()].sort((a, b) => b[1].KRITIS - a[1].KRITIS || b[1].total - a[1].total);
  }, [rows]);
  return (
    <div className="space-y-5">
      <PageHeader title={<><Term term="Tegakan">Tegakan</Term> (NS)</>} subtitle={<>Sheet “TARIKAN NEW SRINTAMI” · <b className="t-accent">{fmtNum(sumJml(data.rows))}</b> tegakan · {fmtNum(data.rows.length)} record{data.headerTotal != null && <> · total sheet (X1): {fmtNum(data.headerTotal)}</>}</>}
        right={<Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'ringkasan', label: '📊 Ringkasan' }, { id: 'data', label: '📋 Data Tegakan' }, { id: 'tren', label: '📈 Tren Harian' }, { id: 'validasi', label: '🪓 Validasi Tegakan' }]} />} />
      {(tab === 'ringkasan' || tab === 'data') && (
        <Card>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Select label="ULTG" value={f.ultg} onChange={set('ultg')} options={['Semua', ...opts.ultg]} />
            <Select label="Status" value={f.status} onChange={set('status')} options={['Semua', ...TEG_STATUSES]} />
            <Select label="Tipe Pohon" value={f.tipe} onChange={set('tipe')} options={['Semua', ...opts.tipe]} />
            <Select label="Posisi" value={f.posisi} onChange={set('posisi')} options={['Semua', ...opts.posisi]} />
            <Select label="Penghantar" value={f.pht} onChange={set('pht')} options={['Semua', ...opts.pht]} />
            <Search value={f.q} onChange={set('q')} placeholder="Span / GI / petugas…" />
          </div>
        </Card>
      )}
      {(tab === 'ringkasan' || tab === 'data') && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total Tegakan" value={fmtNum(total)} color={C.cyan} icon={<TreePine />} sub={`${fmtNum(rows.length)} record`} />
          {TEG_STATUSES.map((s) => (
            <StatCard key={s} label={TEG_LABEL[s]} value={fmtNum(sumJml(rows, s))} color={STATUS_COLORS[s]} sub={`${total ? ((sumJml(rows, s) / total) * 100).toFixed(1) : 0}%`} />
          ))}
        </div>
      )}
      {tab === 'ringkasan' && <Ringkasan rows={rows} />}
      {tab === 'data' && <DataTable rows={rows} />}
      {tab === 'tren' && <Tren trends={data.trends} error={data.trendError} />}
      {tab === 'validasi' && <Validasi trends={data.trends} error={data.trendError} />}

      {/* Lembar ringkasan 1 halaman tegak (Export PDF/PNG) — off-screen, lihat src/lib/export.tsx */}
      <ExportSheet meta={{ title: 'Tegakan (NS)', subtitle: `Sheet “TARIKAN NEW SRINTAMI” · ${fmtNum(sumJml(data.rows))} tegakan · ${fmtNum(data.rows.length)} record`, fileBase: 'Tegakan_NS' }}>
        <XKpis items={[
          { label: 'Total Tegakan', value: fmtNum(total), sub: `${fmtNum(rows.length)} record`, color: C.cyan },
          ...TEG_STATUSES.map((s) => ({ label: TEG_LABEL[s], value: fmtNum(sumJml(rows, s)), sub: `${total ? ((sumJml(rows, s) / total) * 100).toFixed(1) : '0'}%`, color: STATUS_COLORS[s] })),
        ]} />
        <XSection title="Distribusi Status (∑ JML)" height={200}>
          <SimplePie data={TEG_STATUSES.map((s) => ({ name: TEG_LABEL[s], value: sumJml(rows, s) }))} colors={{ Normal: C.ok, 'Bahaya II': C.warn, 'Bahaya I': C.alert, Kritis: C.crit }} />
        </XSection>
        <XTable title="Rekap per Penghantar — kritis terbanyak" headers={['PENGHANTAR', 'ULTG', 'NORMAL', 'BAHAYA II', 'BAHAYA I', 'KRITIS', 'TOTAL']}
          aligns={['left', 'left', 'right', 'right', 'right', 'right', 'right']}
          rows={perPht.map(([name, v]) => [name, v.ultg, fmtNum(v.NORMAL), fmtNum(v.BAHAYA_II), fmtNum(v.BAHAYA_I), fmtNum(v.KRITIS), fmtNum(v.total)])}
          maxRows={16} />
      </ExportSheet>
    </div>
  );
}

function Ringkasan({ rows }: { rows: TegakanRow[] }) {
  const t = useChartTheme();
  const tipe = groupSum(rows, (r) => r.tipe, (r) => r.jml).slice(0, 10);
  const pht = useMemo(() => {
    const ultgByPht = majorityUltg(rows);
    const m = new Map<string, Record<string, number>>();
    for (const r of rows) { const o = m.get(r.pht) ?? { NORMAL: 0, BAHAYA_II: 0, BAHAYA_I: 0, KRITIS: 0 } as any; o[r.status] += r.jml; m.set(r.pht, o); }
    return [...m.entries()].map(([name, v]: any) => ({ name, ultg: (ultgByPht.get(name) ?? '') as string, NORMAL: v.NORMAL, BAHAYA_II: v.BAHAYA_II, BAHAYA_I: v.BAHAYA_I, KRITIS: v.KRITIS, total: v.NORMAL + v.BAHAYA_II + v.BAHAYA_I + v.KRITIS }));
  }, [rows]);
  type P = (typeof pht)[number];
  const cols: Col<P>[] = [
    { key: 'name', label: 'PENGHANTAR', value: (r) => r.name },
    { key: 'ultg', label: 'ULTG', value: (r) => r.ultg },
    ...TEG_STATUSES.map((s) => ({ key: s, label: TEG_LABEL[s].toUpperCase(), value: (r: P) => r[s], render: (r: P) => <span style={{ color: s === 'KRITIS' && r[s] ? C.crit : undefined, fontWeight: s === 'KRITIS' ? 700 : 400 }}>{fmtNum(r[s])}</span>, align: 'right' as const })),
    { key: 'total', label: 'TOTAL', value: (r) => r.total, render: (r) => <b>{fmtNum(r.total)}</b>, align: 'right' },
  ];
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        <ChartCard title="1. Distribusi Status (∑ JML)">
          <SimplePie data={TEG_STATUSES.map((s) => ({ name: TEG_LABEL[s], value: sumJml(rows, s) }))} colors={{ Normal: C.ok, 'Bahaya II': C.warn, 'Bahaya I': C.alert, Kritis: C.crit }} />
        </ChartCard>
        <ChartCard title="2. Data Tegakan per ULTG"><TegakanUltgChart rows={rows} /></ChartCard>
        <ChartCard title="3. Top 10 Tipe Pohon">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tipe} layout="vertical" margin={{ left: 10, right: 16 }}>
              <CartesianGrid stroke={t.grid} horizontal={false} />
              <XAxis type="number" tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={(v) => fmtNum(v)} />
              <YAxis type="category" dataKey="name" width={100} tick={{ fill: t.axis, fontSize: 10 }} />
              <Tooltip {...t.tooltip} formatter={(v: number) => [fmtNum(v), 'Tegakan']} />
              <Bar dataKey="value" fill={C.bar} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <Card>
        <h3 className="h-section mb-3">Rekap per Penghantar (PHT)</h3>
        <SortableTable rows={pht} cols={cols} />
      </Card>
    </>
  );
}

function DataTable({ rows }: { rows: TegakanRow[] }) {
  const cols: Col<TegakanRow>[] = [
    { key: 'span', label: 'SPAN', value: (r) => r.span, className: 'min-w-[220px]' },
    { key: 'ultg', label: 'ULTG', value: (r) => r.ultg },
    { key: 'gi', label: 'GARDU INDUK', value: (r) => r.gi },
    { key: 'pht', label: 'PENGHANTAR', value: (r) => r.pht },
    { key: 'tipe', label: 'TIPE', value: (r) => r.tipe },
    { key: 'posisi', label: 'POSISI', value: (r) => r.posisi },
    { key: 'line', label: 'LINE', value: (r) => r.line },
    { key: 'tinggi', label: 'TINGGI (M)', value: (r) => r.tinggi, render: (r) => fmtNum(r.tinggi, 1), align: 'right' },
    { key: 'tinggiSpan', label: 'TINGGI SPAN (M)', value: (r) => r.tinggiSpan, render: (r) => fmtNum(r.tinggiSpan, 1), align: 'right' },
    { key: 'jarakPohon', label: 'JARAK POHON (M)', value: (r) => r.jarakPohon, render: (r) => fmtNum(r.jarakPohon, 1), align: 'right' },
    { key: 'u', label: 'U (M)', value: (r) => r.u, render: (r) => fmtNum(r.u, 1), align: 'right' },
    { key: 'jml', label: 'JML', value: (r) => r.jml, render: (r) => <b>{fmtNum(r.jml)}</b>, align: 'right' },
    { key: 'status', label: 'STATUS', value: (r) => r.status, render: (r) => <Badge status={r.status} /> },
    { key: 'petugas', label: 'PETUGAS', value: (r) => r.petugas },
    { key: 'tglUpdate', label: 'TGL UPDATE', value: (r) => r.tglUpdate, render: (r) => fmtDate(r.tglUpdate) },
  ];
  return (
    <Card>
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <h3 className="h-section">Data Tegakan ({fmtNum(rows.length)} record)</h3>
        <ExportButton title="Data Tegakan NS" subtitle="Sheet TARIKAN NEW SRINTAMI (terfilter)" cols={cols} rows={rows} />
      </div>
      <SortableTable rows={rows} cols={cols} pageSize={50} maxHeight={620} />
    </Card>
  );
}

/* ---------- trend helpers ---------- */
function useTrendData(trends: TrendSeries[], pht: string) {
  return useMemo(() => {
    const byDate = new Map<number, { date: Date; label: string; [k: string]: any }>();
    for (const tr of trends) {
      for (const p of tr.points) {
        const k = p.date.getTime();
        const o = byDate.get(k) ?? { date: p.date, label: fmtDate(p.date) };
        o[tr.status] = pht === 'Semua' ? tr.phts.reduce((a, n) => a + (p.values[n] ?? 0), 0) : (p.values[pht] ?? 0);
        byDate.set(k, o);
      }
    }
    return [...byDate.values()].sort((a, b) => a.date.getTime() - b.date.getTime()).map((o) => ({
      ...o, NORMAL: o.NORMAL ?? 0, BAHAYA_I: o.BAHAYA_I ?? 0, BAHAYA_II: o.BAHAYA_II ?? 0, KRITIS: o.KRITIS ?? 0,
      JUMLAH: (o.NORMAL ?? 0) + (o.BAHAYA_I ?? 0) + (o.BAHAYA_II ?? 0) + (o.KRITIS ?? 0),
    }));
  }, [trends, pht]);
}
function useRange<T>(data: T[]) {
  const [days, setDays] = useState('60');
  const view = days === 'all' ? data : data.slice(-Number(days));
  const ctrl = <Select value={days} onChange={setDays} options={[{ value: '30', label: '30 hari' }, { value: '60', label: '60 hari' }, { value: '120', label: '120 hari' }, { value: 'all', label: 'Semua' }]} />;
  return { view, ctrl };
}

function Tren({ trends, error }: { trends: TrendSeries[]; error?: string }) {
  const t = useChartTheme();
  const phts = uniq(trends.flatMap((x) => x.phts));
  const [pht, setPht] = useState('Semua');
  const data = useTrendData(trends, pht);
  const { view, ctrl } = useRange(data);
  if (!trends.length) return <Card><div className="h-title">Data tren tidak dapat dimuat</div><div className="t-muted text-sm">{error}</div></Card>;
  const axis = { tick: { fill: t.axis, fontSize: 10 } };
  const line = (key: string, color: string) => <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2.5} dot={false} name={TEG_LABEL[key] ?? key} />;
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap gap-3 items-end">
        <Select label="Segment Penghantar" value={pht} onChange={setPht} options={[{ value: 'Semua', label: 'Semua (Agregat)' }, ...phts]} className="min-w-[280px]" />
        <label className="flex flex-col gap-1"><span className="t-label">Rentang</span>{ctrl}</label>
        <div className="text-xs t-muted">Sumber: sheet “TREN KRITIS / BAHAYA 1 / BAHAYA 2 / NORMAL” · {data.length} hari{error ? ` · ${error}` : ''}</div>
      </Card>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="1. Tren Tegakan Jumlah">
          <ResponsiveContainer><LineChart data={view}><CartesianGrid stroke={t.grid} /><XAxis dataKey="label" {...axis} minTickGap={20} /><YAxis {...axis} tickFormatter={(v) => fmtNum(v)} /><Tooltip {...t.tooltip} formatter={(v: number) => fmtNum(v)} />{line('JUMLAH', C.cyan)}</LineChart></ResponsiveContainer>
        </ChartCard>
        <Card className="flex flex-col" style={{ borderColor: 'rgba(255,59,59,0.55)', boxShadow: '0 0 14px rgba(255,59,59,0.25)' }}>
          <h3 className="h-section mb-3">2. Tren Tegakan Kritis</h3>
          <div style={{ height: 280 }}>
            <ResponsiveContainer><BarChart data={view}><CartesianGrid stroke={t.grid} vertical={false} /><XAxis dataKey="label" {...axis} minTickGap={20} /><YAxis {...axis} /><Tooltip {...t.tooltip} formatter={(v: number) => [fmtNum(v), 'Kritis']} /><Bar dataKey="KRITIS" fill="#FF2D2D" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
          </div>
        </Card>
        <ChartCard title="3. Tren Tegakan Bahaya 1 dan 2">
          <ResponsiveContainer><LineChart data={view}><CartesianGrid stroke={t.grid} /><XAxis dataKey="label" {...axis} minTickGap={20} /><YAxis {...axis} tickFormatter={(v) => fmtNum(v)} /><Tooltip {...t.tooltip} formatter={(v: number) => fmtNum(v)} /><Legend formatter={(v) => <span style={{ color: t.legend.color }}>{v}</span>} />{line('BAHAYA_I', C.alert)}{line('BAHAYA_II', C.warn)}</LineChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="4. Tren Tegakan Normal">
          <ResponsiveContainer><LineChart data={view}><CartesianGrid stroke={t.grid} /><XAxis dataKey="label" {...axis} minTickGap={20} /><YAxis {...axis} tickFormatter={(v) => fmtNum(v)} /><Tooltip {...t.tooltip} formatter={(v: number) => fmtNum(v)} />{line('NORMAL', C.ok)}</LineChart></ResponsiveContainer>
        </ChartCard>
      </div>
      <ChartCard title="5. Komposisi Status per Hari" height={320}>
        <ResponsiveContainer><BarChart data={view}><CartesianGrid stroke={t.grid} vertical={false} /><XAxis dataKey="label" {...axis} minTickGap={20} /><YAxis {...axis} tickFormatter={(v) => fmtNum(v)} /><Tooltip {...t.tooltip} formatter={(v: number, n: string) => [fmtNum(v), TEG_LABEL[n] ?? n]} /><Legend formatter={(v) => <span style={{ color: t.legend.color }}>{TEG_LABEL[v] ?? v}</span>} />
          {TEG_STATUSES.map((s) => <Bar key={s} dataKey={s} stackId="a" fill={STATUS_COLORS[s]} />)}
        </BarChart></ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

/** Validasi Tegakan — daily decreases of KRITIS / BAHAYA I / BAHAYA II (selisih harian). */
function Validasi({ trends, error }: { trends: TrendSeries[]; error?: string }) {
  const t = useChartTheme();
  const phts = uniq(trends.flatMap((x) => x.phts));
  const [pht, setPht] = useState('Semua');
  const series = useTrendData(trends, pht);
  const daily = useMemo(() => series.slice(1).map((d, i) => {
    const p = series[i];
    const k = Math.max(0, p.KRITIS - d.KRITIS), b1 = Math.max(0, p.BAHAYA_I - d.BAHAYA_I), b2 = Math.max(0, p.BAHAYA_II - d.BAHAYA_II);
    return { date: d.date, label: d.label, KRITIS: k, BAHAYA_I: b1, BAHAYA_II: b2, total: k + b1 + b2 };
  }), [series]);
  const { view, ctrl } = useRange(daily);
  if (!trends.length) return <Card><div className="h-title">Data tren tidak dapat dimuat</div><div className="t-muted text-sm">{error}</div></Card>;
  const sum = (k: 'KRITIS' | 'BAHAYA_I' | 'BAHAYA_II' | 'total') => view.reduce((a, r) => a + r[k], 0);
  type D = (typeof daily)[number];
  const cols: Col<D>[] = [
    { key: 'date', label: 'TANGGAL', value: (r) => r.date, render: (r) => r.label },
    { key: 'KRITIS', label: 'KRITIS', value: (r) => r.KRITIS, render: (r) => fmtNum(r.KRITIS), align: 'right' },
    { key: 'BAHAYA_I', label: 'BAHAYA I', value: (r) => r.BAHAYA_I, render: (r) => fmtNum(r.BAHAYA_I), align: 'right' },
    { key: 'BAHAYA_II', label: 'BAHAYA II', value: (r) => r.BAHAYA_II, render: (r) => fmtNum(r.BAHAYA_II), align: 'right' },
    { key: 'total', label: 'TOTAL', value: (r) => r.total, render: (r) => <b>{fmtNum(r.total)}</b>, align: 'right' },
  ];
  const axis = { tick: { fill: t.axis, fontSize: 10 } };
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap gap-3 items-end">
        <Select label="Segment Penghantar" value={pht} onChange={setPht} options={[{ value: 'Semua', label: 'Semua (Agregat)' }, ...phts]} className="min-w-[280px]" />
        <label className="flex flex-col gap-1"><span className="t-label">Rentang</span>{ctrl}</label>
        <div className="text-xs t-muted">Dihitung dari selisih penurunan harian jumlah Kritis, Bahaya I, Bahaya II.</div>
      </Card>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Validasi" value={fmtNum(sum('total'))} color={C.ok} />
        <StatCard label="Kritis" value={fmtNum(sum('KRITIS'))} color={C.crit} />
        <StatCard label="Bahaya I" value={fmtNum(sum('BAHAYA_I'))} color={C.alert} />
        <StatCard label="Bahaya II" value={fmtNum(sum('BAHAYA_II'))} color={C.warn} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="1. Validasi Harian (Total)">
          <ResponsiveContainer><BarChart data={view}><CartesianGrid stroke={t.grid} vertical={false} /><XAxis dataKey="label" {...axis} minTickGap={20} /><YAxis {...axis} /><Tooltip {...t.tooltip} formatter={(v: number) => [fmtNum(v), 'Total']} /><Bar dataKey="total" fill={C.ok} radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="2. Validasi Harian per Status">
          <ResponsiveContainer><BarChart data={view}><CartesianGrid stroke={t.grid} vertical={false} /><XAxis dataKey="label" {...axis} minTickGap={20} /><YAxis {...axis} /><Tooltip {...t.tooltip} formatter={(v: number, n: string) => [fmtNum(v), TEG_LABEL[n] ?? n]} /><Legend formatter={(v) => <span style={{ color: t.legend.color }}>{TEG_LABEL[v] ?? v}</span>} />
            <Bar dataKey="KRITIS" stackId="a" fill={C.crit} /><Bar dataKey="BAHAYA_I" stackId="a" fill={C.alert} /><Bar dataKey="BAHAYA_II" stackId="a" fill={C.warn} />
          </BarChart></ResponsiveContainer>
        </ChartCard>
      </div>
      <Card><h3 className="h-section mb-3">Detail per Tanggal</h3><SortableTable rows={[...view].reverse()} cols={cols} maxHeight={480} /></Card>
    </div>
  );
}
