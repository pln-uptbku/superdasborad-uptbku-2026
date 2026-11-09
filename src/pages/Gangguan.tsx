import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, AlarmClock, FolderOpen, Building2 } from 'lucide-react';
import { GangguanData, useData, usePageSources, useSource } from '../lib/data';
import { GangguanRow } from '../lib/parsers';
import { fmtDate, fmtNum } from '../lib/sheets';
import { Badge, C, Card, ChartCard, Col, ExportButton, Gate, LIGHT_CHART_THEME, Modal, PageHeader, Search, Select, SortableTable, StatCard, Tabs, groupSum, uniq, useChartTheme } from '../components/ui';
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
  usePageSources(['gangguan']);
  const s = useSource('gangguan');
  const { refresh } = useData();
  return <Gate sources={[s]} onRetry={() => refresh(['gangguan'])} text="Memuat Monitoring Gangguan…">{() => <Body data={s.data!} />}</Gate>;
}

type Tab = 'overview' | 'upt' | 'fois';
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
  const cols = gangguanCols(tab === 'overview' ? 'all' : tab);
  return (
    <div className="space-y-5">
      <PageHeader title="Monitoring Pelaporan & Tindak Lanjut Gangguan" subtitle={<>Sheet UPTBKU · status CLOSE/OPEN <Term term="UPT">UPT</Term> dan CLOSE/OPEN <Term term="FOIS">FOIS</Term>, termasuk target penutupan</>}
        right={<Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'overview', label: '📊 Overview' }, { id: 'upt', label: '🏢 CLOSE/OPEN UPT' }, { id: 'fois', label: '📁 CLOSE/OPEN FOIS' }]} />} />
      <Card className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Select label="Tahun" value={f.tahun} onChange={set('tahun')} options={['Semua', ...uniq(all.map((r) => r.tahun))]} />
        <Select label="Penyebab" value={f.penyebab} onChange={set('penyebab')} options={['Semua', ...uniq(all.map((r) => r.penyebab))]} />
        <Select label="Status UPT" value={f.upt} onChange={set('upt')} options={['Semua', ...uniq(all.map((r) => r.statusUpt))]} />
        <Select label="Status FOIS" value={f.fois} onChange={set('fois')} options={['Semua', ...uniq(all.map((r) => r.statusFois))]} />
        <Search value={f.q} onChange={set('q')} placeholder="Lokasi / temuan…" />
      </Card>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Gangguan" value={fmtNum(rows.length)} color={C.cyan} icon={<Activity />} />
        <StatCard label={<>OPEN <Term term="UPT">UPT</Term></>} value={fmtNum(openUpt.length)} color={C.warn} icon={<Building2 />} sub={`${fmtNum(rows.length - openUpt.length)} close`} />
        <StatCard label={<>OPEN <Term term="FOIS">FOIS</Term></>} value={fmtNum(openFois.length)} color={C.alert} icon={<FolderOpen />} />
        <StatCard label="Overdue" value={fmtNum(overdue.length)} color={C.crit} icon={<AlarmClock />} sub="target penutupan lewat, masih OPEN" />
      </div>
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
      {tab !== 'overview' && (
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
      <Card>
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <h3 className="h-section">Data Gangguan ({fmtNum(listFor.length)}) — klik baris untuk detail</h3>
          <ExportButton title="Monitoring Gangguan UPTBKU" subtitle={`Tahun ${f.tahun} · Penyebab ${f.penyebab} · UPT ${f.upt} · FOIS ${f.fois}`} cols={cols} rows={listFor} />
        </div>
        <SortableTable rows={listFor} cols={cols} pageSize={50} maxHeight={640} onRowClick={setDetail}
          rowClassName={(r) => ((tab !== 'fois' && r.statusUpt === 'OPEN') || (tab === 'fois' && r.statusFois === 'OPEN') ? 'font-semibold' : '')} />
      </Card>
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
