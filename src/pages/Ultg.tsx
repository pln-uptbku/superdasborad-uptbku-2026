import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, FileDown, Loader2, Zap } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { usePageSources, useSource } from '../lib/data';
import { fetchGrid, listTabs, SHEETS } from '../lib/sheets';
import { parseAset, parseRekap, Ultg as UltgName, UltgEvent } from '../lib/ultg';
import { buildUltgPdf, PdfAssets, themeFor, UltgPdfPart } from '../lib/ultgPdf';
import { Card, ErrorState, LIGHT_CHART_THEME, LoadingScreen, PageHeader } from '../components/ui';
import { Term } from '../components/Glossary';
import { ExportSheet, XKpis, XSection, XTable } from '../lib/export';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
const LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const COLORS: Record<string, string> = { Petir: '#2563EB', Monyet: '#DC2626', Hewan: '#2E7D32', Topskor: '#F57C00', Ular: '#7C4DFF', 'Pengujian (ABOF)': '#6E6E6E', Pengujian: '#6E6E6E', NSF: '#00ACC1', 'APPL (Excavator)': '#FFC107', APPL: '#FFC107', Layang: '#FF6FB5', Pohon: '#795548' };
const EXTRA = ['#36CFC9', '#9BE15D', '#5B8CFF', '#FF6FB5', '#B37FEB', '#8D6E63'];
const colorOf = (n: string, i: number) => COLORS[n] ?? EXTRA[i % EXTRA.length];
const pct = (a: number, b: number) => (b ? Math.round((a * 100) / b) : 0);

async function toDataUrl(url: string): Promise<string | undefined> {
  try { const res = await fetch(url); if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) return undefined; const b = await res.blob(); return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.readAsDataURL(b); }); } catch { return undefined; }
}
async function loadAssets(): Promise<PdfAssets> {
  const m = new Date().getMonth() + 1;
  const [hdr, danantara, upt, pln] = await Promise.all([toDataUrl(`/pdf/hdr-${m}.jpg`), toDataUrl('/pdf/danantara.png'), toDataUrl('/pdf/upt.png'), toDataUrl('/pdf/pln.png')]);
  return { hdr, danantara, upt, pln };
}
function PdfButton({ onClick, dark = false }: { onClick: () => Promise<void>; dark?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button title="Export PDF" disabled={busy} onClick={async () => { setBusy(true); try { await onClick(); } finally { setBusy(false); } }}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold shadow-sm disabled:opacity-60"
      style={dark ? { background: '#FFC940', color: '#0B2340' } : { background: '#DC2626', color: '#fff' }}>
      {busy ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} PDF
    </button>
  );
}

function ThemeBanner({ onPdf, ready }: { onPdf: () => Promise<void>; ready: boolean }) {
  const now = new Date(); const th = themeFor(now); const m = now.getMonth() + 1;
  const [art, setArt] = useState(true);
  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl h-[220px] sm:h-[260px]" style={{ background: '#0B2340' }}>
        {art && (
          <div className="absolute right-0 top-0 h-full w-[660px] sm:w-[780px] max-w-full">
            <img src={`/pdf/hdr-${m}.jpg`} alt="" onError={() => setArt(false)}
              className="h-full w-full object-cover" style={{ objectPosition: '50% 55%' }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, #0B2340 0%, rgba(11,35,64,.75) 14%, rgba(11,35,64,0) 34%)' }} />
          </div>
        )}
        <div className="absolute inset-0 sm:hidden" style={{ background: 'linear-gradient(90deg, rgba(11,35,64,.92) 0%, rgba(11,35,64,.6) 60%, rgba(11,35,64,.1) 100%)' }} />
        <div className="relative p-5 sm:p-7 max-w-[560px]">
          <span className="inline-block rounded-lg px-3 py-1.5 text-xs sm:text-sm font-extrabold text-white" style={{ background: '#CE1126' }}>{th.badge.toUpperCase()}</span>
          <h1 className="mt-3 text-3xl sm:text-5xl font-extrabold text-white">Kinerja <Term term="ULTG">ULTG</Term></h1>
          <div className="mt-2 text-base sm:text-lg font-semibold" style={{ color: '#FFC940' }}>{th.slogan}</div>
          <div className="text-xs sm:text-sm" style={{ color: '#DCE6F5' }}>{th.badgeSub}</div>
          {ready && <div className="mt-3 flex items-center gap-2"><PdfButton onClick={onPdf} /><span className="text-xs" style={{ color: '#E6ECF5' }}>Seluruh ULTG</span></div>}
        </div>
      </div>
      <div className="flex h-1.5 mt-0">{['#CE1126', '#FFFFFF', '#0072CE', '#FFC940'].map((c) => <div key={c} className="flex-1" style={{ background: c }} />)}</div>
    </div>
  );
}

