import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { FALLBACK_TABS, fetchGrid, fetchGridRange, listTabs, SHEETS } from './sheets';
import {
  GangguanRow, KerawananRow, NkoMonth, PenebanganRow, RekapGangguanRow, TegakanRow, TrendSeries,
  parseGangguan, parseKerawanan, parseNkoTab, parsePenebangan, parseRekapGangguan, parseTegakan, parseTrend,
} from './parsers';

export interface NkoData { months: NkoMonth[] }
export interface TegakanData { rows: TegakanRow[]; headerTotal: number | null; trends: TrendSeries[]; trendError?: string }
export interface PenebanganData { rows: PenebanganRow[] }
export interface KerawananData { rows: KerawananRow[]; keys: string[] }
export interface GangguanData { rows: GangguanRow[] }
export interface RekapGangguanData { rows: RekapGangguanRow[] }

type Sources = { nko: NkoData; tegakan: TegakanData; penebangan: PenebanganData; kerawanan: KerawananData; kerawananMap: KerawananData; gangguan: GangguanData; rekapGangguan: RekapGangguanData };
export type SourceKey = keyof Sources;
export interface SourceState<T> { status: 'idle' | 'loading' | 'ok' | 'error'; data?: T; error?: string; updatedAt?: Date }

const loaders: { [K in SourceKey]: () => Promise<Sources[K]> } = {
  async nko() {
    const tabs = await listTabs(SHEETS.nko);
    const monthTabs = tabs
      .map((t) => { const m = t.name.trim().match(/^(\d{1,2})\s*\.\s*([A-Za-z]+)/); return m ? { ...t, monthNo: +m[1] } : null; })
      .filter((t): t is { name: string; gid: string; monthNo: number } => !!t && t.monthNo >= 1 && t.monthNo <= 12)
      .sort((a, b) => a.monthNo - b.monthNo);
    if (!monthTabs.length) throw new Error('Tab bulanan (1.JAN …) tidak ditemukan');
    const results = await Promise.allSettled(monthTabs.map(async (t) => parseNkoTab(t.name, await fetchGrid(SHEETS.nko, t.gid), t.monthNo)));
    const months = results.filter((r): r is PromiseFulfilledResult<NkoMonth> => r.status === 'fulfilled').map((r) => r.value)
      .filter((m) => m.rows.some((r) => r.kind === 'indicator'));
    if (!months.length) throw new Error('Data NKO tidak dapat dibaca');
    return { months };
  },
  async tegakan() {
    const tabs = await listTabs(SHEETS.tegakan);
    const main = tabs.find((t) => t.name.trim().toUpperCase() === 'TARIKAN NEW SRINTAMI');
    if (!main) throw new Error('Sheet "TARIKAN NEW SRINTAMI" tidak ditemukan');
    const trendDefs: [string, RegExp][] = [
      ['KRITIS', /^TREN\s*\(?\s*KRITIS/i], ['BAHAYA_I', /^TREN\s*\(?\s*BAHAYA\s*(1|I)\b/i],
      ['BAHAYA_II', /^TREN\s*\(?\s*BAHAYA\s*(2|II)\b/i], ['NORMAL', /^TREN\s*\(?\s*NORMAL/i],
    ];
    const [mainGrid, ...trendRes] = await Promise.allSettled([
      fetchGrid(SHEETS.tegakan, main.gid),
      ...trendDefs.map(async ([st, re]) => {
        const t = tabs.find((x) => re.test(x.name.trim()));
        if (!t) throw new Error(`Sheet TREN ${st} tidak ditemukan`);
        return parseTrend(st, await fetchGrid(SHEETS.tegakan, t.gid));
      }),
    ]);
    if (mainGrid.status !== 'fulfilled') throw new Error(String((mainGrid as PromiseRejectedResult).reason));
    const parsed = parseTegakan(mainGrid.value as any);
    const trends = trendRes.filter((r): r is PromiseFulfilledResult<TrendSeries> => r.status === 'fulfilled').map((r) => r.value);
    const failed = trendRes.filter((r) => r.status === 'rejected').length;
    return { ...parsed, trends, trendError: failed ? `${failed} sheet TREN gagal dimuat` : undefined };
  },
  async penebangan() {
    const tabs = await listTabs(SHEETS.penebangan);
    const pk = tabs.find((t) => /PEKALONGAN\s*2024/i.test(t.name));
    const lh = tabs.find((t) => /LAHAT\s*2024/i.test(t.name));
    if (!pk && !lh) throw new Error('Tab ULTG PEKALONGAN / ULTG LAHAT tidak ditemukan');
    const [a, b] = await Promise.all([
      pk ? fetchGrid(SHEETS.penebangan, pk.gid).then((g) => parsePenebangan('PEKALONGAN', g)) : Promise.resolve([]),
      lh ? fetchGrid(SHEETS.penebangan, lh.gid).then((g) => parsePenebangan('LAHAT', g)) : Promise.resolve([]),
    ]);
    return { rows: [...a, ...b] };
  },
  async kerawanan() {
    const tabs = await listTabs(SHEETS.kerawanan);
    const t = tabs.find((x) => x.name.trim().toUpperCase() === 'SELURUH DATA');
    if (!t) throw new Error('Sheet "SELURUH DATA" tidak ditemukan');
    return parseKerawanan(await fetchGrid(SHEETS.kerawanan, t.gid));
  },
  async kerawananMap() {
    // Peta di homepage hanya butuh 4 kolom (PHT, PETIR, ADA/TIDAK, STATUS TOWER).
    // Ambil langsung kolom A:AD lewat gid yang sudah diketahui — tanpa listTabs
    // (htmlview ~14 dtk) dan tanpa 42 kolom ekor sheet (export penuh ~48 dtk).
    // Hasil terukur: ~4 dtk. Halaman /kerawanan tetap memakai sumber penuh di atas.
    const gid = FALLBACK_TABS[SHEETS.kerawanan][0].gid;
    return parseKerawanan(await fetchGridRange(SHEETS.kerawanan, gid, 'A1:AD'));
  },
  async gangguan() {
    const tabs = await listTabs(SHEETS.gangguan);
    const t = tabs.find((x) => x.name.trim().toUpperCase() === 'UPTBKU');
    if (!t) throw new Error('Sheet "UPTBKU" tidak ditemukan');
    return { rows: parseGangguan(await fetchGrid(SHEETS.gangguan, t.gid)) };
  },
  async rekapGangguan() {
    const tabs = await listTabs(SHEETS.rekapGangguan);
    const t = tabs.find((x) => /INPUT\s*GGN\s*PHT/i.test(x.name));
    if (!t) throw new Error('Sheet "INPUT GGN PHT" tidak ditemukan');
    return { rows: parseRekapGangguan(await fetchGrid(SHEETS.rekapGangguan, t.gid)) };
  },
};

type State = { [K in SourceKey]: SourceState<Sources[K]> };
const initial: State = { nko: { status: 'idle' }, tegakan: { status: 'idle' }, penebangan: { status: 'idle' }, kerawanan: { status: 'idle' }, kerawananMap: { status: 'idle' }, gangguan: { status: 'idle' }, rekapGangguan: { status: 'idle' } };

interface Ctx { state: State; ensure: (k: SourceKey) => void; refresh: (keys?: SourceKey[]) => void }
const DataCtx = createContext<Ctx | null>(null);

export function DataProvider({ children, initialState }: { children: React.ReactNode; initialState?: Partial<State> }) {
  const [state, setState] = useState<State>({ ...initial, ...(initialState as State) });
  const inflight = useRef<Partial<Record<SourceKey, boolean>>>({});
  const load = useCallback((k: SourceKey) => {
    if (inflight.current[k]) return;
    inflight.current[k] = true;
    setState((s) => ({ ...s, [k]: { ...s[k], status: 'loading', error: undefined } }));
    (loaders[k]() as Promise<any>)
      .then((data) => setState((s) => ({ ...s, [k]: { status: 'ok', data, updatedAt: new Date() } })))
      .catch((e) => setState((s) => ({ ...s, [k]: { ...s[k], status: s[k].data ? 'ok' : 'error', error: String(e?.message || e) } })))
      .finally(() => { inflight.current[k] = false; });
  }, []);
  const stateRef = useRef(state); stateRef.current = state;
  const ensure = useCallback((k: SourceKey) => { if (stateRef.current[k].status === 'idle') load(k); }, [load]);
  const refresh = useCallback((keys?: SourceKey[]) => {
    const ks = keys ?? (Object.keys(stateRef.current) as SourceKey[]).filter((k) => stateRef.current[k].status !== 'idle');
    ks.forEach(load);
  }, [load]);
  return <DataCtx.Provider value={{ state, ensure, refresh }}>{children}</DataCtx.Provider>;
}

export function useData() { const c = useContext(DataCtx); if (!c) throw new Error('no DataProvider'); return c; }

export function useSource<K extends SourceKey>(k: K): SourceState<Sources[K]> {
  const { state, ensure } = useData();
  useEffect(() => { ensure(k); }, [k, ensure]);
  return state[k] as SourceState<Sources[K]>;
}

/** Page-level registration: which sources this page uses (for the Refresh button). */
const PageSourcesCtx = createContext<{ set: (k: SourceKey[]) => void; keys: SourceKey[] }>({ set: () => {}, keys: [] });
export function PageSourcesProvider({ children }: { children: React.ReactNode }) {
  const [keys, set] = useState<SourceKey[]>([]);
  return <PageSourcesCtx.Provider value={{ keys, set }}>{children}</PageSourcesCtx.Provider>;
}
export function usePageSources(keys: SourceKey[]) {
  const { set } = useContext(PageSourcesCtx);
  const sig = keys.join(',');
  useEffect(() => { set(keys); }, [sig]); // eslint-disable-line
}
export const usePageSourceKeys = () => useContext(PageSourcesCtx).keys;
