import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Axe, Scissors, TreePine, AlertOctagon } from 'lucide-react';
import { PenebanganData, useData, usePageSources, useSource } from '../lib/data';
import { PenebanganRow } from '../lib/parsers';
import { fmtDate, fmtNum, MONTHS_SHORT } from '../lib/sheets';
import { Badge, C, Card, ChartCard, Col, ExportButton, Gate, LIGHT_CHART_THEME, PageHeader, Select, SortableTable, StatCard, Tabs, groupSum, uniq, useChartTheme } from '../components/ui';
import { SimplePie } from '../components/charts';
import { ExportSheet, XKpis, XSection, XTable } from '../lib/export';

export const PEN_STATUS_COLORS: Record<string, string> = { KRITIS: C.crit, 'BAHAYA 1': C.alert, 'BAHAYA 2': C.warn, WASPADA: C.blue, AMAN: C.ok };
const statusGroup = (s: string) => (s.includes('KRITIS') ? 'KRITIS' : s.includes('BAHAYA') ? 'BAHAYA' : 'AMAN');

export function penebanganYear(rows: PenebanganRow[], year: number) {
  const r = rows.filter((x) => x.tahun === year);
  const sum = (f: (x: PenebanganRow) => boolean) => r.filter(f).reduce((a, x) => a + x.jumlah, 0);
  return { total: sum(() => true), tebang: sum((x) => x.tindakan.includes('TEBANG')), pangkas: sum((x) => x.tindakan.includes('PANGKAS')), records: r.length, kritis: sum((x) => x.status.includes('KRITIS')) };
}

export default function Penebangan() {
  usePageSources(['penebangan']);
  const s = useSource('penebangan');
  const { refresh } = useData();
  return <Gate sources={[s]} onRetry={() => refresh(['penebangan'])} text="Memuat Realisasi Penebangan…">{() => <Body data={s.data!} />}</Gate>;
}

