import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, AlarmClock, Building2, Clock, FolderOpen, Gauge, RefreshCw, Zap } from 'lucide-react';
import { GangguanData, RekapGangguanData, useData, usePageSources, useSource } from '../lib/data';
import { GangguanRow, RekapGangguanRow } from '../lib/parsers';
import { fmtDate, fmtNum, MONTHS_LONG } from '../lib/sheets';
import { Badge, C, Card, ChartCard, Col, ErrorState, ExportButton, Gate, LIGHT_CHART_THEME, LoadingScreen, Modal, PageHeader, Search, Select, SortableTable, StatCard, Tabs, groupSum, uniq, useChartTheme } from '../components/ui';
import { SimplePie } from '../components/charts';
import { Term } from '../components/Glossary';
import { ExportSheet, XKpis, XSection, XTable } from '../lib/export';

export function gangguanCols(mode: 'all' | 'upt' | 'fois'): Col<GangguanRow>[] {
  const base: Col<GangguanRow>[] = [
    { key: 'no', label: 'NO', value: (r) => +r.no },
    { key: 'tanggal', label: 'TANGGAL', value: (r) => r.tanggal, render: (r) => fmtDate(r.tanggal) },
    { key: 'lokasi', label: 'LOKASI GANGGUAN', value: (r) => r.lokasi, render: (r) => <b>{r.lokasi}</b>, className: 'min-w-[200px]' },
    { key: 'penyebab', label: 'PENYEBAB', value: (r) => r.penyebab },
  ];
  const upt: Col<GangguanRow> = { key: 'statusUpt', label: 'STATUS UPT', value: (r) => r.statusUpt, render: (r) => <Badge status={r.statusUpt} /> };
  const fois: Col<GangguanRow> = { key: 'statusFois', label: 'STATUS FOIS', value: (r) => r.statusFois, render: (r) => <Badge status={r.statusFois} /> };
  const target: Col<GangguanRow> = {
    key: 'target', label: 'TARGET PENUTUPAN', value: (r) => r.target,
    render: (r) => <span>{r.target ? fmtDate(r.target) : r.targetRaw || '—'} {((mode !== 'fois' && r.overdueUpt) || (mode !== 'upt' && r.overdueFois)) && <span className="badge badge-crit ml-1">⚠ OVERDUE</span>}</span>,
  };
  const tl: Col<GangguanRow> = { key: 'tindakLanjut', label: 'TINDAK LANJUT', value: (r) => r.tindakLanjut, render: (r) => <span className="line-clamp-2 max-w-[360px] block whitespace-pre-line">{r.tindakLanjut}</span> };
  if (mode === 'upt') return [...base, upt, target, tl];
  if (mode === 'fois') return [...base, fois, target, upt, tl];
  return [...base, upt, fois, target, tl];
}

export default function Gangguan() {
  usePageSources(['gangguan', 'rekapGangguan']);
  const s = useSource('gangguan');
  const { refresh } = useData();
  return <Gate sources={[s]} onRetry={() => refresh(['gangguan'])} text="Memuat Monitoring Gangguan…">{() => <Body data={s.data!} />}</Gate>;
}

