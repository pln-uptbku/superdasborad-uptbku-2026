import React, { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, AlertTriangle, XCircle, Gauge } from 'lucide-react';
import { useData, usePageSources, useSource } from '../lib/data';
import { NkoMonth, NkoRow, pctOf } from '../lib/parsers';
import { fmtAuto, fmtNum, MONTHS_LONG, MONTHS_SHORT } from '../lib/sheets';
import { Badge, C, Card, ChartCard, Col, Gate, PageHeader, Select, SortableTable, StatCard, useChartTheme } from '../components/ui';
import { NkoBobotNilaiChart, SimplePie, pctColor } from '../components/charts';
import AnalisaNko from '../components/AnalisaNko';
import { Term } from '../components/Glossary';
import { ExportSheet, XKpis, XNote, XTable } from '../lib/export';
import { useLocation } from 'react-router-dom';

export function MonthChips({ months, value, onChange }: { months: NkoMonth[]; value: number; onChange: (m: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {months.map((m) => (
        <button key={m.monthNo} className={`chip ${value === m.monthNo ? 'chip-on' : ''}`} onClick={() => onChange(m.monthNo)}>{MONTHS_SHORT[m.monthNo - 1]}</button>
      ))}
    </div>
  );
}

export const indicatorsOf = (m: NkoMonth) => m.rows.filter((r) => r.kind === 'indicator');
export function statusCounts(m: NkoMonth) {
  const ind = indicatorsOf(m).filter((r) => !r.penalty);
  return { BAIK: ind.filter((r) => r.status === 'BAIK').length, MASALAH: ind.filter((r) => r.status === 'MASALAH').length, 'HATI-HATI': ind.filter((r) => r.status === 'HATI-HATI').length };
}
/** Lowest-performing MASALAH / HATI-HATI indicator. */
export function lowestProblem(m: NkoMonth): NkoRow | null {
  const bad = indicatorsOf(m).filter((r) => r.status === 'MASALAH' || r.status === 'HATI-HATI');
  if (!bad.length) return null;
  return bad.sort((a, b) => (pctOf(a) ?? 0) - (pctOf(b) ?? 0))[0];
}

function KpiTable({ month, showComponents }: { month: NkoMonth; showComponents: boolean }) {
  const rows = month.rows.filter((r) => showComponents || r.kind !== 'component');
  const bln = MONTHS_SHORT[month.monthNo - 1];
  const cols: Col<NkoRow>[] = [
    { key: 'no', label: 'NO', value: (r) => r.no || null, render: (r) => <span className="font-bold t-accent">{r.no}</span> },
    { key: 'name', label: 'INDIKATOR', value: (r) => r.name, render: (r) => <span className={r.kind === 'component' ? 't-muted pl-4 italic' : 'font-semibold'}>{r.name}</span>, className: 'min-w-[260px]' },
    { key: 'bobot', label: 'BOBOT', value: (r) => r.bobotNum, render: (r) => r.bobot, align: 'right' },
    { key: 'satuan', label: 'SATUAN', value: (r) => r.satuan },
    { key: 'targetSd', label: `TARGET S.D ${bln}`, value: (r) => r.targetSd, render: (r) => r.targetSdRaw ? fmtAuto(r.targetSd) : '', align: 'right' },
    { key: 'realSd', label: `REALISASI S.D ${bln}`, value: (r) => r.realSd, render: (r) => r.realSdRaw ? fmtAuto(r.realSd) : '', align: 'right' },
    { key: 'pct100', label: '% (100%)', value: (r) => r.pct100, render: (r) => r.kind === 'indicator' ? (r.pct100 == null ? '—' : fmtNum(r.pct100, 2)) : '', align: 'right' },
    { key: 'nilai100', label: 'NILAI 100%', value: (r) => r.nilai100, render: (r) => r.kind === 'indicator' ? fmtNum(r.nilai100, 2) : '', align: 'right' },
    { key: 'pct110', label: '% (110%)', value: (r) => r.pct110, render: (r) => r.kind === 'indicator' ? (r.pct110 == null ? '—' : <b style={{ color: pctColor(r.pct110) }}>{fmtNum(r.pct110, 2)}</b>) : '', align: 'right' },
    { key: 'nilai110', label: 'NILAI 110%', value: (r) => r.nilai110, render: (r) => r.kind === 'indicator' ? <b>{fmtNum(r.nilai110, 2)}</b> : '', align: 'right' },
    { key: 'status', label: 'STATUS', value: (r) => r.status, render: (r) => r.kind === 'indicator' ? (r.status ? <Badge status={r.status} /> : <span className="t-muted">—</span>) : '' },
  ];
  return (
    <SortableTable rows={rows} cols={cols} maxHeight={640}
      hideWhenSorted={(r) => r.kind !== 'indicator'}
      fullRow={(r) => r.kind === 'section' ? <span className="h-section">⚡ {r.no}. {r.name}</span> : null}
    />
  );
}

export default function Kinerja() {
  usePageSources(['nko']);
  const nko = useSource('nko');
  const { refresh } = useData();
  return (
    <Gate sources={[nko]} onRetry={() => refresh(['nko'])} text="Memuat Kinerja NKO…">
      {() => <KinerjaBody months={nko.data!.months} updatedAt={nko.updatedAt ?? null} />}
    </Gate>
  );
}

function KinerjaBody({ months, updatedAt }: { months: NkoMonth[]; updatedAt?: Date | null }) {
  const latest = months[months.length - 1];
  const loc = useLocation();
  const askedMonth = (loc.state as { month?: number } | null)?.month;
  const [sel, setSel] = useState(askedMonth && months.some((x) => x.monthNo === askedMonth) ? askedMonth : latest.monthNo);
  useEffect(() => {
    if (loc.hash === '#analisa-nko') { const t = setTimeout(() => document.getElementById('analisa-nko')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350); return () => clearTimeout(t); }
  }, [loc.hash, loc.key]);
  const [perBulan, setPerBulan] = useState(latest.monthNo);
  const [showComp, setShowComp] = useState(false);
  const m = months.find((x) => x.monthNo === sel) ?? latest;
  const mb = months.find((x) => x.monthNo === perBulan) ?? latest;
  const counts = statusCounts(m);
  const t = useChartTheme();

  // ----- trend -----
  const indicators = indicatorsOf(latest).filter((r) => !r.penalty);
  const [trendNo, setTrendNo] = useState(indicators.find((r) => /ABOF/.test(r.name))?.no ?? indicators[0]?.no ?? '');
  const trend = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const tab = months.find((x) => x.monthNo === i + 1);
    const row = tab?.rows.find((r) => r.no === trendNo && r.kind === 'indicator');
    const latestRow = latest.rows.find((r) => r.no === trendNo && r.kind === 'indicator');
    return {
      bulan: MONTHS_SHORT[i],
      target: row?.targetSd ?? latestRow?.monthly[i]?.target ?? null,
      realisasi: row && row.realSdRaw !== '' ? row.realSd : null,
    };
  }), [months, trendNo, latest]);
  const trendRow = indicators.find((r) => r.no === trendNo);

  // ----- projection (next month) -----
  const next = latest.monthNo < 12 ? latest.monthNo + 1 : null;
  const projection = useMemo(() => {
    if (!next) return [];
    return indicators.map((r) => {
      const hist = months.map((mm) => mm.rows.find((x) => x.no === r.no && x.kind === 'indicator')?.realSd).filter((v): v is number => v != null);
      const last = hist[hist.length - 1] ?? null;
      let proj = last;
      if (hist.length >= 2) {
        const h = hist.slice(-3);
        const slope = (h[h.length - 1] - h[0]) / (h.length - 1);
        proj = (last ?? 0) + slope;
      }
      if (proj != null && proj < 0) proj = 0;
      const target = r.monthly[next - 1]?.target ?? null;
      const tol = Math.abs(target ?? 0) * 0.0001;
      let onTrack: boolean | null = null;
      if (proj != null && target != null) onTrack = r.lowerBetter ? proj <= target + tol : proj >= target - tol;
      return { ...r, target, last, proj, onTrack };
    });
  }, [indicators, months, next]);
  type P = (typeof projection)[number];
  const projCols: Col<P>[] = [
    { key: 'no', label: 'NO', value: (r) => r.no, render: (r) => <span className="t-accent font-bold">{r.no}</span> },
    { key: 'name', label: 'INDIKATOR', value: (r) => r.name, className: 'min-w-[240px]' },
    { key: 'arah', label: 'ARAH', value: (r) => (r.lowerBetter ? '↓ Rendah' : '↑ Tinggi') },
    { key: 'satuan', label: 'SATUAN', value: (r) => r.satuan },
    { key: 'last', label: `REALISASI S.D ${MONTHS_SHORT[latest.monthNo - 1]}`, value: (r) => r.last, render: (r) => fmtAuto(r.last), align: 'right' },
    { key: 'target', label: `TARGET ${next ? MONTHS_SHORT[next - 1] : ''}`, value: (r) => r.target, render: (r) => fmtAuto(r.target), align: 'right' },
    { key: 'proj', label: 'PROYEKSI', value: (r) => r.proj, render: (r) => fmtAuto(r.proj), align: 'right' },
    { key: 'onTrack', label: 'STATUS', value: (r) => (r.onTrack == null ? '' : r.onTrack ? 'On Track' : 'Perhatian'), render: (r) => r.onTrack == null ? '—' : <Badge status={r.onTrack ? 'ON TRACK' : 'PERHATIAN'} /> },
  ];

  const merahCols: Col<NkoMonth['merah'][number]>[] = [
    { key: 'no', label: 'NO', value: (r) => +r.no },
    { key: 'indikator', label: 'INDIKATOR', value: (r) => r.indikator },
    { key: 'penyebab', label: 'PENYEBAB / FAKTOR', value: (r) => r.penyebab, className: 'min-w-[220px] whitespace-pre-line' },
    { key: 'action', label: 'ACTION PLAN', value: (r) => r.action, className: 'min-w-[320px] whitespace-pre-line' },
    { key: 'status', label: 'STATUS', value: (r) => r.status, render: (r) => <Badge status={r.status} /> },
    { key: 'progress', label: 'PROGRESS BULANAN', sortable: false, render: (r) => <div className="flex flex-wrap gap-1">{r.progress.map((p) => <span key={p.month} className="badge badge-info">{MONTHS_SHORT[p.month - 1]}: {p.value}</span>)}</div> },
    { key: 'last', label: 'TINDAK LANJUT', value: (r) => r.lastProgress, render: (r) => <b className="t-accent">{r.lastProgress}</b> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title={<>Dashboard Kinerja <Term term="NKO">NKO</Term></>} subtitle={<>Kinerja Operasional UPT Bengkulu — <span className="t-accent font-semibold">{m.label}</span> (tab {m.tab})</>} right={<MonthChips months={months} value={sel} onChange={setSel} />} />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard label={<>Total <Term term="NKO">NKO</Term></>} labelSub="(cap 100%)" value={fmtNum(m.total100, 2)} color={C.blue} icon={<Gauge />} sub="Nilai kinerja organisasi" />
        <StatCard label={<>Total <Term term="NKO">NKO</Term></>} labelSub="(cap 110%)" value={fmtNum(m.total110 != null ? Math.min(110, m.total110) : null, 2)} color={pctColor(m.total110)} icon={<Gauge />} sub={(m.total110 ?? 0) >= 100 ? 'Di atas target' : 'Di bawah target'} />
        <StatCard label="BAIK" value={counts.BAIK} color={C.ok} icon={<CheckCircle2 />} sub="indikator" />
        <StatCard label="HATI-HATI" value={counts['HATI-HATI']} color={C.warn} icon={<AlertTriangle />} sub="indikator" />
        <StatCard label="MASALAH" value={counts.MASALAH} color={C.crit} icon={<XCircle />} sub="indikator" />
      </div>
      <AnalisaNko months={months} sel={m.monthNo} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <ChartCard title="1. Bobot vs Nilai per Indikator" className="xl:col-span-2" height={340}
          right={<span className="text-[11px] t-muted">Hijau ≥100% · Kuning 95–&lt;100% · Merah &lt;95% · arahkan kursor untuk detail</span>}>
          <NkoBobotNilaiChart rows={m.rows} />
        </ChartCard>
        <ChartCard title="2. Distribusi Status Indikator" height={340}>
          <SimplePie data={Object.entries(counts).map(([name, value]) => ({ name, value })).filter((d) => d.value > 0)} colors={{ BAIK: C.ok, MASALAH: C.crit, 'HATI-HATI': C.warn }} />
        </ChartCard>
      </div>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="h-section">Indikator Kinerja Utama — Kumulatif S.D. {MONTHS_LONG[m.monthNo - 1]}</h3>
          <label className="text-xs t-muted flex items-center gap-2"><input type="checkbox" checked={showComp} onChange={(e) => setShowComp(e.target.checked)} /> Tampilkan komponen (∑)</label>
        </div>
        <KpiTable month={m} showComponents={showComp} />
        <div className="flex justify-end gap-6 mt-3 text-sm">
          <span>TOTAL NILAI (100%): <b className="t-accent">{fmtNum(m.total100, 2)}</b></span>
          <span>TOTAL NILAI (110%): <b className="t-accent">{fmtNum(m.total110, 2)}</b></span>
        </div>
      </Card>
      <Card>
        <h3 className="h-section mb-3" style={{ color: C.crit }}>🔴 Kinerja Merah {m.merah[0]?.indikator ? `(${m.merah[0].indikator})` : ''}</h3>
        <SortableTable rows={m.merah} cols={merahCols} empty="Tidak ada kinerja merah pada bulan ini" />
      </Card>
      <ChartCard title={`3. Tren Bulanan — Target vs Realisasi (JAN–DES)`} height={320}
        right={<Select value={trendNo} onChange={setTrendNo} options={indicators.map((r) => ({ value: r.no, label: `${r.no}. ${r.short}` }))} className="min-w-[220px]" />}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={t.grid} />
            <XAxis dataKey="bulan" tick={{ fill: t.axis, fontSize: 11 }} />
            <YAxis tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={(v) => fmtAuto(v)} />
            <Tooltip {...t.tooltip} formatter={(v: number, n: string) => [fmtAuto(v), n === 'target' ? 'Target S.D' : 'Realisasi S.D']} />
            <Legend formatter={(v) => <span style={{ color: t.legend.color }}>{v === 'target' ? 'Target (kumulatif)' : 'Realisasi (kumulatif)'}</span>} />
            <Line type="monotone" dataKey="target" stroke={C.blue} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="realisasi" stroke={C.ok} strokeWidth={3} dot={{ r: 5, fill: C.ok }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      {trendRow && <div className="text-xs t-muted -mt-3">{trendRow.no}. {trendRow.name} · Satuan {trendRow.satuan} · {trendRow.lowerBetter ? '↓ makin rendah makin baik' : '↑ makin tinggi makin baik'}</div>}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="h-section">Data Per Bulan — {MONTHS_LONG[mb.monthNo - 1]} (tab {mb.tab})</h3>
          <MonthChips months={months} value={perBulan} onChange={setPerBulan} />
        </div>
        <KpiTable month={mb} showComponents={false} />
      </Card>
      {next && (
        <Card>
          <h3 className="h-section mb-1">Proyeksi &amp; Target — {MONTHS_LONG[next - 1]} 2026</h3>
          <div className="text-xs t-muted mb-3">Target dari rencana bulanan sheet; proyeksi = ekstrapolasi linear realisasi kumulatif 3 bulan terakhir. ↑ on track bila proyeksi ≥ target; ↓ on track bila proyeksi ≤ target (toleransi 0,01%).</div>
          <SortableTable rows={projection} cols={projCols} maxHeight={560} />
        </Card>
      )}

      {/* Lembar ringkasan 1 halaman tegak (Export PDF/PNG) — off-screen, lihat src/lib/export.tsx */}
      <ExportSheet meta={{ title: 'Dashboard Kinerja NKO', subtitle: `Kinerja Operasional UPT Bengkulu — ${m.label} (tab ${m.tab})`, fileBase: 'Kinerja_NKO', updatedAt: updatedAt ?? null }}>
        <XKpis items={[
          { label: 'Total NKO (cap 100%)', value: fmtNum(m.total100, 2), color: C.blue },
          { label: 'Total NKO (cap 110%)', value: fmtNum(m.total110 != null ? Math.min(110, m.total110) : null, 2), sub: (m.total110 ?? 0) >= 100 ? 'Di atas target' : 'Di bawah target', color: pctColor(m.total110) },
          { label: 'BAIK', value: fmtNum(counts.BAIK), sub: 'indikator', color: C.ok },
          { label: 'HATI-HATI', value: fmtNum(counts['HATI-HATI']), sub: 'indikator', color: C.warn },
          { label: 'MASALAH', value: fmtNum(counts.MASALAH), sub: 'indikator', color: C.crit },
        ]} />
        <XTable title={`Indikator Kinerja Utama — Kumulatif S.D. ${MONTHS_LONG[m.monthNo - 1]}`}
          headers={['NO', 'INDIKATOR', 'BOBOT', `TARGET S.D. ${MONTHS_SHORT[m.monthNo - 1].toUpperCase()}`, `REALISASI S.D. ${MONTHS_SHORT[m.monthNo - 1].toUpperCase()}`, '% (110%)', 'NILAI 110%', 'STATUS']}
          aligns={['left', 'left', 'right', 'right', 'right', 'right', 'right', 'left']}
          widths={['5%', '36%', '6%', '11%', '11%', '8%', '9%', '14%']}
          compact
          rows={[...indicatorsOf(m)].filter((r) => !r.penalty).map((r) => [
            r.no,
            r.name.length > 42 ? `${r.name.slice(0, 42)}…` : r.name,
            r.bobot,
            r.targetSdRaw ? fmtAuto(r.targetSd) : '—',
            r.realSdRaw ? fmtAuto(r.realSd) : '—',
            r.pct110 == null ? '—' : fmtNum(r.pct110, 2),
            // Nilai + status indikator MASALAH dicetak merah tebal supaya
            // langsung terbedakan dari nilai yang baik (masukan user 2026-11-07).
            r.status === 'MASALAH'
              ? <span style={{ color: '#DC2626', fontWeight: 800 }}>{fmtNum(r.nilai110, 2)}</span>
              : fmtNum(r.nilai110, 2),
            r.status === 'MASALAH'
              ? <span style={{ color: '#DC2626', fontWeight: 800 }}>{r.status}</span>
              : r.status || '—',
          ])}
          maxRows={40} />
        {m.merah.length > 0 && (
          <XNote>Kinerja merah: <b>{m.merah[0].indikator}</b> — {m.merah[0].penyebab} · Status: {m.merah[0].status}</XNote>
        )}
      </ExportSheet>
    </div>
  );
}