type View = 'UPT' | 'PEKALONGAN' | 'LAHAT';
function Body({ data }: { data: PenebanganData }) {
  const t = useChartTheme();
  const years = uniq(data.rows.map((r) => String(r.tahun)));
  const curYear = String(new Date().getFullYear());
  const [view, setView] = useState<View>('UPT');
  const [year, setYear] = useState(years.includes(curYear) ? curYear : years[years.length - 1] ?? 'Semua');
  const [status, setStatus] = useState('Semua');
  const statuses = uniq(data.rows.map((r) => r.status));
  const base = useMemo(() => data.rows.filter((r) => (view === 'UPT' || r.ultg === view) && (status === 'Semua' || r.status === status)), [data.rows, view, status]);
  const rows = useMemo(() => base.filter((r) => year === 'Semua' || String(r.tahun) === year), [base, year]);
  const sum = (f: (x: PenebanganRow) => boolean) => rows.filter(f).reduce((a, x) => a + x.jumlah, 0);
  const total = sum(() => true);

  const monthly = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const r = rows.filter((x) => x.bulanNo === i + 1);
    const o: Record<string, any> = { bulan: MONTHS_SHORT[i] };
    for (const x of r) o[x.status] = (o[x.status] ?? 0) + x.jumlah;
    return o;
  }), [rows]);
  const daily = useMemo(() => {
    const m = new Map<number, { date: Date; label: string; KRITIS: number; BAHAYA: number; AMAN: number; TEBANG: number; PANGKAS: number }>();
    for (const x of rows) {
      if (!x.tanggal) continue;
      const k = x.tanggal.getTime();
      const o = m.get(k) ?? { date: x.tanggal, label: `${String(x.tanggal.getDate()).padStart(2, '0')}/${String(x.tanggal.getMonth() + 1).padStart(2, '0')}`, KRITIS: 0, BAHAYA: 0, AMAN: 0, TEBANG: 0, PANGKAS: 0 };
      o[statusGroup(x.status)] += x.jumlah;
      if (x.tindakan.includes('PANGKAS')) o.PANGKAS += x.jumlah; else o.TEBANG += x.jumlah;
      m.set(k, o);
    }
    return [...m.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [rows]);
  const perYear = useMemo(() => years.map((y) => {
    const r = base.filter((x) => String(x.tahun) === y);
    return { tahun: y, PEKALONGAN: r.filter((x) => x.ultg === 'PEKALONGAN').reduce((a, x) => a + x.jumlah, 0), LAHAT: r.filter((x) => x.ultg === 'LAHAT').reduce((a, x) => a + x.jumlah, 0) };
  }), [base, years]);
  const perSection = groupSum(rows, (r) => r.section, (r) => r.jumlah).slice(0, 15);
  const tindakan = groupSum(rows, (r) => r.tindakan || '-', (r) => r.jumlah);
  const statusDist = groupSum(rows, (r) => r.status, (r) => r.jumlah);
  const tt = { tebang: daily.reduce((a, d) => a + d.TEBANG, 0), pangkas: daily.reduce((a, d) => a + d.PANGKAS, 0) };
  const ylabel = year === 'Semua' ? '2024–2026' : year;
  const axis = { tick: { fill: t.axis, fontSize: 10 } };
  const lg = (v: string) => <span style={{ color: t.legend.color }}>{v}</span>;

  const cols: Col<PenebanganRow>[] = [
    { key: 'ultg', label: 'ULTG', value: (r) => r.ultg },
    { key: 'tahun', label: 'TAHUN', value: (r) => r.tahun },
    { key: 'bulanNo', label: 'BULAN', value: (r) => r.bulanNo, render: (r) => r.bulan },
    { key: 'section', label: 'SECTION', value: (r) => r.section, className: 'min-w-[200px]' },
    { key: 'tower', label: 'TOWER', value: (r) => r.tower },
    { key: 'tanggal', label: 'TANGGAL', value: (r) => r.tanggal, render: (r) => fmtDate(r.tanggal) },
    { key: 'pohon', label: 'NAMA POHON', value: (r) => r.pohon },
    { key: 'status', label: 'STATUS', value: (r) => r.status, render: (r) => <Badge status={r.status} /> },
    { key: 'ukuran', label: 'UKURAN', value: (r) => r.ukuran },
    { key: 'jumlah', label: 'JUMLAH', value: (r) => r.jumlah, render: (r) => <b>{fmtNum(r.jumlah)}</b>, align: 'right' },
    { key: 'tindakan', label: 'TINDAKAN', value: (r) => r.tindakan },
    { key: 'keterangan', label: 'KETERANGAN', value: (r) => r.keterangan },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Realisasi Penebangan" subtitle="Sumber: ULTG PEKALONGAN 2024-2026 & ULTG LAHAT 2024-2026"
        right={<Tabs<View> value={view} onChange={setView} tabs={[{ id: 'UPT', label: 'UPT Bengkulu' }, { id: 'PEKALONGAN', label: 'ULTG Pekalongan' }, { id: 'LAHAT', label: 'ULTG Lahat' }]} />} />
      <Card className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Select label="Tahun" value={year} onChange={setYear} options={['Semua', ...years]} />
        <Select label="Status" value={status} onChange={setStatus} options={['Semua', ...statuses]} />
      </Card>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label={`Total Pohon ${ylabel}`} value={fmtNum(total)} color={C.cyan} icon={<TreePine />} sub={`${fmtNum(rows.length)} record`} />
        <StatCard label="Status Kritis" value={fmtNum(sum((x) => x.status.includes('KRITIS')))} color={C.crit} icon={<AlertOctagon />} />
        <StatCard label="Penebangan" value={fmtNum(sum((x) => x.tindakan.includes('TEBANG')))} color={C.ok} icon={<Axe />} />
        <StatCard label="Pemangkasan" value={fmtNum(sum((x) => x.tindakan.includes('PANGKAS')))} color={C.blue} icon={<Scissors />} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title={`1. Tren Realisasi Penebangan ${ylabel} (per bulan)`}>
          <ResponsiveContainer><BarChart data={monthly}><CartesianGrid stroke={t.grid} vertical={false} /><XAxis dataKey="bulan" {...axis} /><YAxis {...axis} /><Tooltip {...t.tooltip} formatter={(v: number) => fmtNum(v)} /><Legend formatter={lg} />
            {statuses.map((s) => <Bar key={s} dataKey={s} stackId="a" fill={PEN_STATUS_COLORS[s] ?? C.purple} />)}
          </BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title={`2. Progres Harian ${ylabel}`} right={<span className="text-[11px] t-muted">{daily.length} hari</span>}>
          <ResponsiveContainer><BarChart data={daily}><CartesianGrid stroke={t.grid} vertical={false} /><XAxis dataKey="label" {...axis} minTickGap={14} /><YAxis {...axis} /><Tooltip {...t.tooltip} labelFormatter={(_, p: any) => (p?.[0] ? fmtDate(p[0].payload.date) : '')} formatter={(v: number) => fmtNum(v)} /><Legend formatter={lg} />
            <Bar dataKey="KRITIS" stackId="a" fill={C.crit} /><Bar dataKey="BAHAYA" stackId="a" fill={C.alert} /><Bar dataKey="AMAN" stackId="a" fill={C.ok} />
          </BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="3. Distribusi Status Pohon"><SimplePie data={statusDist} colors={PEN_STATUS_COLORS} /></ChartCard>
        <ChartCard title="4. Perbandingan per Tahun">
          <ResponsiveContainer><BarChart data={perYear}><CartesianGrid stroke={t.grid} vertical={false} /><XAxis dataKey="tahun" {...axis} /><YAxis {...axis} tickFormatter={(v) => fmtNum(v)} /><Tooltip {...t.tooltip} formatter={(v: number) => fmtNum(v)} /><Legend formatter={lg} />
            {view !== 'LAHAT' && <Bar dataKey="PEKALONGAN" fill={C.blue} radius={[4, 4, 0, 0]} />}{view !== 'PEKALONGAN' && <Bar dataKey="LAHAT" fill={C.gold} radius={[4, 4, 0, 0]} />}
          </BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="5. Jenis Tindakan"><SimplePie data={tindakan} colors={{ TEBANG: C.crit, PANGKAS: C.blue }} /></ChartCard>
        <ChartCard title={`6. Harian Tebang vs Pangkas ${ylabel}`} right={<span className="text-[11px] t-accent font-bold">T: {fmtNum(tt.tebang)} · P: {fmtNum(tt.pangkas)}</span>}>
          <ResponsiveContainer><BarChart data={daily}><CartesianGrid stroke={t.grid} vertical={false} /><XAxis dataKey="label" {...axis} minTickGap={14} /><YAxis {...axis} /><Tooltip {...t.tooltip} labelFormatter={(_, p: any) => (p?.[0] ? fmtDate(p[0].payload.date) : '')} formatter={(v: number) => fmtNum(v)} /><Legend formatter={lg} />
            <Bar dataKey="TEBANG" stackId="a" fill={C.crit} /><Bar dataKey="PANGKAS" stackId="a" fill={C.blue} />
          </BarChart></ResponsiveContainer>
        </ChartCard>
      </div>
      <ChartCard title="7. Realisasi per Section (Top 15)" height={Math.max(260, perSection.length * 26)}>
        <ResponsiveContainer><BarChart data={perSection} layout="vertical" margin={{ left: 20, right: 20 }}><CartesianGrid stroke={t.grid} horizontal={false} /><XAxis type="number" {...axis} /><YAxis type="category" dataKey="name" width={200} {...axis} /><Tooltip {...t.tooltip} formatter={(v: number) => [fmtNum(v), 'Pohon']} /><Bar dataKey="value" fill={C.bar} radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer>
      </ChartCard>
      <Card>
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <h3 className="h-section">Detail Realisasi ({fmtNum(rows.length)} record)</h3>
          <ExportButton title="Realisasi Penebangan" subtitle={`${view === 'UPT' ? 'UPT Bengkulu' : 'ULTG ' + view} · Tahun ${ylabel} · Status ${status}`} cols={cols} rows={rows} />
        </div>
        <SortableTable rows={rows} cols={cols} pageSize={50} maxHeight={620} />
      </Card>

      {/* Lembar ringkasan 1 halaman tegak (Export PDF/PNG) — off-screen, lihat src/lib/export.tsx */}
      <ExportSheet meta={{ title: 'Realisasi Penebangan', subtitle: `${view === 'UPT' ? 'UPT Bengkulu' : `ULTG ${view}`} · Tahun ${ylabel} · Status ${status}`, fileBase: 'Realisasi_Penebangan' }}>
        <XKpis items={[
          { label: `Total Pohon ${ylabel}`, value: fmtNum(total), sub: `${fmtNum(rows.length)} record`, color: C.cyan },
          { label: 'Status Kritis', value: fmtNum(sum((x) => x.status.includes('KRITIS'))), color: C.crit },
          { label: 'Penebangan', value: fmtNum(sum((x) => x.tindakan.includes('TEBANG'))), color: C.ok },
          { label: 'Pemangkasan', value: fmtNum(sum((x) => x.tindakan.includes('PANGKAS'))), color: C.blue },
        ]} />
        <XSection title={`Tren Realisasi Penebangan ${ylabel} (per bulan)`} height={210}>
          <ResponsiveContainer><BarChart data={monthly}><CartesianGrid stroke={LIGHT_CHART_THEME.grid} vertical={false} /><XAxis dataKey="bulan" tick={{ fill: LIGHT_CHART_THEME.axis, fontSize: 10 }} /><YAxis tick={{ fill: LIGHT_CHART_THEME.axis, fontSize: 10 }} /><Tooltip {...LIGHT_CHART_THEME.tooltip} formatter={(v: number) => fmtNum(v)} /><Legend formatter={(v) => <span style={{ color: LIGHT_CHART_THEME.legend.color }}>{v}</span>} />
            {statuses.map((s) => <Bar key={s} dataKey={s} stackId="a" fill={PEN_STATUS_COLORS[s] ?? C.purple} />)}
          </BarChart></ResponsiveContainer>
        </XSection>
        <XTable title="Realisasi per Section — Top 8" headers={['SECTION', 'JUMLAH', '% DARI TOTAL']}
          aligns={['left', 'right', 'right']}
          rows={perSection.map((d) => [d.name.length > 40 ? `${d.name.slice(0, 40)}…` : d.name, fmtNum(d.value), `${total ? ((d.value / total) * 100).toFixed(1) : '0'}%`])}
          maxRows={8} />
      </ExportSheet>
    </div>
  );
}