type Tab = 'overview' | 'upt' | 'fois' | 'summary';
function Body({ data }: { data: GangguanData }) {
  const t = useChartTheme();
  const [tab, setTab] = useState<Tab>('overview');
  const [f, setF] = useState({ tahun: 'Semua', penyebab: 'Semua', upt: 'Semua', fois: 'Semua', q: '' });
  const [detail, setDetail] = useState<GangguanRow | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));
  const all = data.rows;
  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return all.filter((r) => (f.tahun === 'Semua' || r.tahun === f.tahun) && (f.penyebab === 'Semua' || r.penyebab === f.penyebab) &&
      (f.upt === 'Semua' || r.statusUpt === f.upt) && (f.fois === 'Semua' || r.statusFois === f.fois) &&
      (!q || `${r.lokasi} ${r.temuan} ${r.tindakLanjut} ${r.penyebab}`.toLowerCase().includes(q)));
  }, [all, f]);
  const openUpt = rows.filter((r) => r.statusUpt === 'OPEN');
  const openFois = rows.filter((r) => r.statusFois === 'OPEN');
  const overdue = rows.filter((r) => r.overdueUpt || r.overdueFois);
  const perYear = uniq(rows.map((r) => r.tahun)).map((y) => ({ tahun: y, CLOSE: rows.filter((r) => r.tahun === y && r.statusUpt === 'CLOSE').length, OPEN: rows.filter((r) => r.tahun === y && r.statusUpt === 'OPEN').length }));
  const axis = { tick: { fill: t.axis, fontSize: 11 } };
  const lg = (v: string) => <span style={{ color: t.legend.color }}>{v}</span>;
  const listFor = tab === 'upt' ? [...rows].sort((a, b) => (b.statusUpt === 'OPEN' ? 1 : 0) - (a.statusUpt === 'OPEN' ? 1 : 0))
    : tab === 'fois' ? [...rows].sort((a, b) => (b.statusFois === 'OPEN' ? 1 : 0) - (a.statusFois === 'OPEN' ? 1 : 0)) : rows;
  const cols = gangguanCols(tab === 'overview' || tab === 'summary' ? 'all' : tab);
  return (
    <div className="space-y-5">
      <PageHeader title="Monitoring Pelaporan & Tindak Lanjut Gangguan" subtitle={<>Sheet UPTBKU · status CLOSE/OPEN <Term term="UPT">UPT</Term> dan CLOSE/OPEN <Term term="FOIS">FOIS</Term>, termasuk target penutupan · tab Summary dari sheet Rekap Gangguan Penghantar</>}
        right={<Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'overview', label: '📊 Overview' }, { id: 'upt', label: '🏢 CLOSE/OPEN UPT' }, { id: 'fois', label: '📁 CLOSE/OPEN FOIS' }, { id: 'summary', label: '📋 SUMMARY GANGGUAN' }]} />} />
      {tab !== 'summary' && (
        <Card className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Select label="Tahun" value={f.tahun} onChange={set('tahun')} options={['Semua', ...uniq(all.map((r) => r.tahun))]} />
          <Select label="Penyebab" value={f.penyebab} onChange={set('penyebab')} options={['Semua', ...uniq(all.map((r) => r.penyebab))]} />
          <Select label="Status UPT" value={f.upt} onChange={set('upt')} options={['Semua', ...uniq(all.map((r) => r.statusUpt))]} />
          <Select label="Status FOIS" value={f.fois} onChange={set('fois')} options={['Semua', ...uniq(all.map((r) => r.statusFois))]} />
          <Search value={f.q} onChange={set('q')} placeholder="Lokasi / temuan…" />
        </Card>
      )}
      {tab !== 'summary' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Gangguan" value={fmtNum(rows.length)} color={C.cyan} icon={<Activity />} />
          <StatCard label={<>OPEN <Term term="UPT">UPT</Term></>} value={fmtNum(openUpt.length)} color={C.warn} icon={<Building2 />} sub={`${fmtNum(rows.length - openUpt.length)} close`} />
          <StatCard label={<>OPEN <Term term="FOIS">FOIS</Term></>} value={fmtNum(openFois.length)} color={C.alert} icon={<FolderOpen />} />
          <StatCard label="Overdue" value={fmtNum(overdue.length)} color={C.crit} icon={<AlarmClock />} sub="target penutupan lewat, masih OPEN" />
        </div>
      )}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          <ChartCard title={<>1. Status <Term term="UPT">UPT</Term></>}><SimplePie data={groupSum(rows, (r) => r.statusUpt || '-')} colors={{ OPEN: C.crit, CLOSE: C.ok }} /></ChartCard>
          <ChartCard title={<>2. Status <Term term="FOIS">FOIS</Term></>}><SimplePie data={groupSum(rows, (r) => r.statusFois || '-')} colors={{ OPEN: C.crit, CLOSE: C.ok }} /></ChartCard>
          <ChartCard title="3. Penyebab Gangguan">
            <ResponsiveContainer><BarChart data={groupSum(rows, (r) => r.penyebab)} layout="vertical" margin={{ left: 10, right: 10 }}><CartesianGrid stroke={t.grid} horizontal={false} /><XAxis type="number" {...axis} allowDecimals={false} /><YAxis type="category" dataKey="name" width={110} tick={{ fill: t.axis, fontSize: 10 }} /><Tooltip {...t.tooltip} formatter={(v: number) => [v, 'Kejadian']} /><Bar dataKey="value" fill={C.bar} radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="4. Tren per Tahun">
            <ResponsiveContainer><BarChart data={perYear}><CartesianGrid stroke={t.grid} vertical={false} /><XAxis dataKey="tahun" {...axis} /><YAxis {...axis} allowDecimals={false} /><Tooltip {...t.tooltip} /><Legend formatter={lg} /><Bar dataKey="CLOSE" stackId="a" fill={C.ok} /><Bar dataKey="OPEN" stackId="a" fill={C.crit} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
          </ChartCard>
        </div>
      )}
      {(tab === 'upt' || tab === 'fois') && (
        <Card>
          <h3 className="h-section mb-2">{tab === 'upt' ? 'Open case UPT' : 'Open case FOIS'} ({fmtNum((tab === 'upt' ? openUpt : openFois).length)})</h3>
          <div className="flex flex-wrap gap-2">
            {(tab === 'upt' ? openUpt : openFois).map((r) => (
              <button key={r.key} className="chip" onClick={() => setDetail(r)} style={{ borderColor: (tab === 'upt' ? r.overdueUpt : r.overdueFois) ? C.crit : undefined }}>
                {(tab === 'upt' ? r.overdueUpt : r.overdueFois) ? '⚠ ' : ''}{r.lokasi} · {fmtDate(r.tanggal)}
              </button>
            ))}
          </div>
        </Card>
      )}
      {tab === 'summary' ? <SummaryTab /> : (
        <Card>
          <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
            <h3 className="h-section">Data Gangguan ({fmtNum(listFor.length)}) — klik baris untuk detail</h3>
            <ExportButton title="Monitoring Gangguan UPTBKU" subtitle={`Tahun ${f.tahun} · Penyebab ${f.penyebab} · UPT ${f.upt} · FOIS ${f.fois}`} cols={cols} rows={listFor} />
          </div>
          <SortableTable rows={listFor} cols={cols} pageSize={50} maxHeight={640} onRowClick={setDetail}
            rowClassName={(r) => ((tab !== 'fois' && r.statusUpt === 'OPEN') || (tab === 'fois' && r.statusFois === 'OPEN') ? 'font-semibold' : '')} />
        </Card>
      )}
      {/* Lembar ringkasan 1 halaman tegak (Export PDF/PNG) — off-screen, lihat src/lib/export.tsx */}
      <ExportSheet meta={{ title: 'Monitoring Gangguan', subtitle: `Tahun ${f.tahun} · Penyebab ${f.penyebab} · UPT ${f.upt} · FOIS ${f.fois}`, fileBase: 'Monitoring_Gangguan' }}>
        <XKpis items={[
          { label: 'Total Gangguan', value: fmtNum(rows.length), sub: 'terfilter', color: C.cyan },
          { label: 'OPEN UPT', value: fmtNum(openUpt.length), sub: `${fmtNum(rows.length - openUpt.length)} close`, color: C.warn },
          { label: 'OPEN FOIS', value: fmtNum(openFois.length), sub: `${fmtNum(rows.length - openFois.length)} close`, color: C.alert },
          { label: 'Overdue', value: fmtNum(overdue.length), sub: 'target lewat, masih OPEN', color: C.crit },
        ]} />
        <XSection title="Penyebab Gangguan" height={200}>
          <ResponsiveContainer><BarChart data={groupSum(rows, (r) => { const p = (r.penyebab || '').trim(); return p && p !== '-' && p !== '—' ? p : 'Tidak diketahui'; }).slice(0, 8)} layout="vertical" margin={{ left: 10, right: 16 }}><CartesianGrid stroke={LIGHT_CHART_THEME.grid} horizontal={false} /><XAxis type="number" tick={{ fill: LIGHT_CHART_THEME.axis, fontSize: 10 }} allowDecimals={false} /><YAxis type="category" dataKey="name" width={110} tick={{ fill: LIGHT_CHART_THEME.axis, fontSize: 10 }} /><Tooltip {...LIGHT_CHART_THEME.tooltip} formatter={(v: number) => [v, 'Kejadian']} /><Bar dataKey="value" fill={C.bar} radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer>
        </XSection>
        <XTable title={`Gangguan OPEN UPT — ${openUpt.length} kasus`} headers={['LOKASI', 'TANGGAL', 'PENYEBAB', 'STATUS UPT', 'TARGET']}
          rows={[...openUpt].sort((a, b) => Number(b.overdueUpt || b.overdueFois) - Number(a.overdueUpt || a.overdueFois)).map((r) => [r.lokasi, fmtDate(r.tanggal), r.penyebab, r.statusUpt, r.target ? fmtDate(r.target) : r.targetRaw || '—'])}
          maxRows={18} />
      </ExportSheet>
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.lokasi} — ${fmtDate(detail.tanggal)} ${detail.jam}` : ''}>
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2"><Badge status={`UPT ${detail.statusUpt}`} /><Badge status={`FOIS ${detail.statusFois || '-'}`} />{detail.statusLuar && <Badge status={`PIHAK LUAR ${detail.statusLuar}`} />}{(detail.overdueUpt || detail.overdueFois) && <Badge status="OVERDUE" />}</div>
            <div><span className="t-label">Penyebab</span><div>{detail.penyebab}</div></div>
            <div><span className="t-label">Target Penutupan</span><div>{detail.target ? fmtDate(detail.target) : detail.targetRaw || '—'}</div></div>
            <div><span className="t-label">Temuan</span><div className="whitespace-pre-line">{detail.temuan || '—'}</div></div>
            <div><span className="t-label">Tindak Lanjut</span><div className="whitespace-pre-line">{detail.tindakLanjut || '—'}</div></div>
            <div><span className="t-label">Progress Tindak Lanjut</span><div className="whitespace-pre-line">{detail.progress || '—'}</div></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ============================================================
 * SUMMARY GANGGUAN — rekap kejadian penghantar dari sheet
 * "INPUT GGN PHT" (spreadsheet Rekap Gangguan Penghantar).
 * Filter dimaksimalkan: tahun, bulan, ULTG, tegangan, penghantar,
 * segmen, aset, penyebab, penyebab detil, status, kode kinerja + cari.
 * ============================================================ */
const SUM_FILTERS = { tahun: 'Semua', bulan: 'Semua', ultg: 'Semua', tegangan: 'Semua', penghantar: 'Semua', segmen: 'Semua', aset: 'Semua', penyebab: 'Semua', penyebabDetil: 'Semua', status: 'Semua', kode: 'Semua', q: '' };

export function rekapCols(): Col<RekapGangguanRow>[] {
  return [
    { key: 'no', label: 'NO', value: (r) => +r.no },
    { key: 'tanggal', label: 'TANGGAL', value: (r) => r.tanggal, render: (r) => fmtDate(r.tanggal) },
    { key: 'ultg', label: 'ULTG', value: (r) => r.ultg },
    { key: 'tegangan', label: 'TEGANGAN (kV)', value: (r) => r.teganganNum ?? null },
    { key: 'penghantar', label: 'PENGHANTAR', value: (r) => r.penghantar, render: (r) => <b>{r.penghantar}</b>, className: 'min-w-[180px]' },
    { key: 'segmen', label: 'SEGMEN', value: (r) => r.segmen },
    { key: 'penyebab', label: 'PENYEBAB', value: (r) => r.penyebab },
    { key: 'status', label: 'STATUS', value: (r) => r.status, render: (r) => <Badge status={r.status} /> },
    { key: 'durasi', label: 'DURASI (Jam)', value: (r) => r.durasi, render: (r) => (r.durasi != null ? fmtNum(r.durasi, 2) : '—') },
    { key: 'ens', label: 'ENS (MWh)', value: (r) => r.ens, render: (r) => (r.ens != null ? fmtNum(r.ens, 2) : '—') },
    { key: 'kode', label: 'KODE KINERJA', value: (r) => r.kodeKinerja },
  ];
}

interface PerPht { penghantar: string; ultg: string; kejadian: number; trip: number; reclose: number; durasi: number; ens: number; tower: string; towerCount: number }
function perPhtCols(): Col<PerPht>[] {
  return [
    { key: 'penghantar', label: 'PENGHANTAR', value: (r) => r.penghantar, render: (r) => <b>{r.penghantar}</b>, className: 'min-w-[180px]' },
    { key: 'ultg', label: 'ULTG', value: (r) => r.ultg },
    { key: 'kejadian', label: 'KEJADIAN', value: (r) => r.kejadian },
    { key: 'trip', label: 'TRIP', value: (r) => r.trip },
    { key: 'reclose', label: 'RECLOSE', value: (r) => r.reclose },
    { key: 'durasi', label: 'DURASI (Jam)', value: (r) => r.durasi, render: (r) => fmtNum(r.durasi, 2) },
    { key: 'ens', label: 'ENS (MWh)', value: (r) => r.ens, render: (r) => fmtNum(r.ens, 2) },
    { key: 'tower', label: 'NO. TOWER TEMUAN', value: (r) => r.towerCount, render: (r) => <span className="line-clamp-2 max-w-[280px] block">{r.tower || '—'}</span> },
  ];
}

function SummaryTab() {
  const { refresh } = useData();
  const s = useSource('rekapGangguan');
  if (s.status === 'error') return <ErrorState title="Summary Gangguan tidak dapat dimuat" detail={s.error} onRetry={() => refresh(['rekapGangguan'])} />;
  if (s.status !== 'ok' || !s.data) return <LoadingScreen text="Memuat Summary Gangguan…" />;
  return <SummaryBody data={s.data} />;
}

function SummaryBody({ data }: { data: RekapGangguanData }) {
  const t = useChartTheme();
  const [fs, setFs] = useState({ ...SUM_FILTERS });
  const [detail, setDetail] = useState<RekapGangguanRow | null>(null);
  const set = (k: keyof typeof fs) => (v: string) => setFs((o) => ({ ...o, [k]: v }));
  const all = data.rows;
  const srows = useMemo(() => {
    const q = fs.q.trim().toLowerCase();
    return all.filter((r) =>
      (fs.tahun === 'Semua' || r.tahun === fs.tahun) && (fs.bulan === 'Semua' || r.bulan === fs.bulan) &&
      (fs.ultg === 'Semua' || r.ultg === fs.ultg) && (fs.tegangan === 'Semua' || r.tegangan === fs.tegangan) &&
      (fs.penghantar === 'Semua' || r.penghantar === fs.penghantar) && (fs.segmen === 'Semua' || r.segmen === fs.segmen) &&
      (fs.aset === 'Semua' || r.aset === fs.aset) && (fs.penyebab === 'Semua' || r.penyebab === fs.penyebab) &&
      (fs.penyebabDetil === 'Semua' || r.penyebabDetil === fs.penyebabDetil) &&
      (fs.status === 'Semua' || r.status === fs.status) && (fs.kode === 'Semua' || r.kodeKinerja === fs.kode) &&
      (!q || `${r.penghantar} ${r.segmen} ${r.temuan} ${r.keterangan} ${r.penyebabDetil} ${r.penyebab}`.toLowerCase().includes(q)));
  }, [all, fs]);
  const bulanOpts = ['Semua', ...uniq(all.map((r) => r.bulan)).sort((a, b) => MONTHS_LONG.indexOf(a.toUpperCase()) - MONTHS_LONG.indexOf(b.toUpperCase()))];
  const tegOpts = ['Semua', ...uniq(all.map((r) => r.tegangan)).sort((a, b) => (+a || 0) - (+b || 0))];
  const trip = srows.filter((r) => r.status === 'TRIP');
  const reclose = srows.filter((r) => r.status === 'RECLOSE');
  const totDurasi = srows.reduce((a, r) => a + (r.durasi ?? 0), 0);
  const totEns = srows.reduce((a, r) => a + (r.ens ?? 0), 0);
  const perYear = uniq(srows.map((r) => r.tahun)).map((y) => ({ tahun: y, TRIP: srows.filter((r) => r.tahun === y && r.status === 'TRIP').length, RECLOSE: srows.filter((r) => r.tahun === y && r.status === 'RECLOSE').length }));
  const perPht = useMemo(() => {
    const m = new Map<string, PerPht>();
    const towers = new Map<string, { nums: Set<number>; other: Set<string> }>();
    for (const r of srows) {
      const k = r.penghantar;
      const cur = m.get(k) ?? { penghantar: k, ultg: r.ultg, kejadian: 0, trip: 0, reclose: 0, durasi: 0, ens: 0, tower: '', towerCount: 0 };
      cur.kejadian += 1;
      if (r.status === 'TRIP') cur.trip += 1;
      if (r.status === 'RECLOSE') cur.reclose += 1;
      cur.durasi += r.durasi ?? 0;
      cur.ens += r.ens ?? 0;
      m.set(k, cur);
      // NO. TOWER TEMUAN: gabung nomor tower unik dari semua kejadian penghantar ini
      const tw = towers.get(k) ?? { nums: new Set<number>(), other: new Set<string>() };
      for (const tok of r.towerTemuan.split(',')) {
        const t = tok.trim();
        if (!t) continue;
        if (/^\d+$/.test(t)) tw.nums.add(+t);
        else tw.other.add(t);
      }
      towers.set(k, tw);
    }
    return [...m.values()].map((p) => {
      const tw = towers.get(p.penghantar)!;
      const nums = [...tw.nums].sort((a, b) => a - b).map(String);
      const tower = [...nums, ...[...tw.other].sort()].join(', ');
      return { ...p, tower, towerCount: tw.nums.size + tw.other.size };
    }).sort((a, b) => b.kejadian - a.kejadian || b.ens - a.ens);
  }, [srows]);
  const axis = { tick: { fill: t.axis, fontSize: 11 } };
  const lg = (v: string) => <span style={{ color: t.legend.color }}>{v}</span>;
  const filterSub = `Tahun ${fs.tahun} · Bulan ${fs.bulan} · ULTG ${fs.ultg} · ${fs.tegangan} kV · Penyebab ${fs.penyebab} · Status ${fs.status}`;
  return (
    <div className="space-y-5">
      <Card>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Select label="Tahun" value={fs.tahun} onChange={set('tahun')} options={['Semua', ...uniq(all.map((r) => r.tahun))]} />
          <Select label="Bulan" value={fs.bulan} onChange={set('bulan')} options={bulanOpts} />
          <Select label="ULTG" value={fs.ultg} onChange={set('ultg')} options={['Semua', ...uniq(all.map((r) => r.ultg))]} />
          <Select label="Tegangan (kV)" value={fs.tegangan} onChange={set('tegangan')} options={tegOpts} />
          <Select label="Penghantar" value={fs.penghantar} onChange={set('penghantar')} options={['Semua', ...uniq(all.map((r) => r.penghantar))]} />
          <Select label="Segmen" value={fs.segmen} onChange={set('segmen')} options={['Semua', ...uniq(all.map((r) => r.segmen))]} />
          <Select label="Aset" value={fs.aset} onChange={set('aset')} options={['Semua', ...uniq(all.map((r) => r.aset))]} />
          <Select label="Penyebab" value={fs.penyebab} onChange={set('penyebab')} options={['Semua', ...uniq(all.map((r) => r.penyebab))]} />
          <Select label="Penyebab Detil" value={fs.penyebabDetil} onChange={set('penyebabDetil')} options={['Semua', ...uniq(all.map((r) => r.penyebabDetil))]} />
          <Select label="Status" value={fs.status} onChange={set('status')} options={['Semua', ...uniq(all.map((r) => r.status))]} />
          <Select label="Kode Kinerja" value={fs.kode} onChange={set('kode')} options={['Semua', ...uniq(all.map((r) => r.kodeKinerja))]} />
          <Search value={fs.q} onChange={set('q')} placeholder="Penghantar / segmen / temuan…" />
        </div>
        <div className="flex justify-end mt-3">
          <button className="btn" onClick={() => setFs({ ...SUM_FILTERS })}>↺ Reset Filter</button>
        </div>
      </Card>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total Kejadian" value={fmtNum(srows.length)} color={C.cyan} icon={<Activity />} sub={`${fmtNum(all.length)} semua tahun`} />
        <StatCard label="Trip" value={fmtNum(trip.length)} color={C.crit} icon={<Zap />} sub={`${srows.length ? fmtNum((trip.length / srows.length) * 100, 1) : '0'}% dari terfilter`} />
        <StatCard label="Reclose" value={fmtNum(reclose.length)} color={C.ok} icon={<RefreshCw />} sub={`${srows.length ? fmtNum((reclose.length / srows.length) * 100, 1) : '0'}% dari terfilter`} />
        <StatCard label="Total Durasi" value={fmtNum(totDurasi, 2)} color={C.warn} icon={<Clock />} sub="jam (yang tercatat)" />
        <StatCard label="Total ENS" value={fmtNum(totEns, 1)} color={C.alert} icon={<Gauge />} sub="MWh (yang tercatat)" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        <ChartCard title="1. Status (Trip / Reclose)"><SimplePie data={groupSum(srows, (r) => r.status || '-')} colors={{ TRIP: C.crit, RECLOSE: C.ok }} /></ChartCard>
        <ChartCard title="2. Penyebab Gangguan">
          <ResponsiveContainer><BarChart data={groupSum(srows, (r) => r.penyebab).slice(0, 8)} layout="vertical" margin={{ left: 10, right: 10 }}><CartesianGrid stroke={t.grid} horizontal={false} /><XAxis type="number" {...axis} allowDecimals={false} /><YAxis type="category" dataKey="name" width={110} tick={{ fill: t.axis, fontSize: 10 }} /><Tooltip {...t.tooltip} formatter={(v: number) => [v, 'Kejadian']} /><Bar dataKey="value" fill={C.bar} radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="3. Kejadian per ULTG">
          <ResponsiveContainer><BarChart data={groupSum(srows, (r) => r.ultg)}><CartesianGrid stroke={t.grid} vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} allowDecimals={false} /><Tooltip {...t.tooltip} formatter={(v: number) => [v, 'Kejadian']} /><Bar dataKey="value" fill={C.bar} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="4. Tren per Tahun">
          <ResponsiveContainer><BarChart data={perYear}><CartesianGrid stroke={t.grid} vertical={false} /><XAxis dataKey="tahun" {...axis} /><YAxis {...axis} allowDecimals={false} /><Tooltip {...t.tooltip} /><Legend formatter={lg} /><Bar dataKey="RECLOSE" stackId="a" fill={C.ok} /><Bar dataKey="TRIP" stackId="a" fill={C.crit} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="5. Top 10 Penghantar">
          <ResponsiveContainer><BarChart data={perPht.slice(0, 10).map((p) => ({ name: p.penghantar, value: p.kejadian }))} layout="vertical" margin={{ left: 10, right: 10 }}><CartesianGrid stroke={t.grid} horizontal={false} /><XAxis type="number" {...axis} allowDecimals={false} /><YAxis type="category" dataKey="name" width={150} tick={{ fill: t.axis, fontSize: 10 }} /><Tooltip {...t.tooltip} formatter={(v: number) => [v, 'Kejadian']} /><Bar dataKey="value" fill={C.bar} radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="6. ENS per Penyebab (MWh)">
          <ResponsiveContainer><BarChart data={groupSum(srows, (r) => r.penyebab, (r) => r.ens ?? 0).slice(0, 8)} layout="vertical" margin={{ left: 10, right: 10 }}><CartesianGrid stroke={t.grid} horizontal={false} /><XAxis type="number" {...axis} /><YAxis type="category" dataKey="name" width={110} tick={{ fill: t.axis, fontSize: 10 }} /><Tooltip {...t.tooltip} formatter={(v: number) => [fmtNum(v, 1), 'MWh']} /><Bar dataKey="value" fill={C.alert} radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer>
        </ChartCard>
      </div>
      <Card>
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <h3 className="h-section">Rekap per Penghantar ({fmtNum(perPht.length)})</h3>
          <ExportButton title="Summary Gangguan UPTBKU — Rekap per Penghantar" subtitle={filterSub} cols={perPhtCols()} rows={perPht} />
        </div>
        <SortableTable rows={perPht} cols={perPhtCols()} pageSize={15} maxHeight={520} />
      </Card>
      <Card>
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <h3 className="h-section">Data Gangguan Penghantar ({fmtNum(srows.length)}) — klik baris untuk detail</h3>
          <ExportButton title="Summary Gangguan UPTBKU" subtitle={filterSub} cols={rekapCols()} rows={srows} />
        </div>
        <SortableTable rows={srows} cols={rekapCols()} pageSize={50} maxHeight={640} onRowClick={setDetail}
          rowClassName={(r) => (r.status === 'TRIP' ? 'font-semibold' : '')} />
      </Card>
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.penghantar} — ${fmtDate(detail.tanggal)} ${detail.jamGgn}` : ''}>
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2"><Badge status={detail.status} /><Badge status={`${detail.ultg} · ${detail.tegangan} kV`} /><Badge status={`KODE ${detail.kodeKinerja}`} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><span className="t-label">Segmen</span><div>{detail.segmen || '—'}</div></div>
              <div><span className="t-label">Aset</span><div>{detail.aset || '—'}</div></div>
              <div><span className="t-label">Penyebab</span><div>{detail.penyebab}{detail.penyebabDetil ? ` — ${detail.penyebabDetil}` : ''}</div></div>
              <div><span className="t-label">Status</span><div>{detail.status}{detail.ketStatus ? ` (${detail.ketStatus})` : ''}</div></div>
              <div><span className="t-label">Gangguan</span><div>{detail.tglGgn ? fmtDate(detail.tglGgn) : '—'} {detail.jamGgn}</div></div>
              <div><span className="t-label">Normal</span><div>{detail.tglNormal ? fmtDate(detail.tglNormal) : '—'} {detail.jamNormal}</div></div>
              <div><span className="t-label">Durasi</span><div>{detail.durasi != null ? `${fmtNum(detail.durasi, 2)} jam` : '—'}</div></div>
              <div><span className="t-label">ENS</span><div>{detail.ens != null ? `${fmtNum(detail.ens, 2)} MWh` : '—'}</div></div>
            </div>
            <div><span className="t-label">Temuan</span><div className="whitespace-pre-line">{detail.temuan || '—'}</div></div>
            <div><span className="t-label">No. Tower Temuan</span><div>{detail.towerTemuan || '—'}</div></div>
            <div><span className="t-label">Analisa DFR</span><div className="whitespace-pre-line">{detail.analisaDfr || '—'}</div></div>
            <div><span className="t-label">Temuan Lapangan</span><div className="whitespace-pre-line">{detail.temuanLapangan || '—'}</div></div>
            <div><span className="t-label">Evaluasi Kinerja DFR</span><div className="whitespace-pre-line">{detail.evaluasiKinerja || '—'}</div></div>
            <div><span className="t-label">Keterangan Tambahan</span><div className="whitespace-pre-line">{detail.keterangan || '—'}</div></div>
            {detail.linkAnev && <div><span className="t-label">Link Anev</span><div><a href={detail.linkAnev} target="_blank" rel="noreferrer" className="text-sky-400 underline break-all">{detail.linkAnev}</a></div></div>}
          </div>
        )}
      </Modal>
    </div>
  );
}