type Tab = { name: string; gid: string; no: number };
interface Loaded { title: string; events: UltgEvent[]; kinerja: UltgEvent[]; unmapped: UltgEvent[] }

function UltgPanel({ name, events, kinerja, onPdf }: { name: UltgName; events: UltgEvent[]; kinerja: UltgEvent[]; onPdf: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const total = events.length, rc = events.filter((e) => e.type === 'Reclose').length, tr = total - rc;
  const clusters = useMemo(() => {
    const m = new Map<string, number>(); events.forEach((e) => m.set(e.cluster, (m.get(e.cluster) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([n, v]) => ({ name: n, value: v }));
  }, [events]);
  const maxC = Math.max(1, ...clusters.map((c) => c.value));
  const stats = [
    { l: 'TOTAL GANGGUAN', v: total, s: 'kejadian', c: '#0072CE' },
    { l: 'RE-CLOSE', v: rc, s: `${pct(rc, total)}%`, c: '#2E7D32' },
    { l: 'TRIP', v: tr, s: `${pct(tr, total)}%`, c: '#F57C00' },
    { l: 'MASUK KINERJA', v: kinerja.length, s: 'kejadian', c: '#DC2626', hi: true },
  ];
  return (
    <Card className="!p-0 overflow-hidden flex flex-col">
      <div className="px-5 py-3 flex items-center gap-2" style={{ background: '#0B2340' }}>
        <Zap size={20} color="#FFC940" fill="#FFC940" />
        <div className="font-extrabold tracking-wide flex-1" style={{ color: '#FFC940' }}>MONITORING KINERJA ULTG {name}</div>
        <PdfButton dark onClick={onPdf} />
      </div>
      <div className="p-5 space-y-6">
        <div>
          <div className="text-xs font-bold uppercase t-muted mb-2">Ringkasan Gangguan</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats.map((s) => (
              <div key={s.l} className="rounded-xl p-3 text-center border" style={{ borderColor: s.hi ? s.c : 'rgba(127,140,160,.25)', borderWidth: s.hi ? 2 : 1 }}>
                <div className="text-[10.5px] font-bold t-muted">{s.l}</div>
                <div className="text-3xl font-extrabold my-1" style={{ color: s.c }}>{s.v}</div>
                <div className="text-xs t-muted">{s.s}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase t-muted mb-2">Cluster Gangguan Berdasarkan Penyebab</div>
          {total === 0 ? <div className="t-muted text-sm py-6 text-center">Belum ada gangguan.</div> : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="relative shrink-0" style={{ width: 200, height: 200 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={clusters} dataKey="value" nameKey="name" innerRadius={58} outerRadius={95} startAngle={90} endAngle={-270} stroke="none">
                      {clusters.map((c, i) => <Cell key={c.name} fill={colorOf(c.name, i)} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => [`${v} (${pct(v, total)}%)`, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-[10px] font-bold t-muted">TOTAL</div>
                  <div className="text-2xl font-extrabold">{total}</div>
                  <div className="text-[10px] t-muted">kejadian</div>
                </div>
              </div>
              <div className="flex-1 w-full space-y-2">
                {clusters.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-2 text-sm">
                    <span className="w-3.5 h-3.5 rounded shrink-0" style={{ background: colorOf(c.name, i) }} />
                    <span className="font-semibold flex-1">{c.name}</span>
                    <span className="font-bold w-6 text-right">{c.value}</span>
                    <span className="t-muted w-12">({pct(c.value, total)}%)</span>
                    <span className="hidden md:block h-2 rounded" style={{ width: 60 * (c.value / maxC), background: colorOf(c.name, i) }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div>
          <div className="text-xs font-bold uppercase mb-2" style={{ color: '#DC2626' }}>Gangguan yang Masuk Kinerja</div>
          {kinerja.length === 0 ? <div className="t-muted text-sm">Tidak ada gangguan pengurang kinerja.</div> : (
            <div className="space-y-2">
              {kinerja.map((e, i) => (
                <div key={i} className="rounded-xl p-3 border" style={{ borderColor: 'rgba(220,38,38,.35)', background: 'rgba(220,38,38,.06)' }}>
                  <div className="text-sm font-semibold">{i + 1}. {e.date}; {e.time}; {e.line}; {e.type}; {e.cause}</div>
                  <span className="inline-block mt-2 text-xs font-bold text-white px-3 py-1 rounded-full" style={{ background: '#DC2626' }}>→ {e.kinerja}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <button className="text-sm font-bold flex items-center gap-1" style={{ color: '#0072CE' }} onClick={() => setOpen(!open)}>
            Daftar seluruh gangguan ({total}) {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {open && (
            <div className="mt-2 max-h-80 overflow-auto text-sm divide-y" style={{ borderColor: 'rgba(127,140,160,.2)' }}>
              {[...events].reverse().map((e, i) => (
                <div key={i} className="py-1.5 flex flex-wrap gap-x-2">
                  <span className="t-muted">{e.date} · {e.time}</span><span className="font-semibold">{e.line}</span>
                  <span style={{ color: e.type === 'Trip' ? '#F57C00' : '#2E7D32' }}>{e.type}</span><span>{e.cause}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* Pie cluster penyebab + legenda Top 6 untuk lembar ringkasan export (bukan SimplePie
   agar legenda muat berdampingan di setengah lebar A4). */
function UltgPie({ name, events }: { name: UltgName; events: UltgEvent[] }) {
  const total = events.length;
  const clusters = useMemo(() => {
    const m = new Map<string, number>(); events.forEach((e) => m.set(e.cluster, (m.get(e.cluster) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([n, v]) => ({ name: n, value: v }));
  }, [events]);
  return (
    <div>
      <div className="text-xs font-bold mb-1" style={{ color: '#0b2340' }}>ULTG {name} — {total} kejadian</div>
      {total === 0 ? <div className="text-sm" style={{ color: '#4b6585' }}>Belum ada gangguan.</div> : (
        <div className="flex items-center gap-3">
          <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={clusters} dataKey="value" nameKey="name" innerRadius={44} outerRadius={66} startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
                  {clusters.map((c, i) => <Cell key={c.name} fill={colorOf(c.name, i)} />)}
                </Pie>
                <Tooltip {...LIGHT_CHART_THEME.tooltip} formatter={(v: number, n: string) => [`${v} (${pct(v, total)}%)`, n]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-[10px] font-bold" style={{ color: '#4b6585' }}>TOTAL</div>
              <div className="text-2xl font-extrabold" style={{ color: '#0b2340' }}>{total}</div>
            </div>
          </div>
          <div className="flex-1 space-y-1.5 min-w-0">
            {clusters.slice(0, 6).map((c, i) => (
              <div key={c.name} className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colorOf(c.name, i) }} />
                <span className="font-semibold flex-1" style={{ color: '#0b2340' }}>{c.name.length > 18 ? `${c.name.slice(0, 18)}…` : c.name}</span>
                <span className="font-bold" style={{ color: '#0b2340' }}>{c.value}</span>
                <span style={{ color: '#4b6585' }}>({pct(c.value, total)}%)</span>
              </div>
            ))}
            {clusters.length > 6 && <div className="text-[11px] italic" style={{ color: '#4b6585' }}>+{clusters.length - 6} penyebab lainnya</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Ultg() {
  usePageSources(['nko']);
  const nkoSrc = useSource('nko');
  const [tabs, setTabs] = useState<Tab[] | null>(null);
  const [sel, setSel] = useState(0);
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    listTabs(SHEETS.nko).then((all) => {
      const t = all.map((x) => ({ ...x, no: Number((x.name.match(/^(\d{1,2})\./) || [])[1]) }))
        .filter((x) => x.no >= 1 && x.no <= 12).sort((a, b) => a.no - b.no);
      setTabs(t); if (t.length) setSel(t[t.length - 1].no);
    }).catch((e) => setErr(String(e)));
  }, [reload]);

  useEffect(() => {
    if (!tabs || !sel) return;
    const tab = tabs.find((t) => t.no === sel); if (!tab) return;
    setData(null); setErr('');
    listTabs(SHEETS.nko).then(async (all) => {
      const aset = all.find((x) => /^ASET$/i.test(x.name.trim())) ?? { gid: '1950971114' };
      const [g, a] = await Promise.all([fetchGrid(SHEETS.nko, tab.gid), fetchGrid(SHEETS.nko, aset.gid)]);
      const map = parseAset(a);
      const r = parseRekap(g, map);
      setData({ ...r, unmapped: r.events.filter((e) => !e.ultg) });
    }).catch((e) => setErr(String(e.message || e)));
  }, [tabs, sel, reload]);

  const bulan = LONG[sel - 1] ?? '';
  const parts: UltgPdfPart[] = data ? (['PEKALONGAN', 'LAHAT'] as UltgName[]).map((u) => ({ name: u, events: data.events.filter((e) => e.ultg === u), kinerja: data.kinerja.filter((e) => e.ultg === u) })) : [];
  const exportPdf = async (mode: 'ALL' | UltgName) => {
    const nko = nkoSrc.data?.months.find((x) => x.monthNo === sel);
    const { doc, fname } = await buildUltgPdf({ parts, mode, monthNo: sel, year: new Date().getFullYear(), nko, assets: await loadAssets() });
    doc.save(fname);
  };
  return (
    <div className="space-y-5">
      <ThemeBanner ready={!!data} onPdf={() => exportPdf('ALL')} />
      {tabs && (
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => <button key={t.no} className={`chip ${sel === t.no ? 'chip-on' : ''}`} onClick={() => setSel(t.no)}>{MONTHS[t.no - 1]}</button>)}
        </div>
      )}
      {err && <ErrorState detail={err} onRetry={() => setReload((x) => x + 1)} />}
      {!err && !data && <LoadingScreen text="Memuat Kinerja ULTG…" />}
      {data && (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            {(['PEKALONGAN', 'LAHAT'] as UltgName[]).map((u) => (
              <UltgPanel key={u} name={u} events={data.events.filter((e) => e.ultg === u)} kinerja={data.kinerja.filter((e) => e.ultg === u)} onPdf={() => exportPdf(u)} />
            ))}
          </div>
          {data.unmapped.length > 0 && (
            <Card className="text-sm">
              <div className="font-bold mb-1" style={{ color: '#F57C00' }}>Belum terpetakan ke ULTG ({data.unmapped.length})</div>
              {data.unmapped.map((e, i) => <div key={i}>{e.date} · {e.line} · {e.type} · {e.cause}</div>)}
              <div className="t-muted text-xs mt-1">Penghantar ini belum ada di daftar tab ASET.</div>
            </Card>
          )}
          {/* Lembar ringkasan 1 halaman tegak (Export PDF/PNG). */}
          <ExportSheet meta={{ title: 'Kinerja ULTG', subtitle: `Bulan ${bulan} ${new Date().getFullYear()} · ULTG PEKALONGAN & LAHAT`, fileBase: `Kinerja_ULTG_${bulan}`, updatedAt: nkoSrc.updatedAt ?? null }}>
            <XKpis items={[
              { label: 'Total Gangguan', value: String(data.events.length), sub: 'kejadian', color: '#0072CE' },
              { label: 'Re-close', value: String(data.events.filter((e) => e.type === 'Reclose').length), sub: 'kejadian', color: '#2E7D32' },
              { label: 'Trip', value: String(data.events.filter((e) => e.type === 'Trip').length), sub: 'kejadian', color: '#F57C00' },
              { label: 'Masuk Kinerja', value: String(data.kinerja.length), sub: 'kejadian', color: '#DC2626' },
            ]} />
            <XSection title="Cluster Gangguan Berdasarkan Penyebab" height={250}>
              <div className="grid grid-cols-2 gap-4">
                {(['PEKALONGAN', 'LAHAT'] as UltgName[]).map((u) => (
                  <UltgPie key={u} name={u} events={data.events.filter((e) => e.ultg === u)} />
                ))}
              </div>
            </XSection>
            <XTable title="Gangguan Masuk Kinerja" headers={['TANGGAL', 'ULTG', 'PENGHANTAR', 'JENIS', 'PENYEBAB', 'KINERJA']}
              aligns={['left', 'left', 'left', 'left', 'left', 'left']}
              widths={['11%', '14%', '19%', '7%', '27%', '22%']}
              rows={data.kinerja.map((e) => [
                e.date, e.ultg ?? '—', e.line.length > 26 ? `${e.line.slice(0, 26)}…` : e.line, e.type,
                e.cause.length > 30 ? `${e.cause.slice(0, 30)}…` : e.cause,
                e.kinerja ? (e.kinerja.length > 20 ? `${e.kinerja.slice(0, 20)}…` : e.kinerja) : '—',
              ])}
              maxRows={8} />
            <XTable title="Gangguan Terbaru" headers={['TANGGAL', 'ULTG', 'PENGHANTAR', 'JENIS', 'PENYEBAB']}
              aligns={['left', 'left', 'left', 'left', 'left']}
              rows={[...data.events].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).map((e) => [
                e.date, e.ultg ?? '—', e.line.length > 26 ? `${e.line.slice(0, 26)}…` : e.line, e.type,
                e.cause.length > 46 ? `${e.cause.slice(0, 46)}…` : e.cause,
              ])}
              maxRows={8} />
          </ExportSheet>
          <div className="text-xs t-muted">Pembagian ULTG mengikuti daftar penghantar di tab ASET (fallback: lokasi GI). {data.title}.</div>
        </>
      )}
    </div>
  );
}
