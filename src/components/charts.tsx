import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TegakanRow, TEG_STATUSES, NkoRow, pctOf } from '../lib/parsers';
import { C, STATUS_COLORS, useChartTheme } from './ui';
import { fmtNum } from '../lib/sheets';

export const TEG_LABEL: Record<string, string> = { NORMAL: 'Normal', BAHAYA_II: 'Bahaya II', BAHAYA_I: 'Bahaya I', KRITIS: 'Kritis' };

/** Tegakan per ULTG — stacked bar (SUM JML per status). Used on Tegakan page AND on HOME. */
export function TegakanUltgChart({ rows, animate = true }: { rows: TegakanRow[]; animate?: boolean }) {
  const t = useChartTheme();
  const data = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const k = (r.ultg || '-').replace(/^ULTG\s+/i, 'ULTG ');
      const o = m.get(k) ?? { NORMAL: 0, BAHAYA_II: 0, BAHAYA_I: 0, KRITIS: 0 };
      o[r.status] = (o[r.status] ?? 0) + r.jml;
      m.set(k, o);
    }
    return [...m.entries()].map(([ultg, v]) => ({ ultg, ...v, total: Object.values(v).reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total);
  }, [rows]);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="ultg" tick={{ fill: t.axis, fontSize: 11 }} />
        <YAxis tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={(v) => fmtNum(v)} />
        <Tooltip {...t.tooltip} formatter={(v: number, n: string) => [fmtNum(v), TEG_LABEL[n] ?? n]} />
        <Legend formatter={(v) => <span style={{ color: t.legend.color }}>{TEG_LABEL[v] ?? v}</span>} />
        {TEG_STATUSES.map((s) => <Bar key={s} dataKey={s} stackId="a" fill={STATUS_COLORS[s]} radius={s === 'KRITIS' ? [6, 6, 0, 0] : 0} isAnimationActive={animate} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Color rule: N ≥ 100 green, 95 ≤ N < 100 yellow, N < 95 red. */
export const pctColor = (p: number | null | undefined) => (p == null ? C.blue : p >= 100 ? C.ok : p >= 95 ? C.warn : C.crit);

/** Bobot vs Nilai per indicator; bars dimmed until hovered. */
export function NkoBobotNilaiChart({ rows, animate = true }: { rows: NkoRow[]; animate?: boolean }) {
  const t = useChartTheme();
  const [hover, setHover] = useState<number | null>(null);
  const data = rows.filter((r) => r.kind === 'indicator' && !r.penalty && r.bobotNum != null).map((r) => ({
    name: r.short, full: `${r.no}. ${r.name}`, bobot: r.bobotNum, nilai: r.nilai110 ?? 0, pct: pctOf(r), status: r.status,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 64 }} onMouseLeave={() => setHover(null)}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: t.axis, fontSize: 9 }} angle={-45} textAnchor="end" interval={0} height={72}
          tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 12)}…` : v)} />
        <YAxis tick={{ fill: t.axis, fontSize: 11 }} />
        <Tooltip {...t.tooltip} content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const d: any = payload[0].payload;
          return (
            <div style={{ ...t.tooltip.contentStyle, padding: 10, fontSize: 12 }}>
              <div style={t.tooltip.labelStyle}>{d.full}</div>
              <div>Bobot: {fmtNum(d.bobot, 2)}</div>
              <div>Nilai (cap 110%): {fmtNum(d.nilai, 2)}</div>
              <div>Pencapaian: <b style={{ color: pctColor(d.pct) }}>{fmtNum(d.pct, 2)}%</b></div>
              <div>Status: <b style={{ color: pctColor(d.pct) }}>{d.status}</b></div>
            </div>
          );
        }} />
        <Legend formatter={(v) => <span style={{ color: t.legend.color }}>{v === 'bobot' ? 'Bobot' : 'Nilai (warna = % pencapaian)'}</span>} verticalAlign="top" />
        <Bar dataKey="bobot" fill={C.pln} radius={[4, 4, 0, 0]} onMouseEnter={(_, i) => setHover(i)} isAnimationActive={animate}>
          {data.map((_, i) => <Cell key={i} fillOpacity={hover === i ? 1 : 0.4} />)}
        </Bar>
        <Bar dataKey="nilai" radius={[4, 4, 0, 0]} onMouseEnter={(_, i) => setHover(i)} isAnimationActive={animate}>
          {data.map((d, i) => <Cell key={i} fill={pctColor(d.pct)} fillOpacity={hover === i ? 1 : 0.45} style={hover === i ? { filter: `drop-shadow(0 0 6px ${pctColor(d.pct)})` } : undefined} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SimplePie({ data, colors, inner = 55, animate = true }: { data: { name: string; value: number }[]; colors?: Record<string, string>; inner?: number; animate?: boolean }) {
  const t = useChartTheme();
  const pal = [C.blue, C.ok, C.warn, C.alert, C.crit, C.purple, C.cyan, '#FF6FB5', '#9BE15D', '#5B8CFF'];
  const total = data.reduce((a, b) => a + b.value, 0);
  const colorOf = (d: { name: string }, i: number) => colors?.[d.name] ?? pal[i % pal.length];
  // Headline = irisan terbesar; ditaruh DI TENGAH lubang (dulu label % melayang di luar ring).
  const topIdx = data.reduce((bi, d, i) => (d.value > (data[bi]?.value ?? -1) ? i : bi), 0);
  const top = data[topIdx];
  const topPct = total > 0 && top ? (top.value / total) * 100 : null;
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <div className="relative mx-auto h-full" style={{ aspectRatio: '1 / 1', maxWidth: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={`${inner}%`} outerRadius="80%" paddingAngle={2} stroke="none" isAnimationActive={animate}>
                {data.map((d, i) => <Cell key={d.name} fill={colorOf(d, i)} />)}
              </Pie>
              <Tooltip {...t.tooltip} formatter={(v: number, n: string) => [`${fmtNum(v)} (${total ? ((v / total) * 100).toFixed(1).replace('.', ',') : 0}%)`, n]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-2 text-center">
            {topPct == null
              ? <div className="text-2xl font-extrabold t-muted">—</div>
              : <>
                <div className="text-3xl font-extrabold leading-none" style={{ color: colorOf(top, topIdx) }}>{fmtNum(topPct, 1)}%</div>
                <div className="t-label mt-1.5">{top.name}</div>
              </>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-1">
        {data.map((d, i) => (
          <span key={d.name} className="inline-flex items-center gap-1.5 text-xs" style={{ color: t.legend.color }}>
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colorOf(d, i) }} />{d.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Donut gauge 0–110 %. */
export function GaugeDonut({ value, max = 110, label, sub, animate = true }: { value: number | null; max?: number; label: string; sub?: string; animate?: boolean }) {
  const t = useChartTheme();
  const v = Math.max(0, Math.min(max, value ?? 0));
  const color = (value ?? 0) >= 100 ? C.ok : (value ?? 0) >= 95 ? C.warn : C.crit;
  // Panggung persegi di tengah kartu: ring tidak pernah terpotong kartu yang lebar,
  // dan label tengah selalu tepat di pusat lubang (dulu label menabrak busur).
  return (
    <div className="relative mx-auto h-full" style={{ aspectRatio: '1 / 1', maxWidth: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={[{ v }, { v: max - v }]} dataKey="v" startAngle={220} endAngle={-40} innerRadius="68%" outerRadius="88%" stroke="none" isAnimationActive={animate}>
            <Cell fill={color} style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
            <Cell fill={t.grid} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-2 text-center">
        <div className="text-3xl font-extrabold" style={{ color }}>{value == null ? '—' : `${fmtNum(value, 2)}`}</div>
        <div className="t-label mt-1">{label}</div>
        {sub && <div className="text-[11px] t-muted">{sub}</div>}
      </div>
    </div>
  );
}
