import Papa from 'papaparse';

/** Public Google Sheets used by the dashboard. */
export const SHEETS = {
  nko: '1GcyqF-CRESZyPRbeSObV7SWF-MseWjJtOmofF_4nPjQ',
  tegakan: '1w-AVZFdqKP7MOTAsn42bIqLtH9A5zfg2lq4qSiyH1ms',
  penebangan: '11W9Ozw_JMKq4_nezHlQ9l7aLxY0x-8wwaufzNZRtO-A',
  kerawanan: '1klVILSFsrBGMvkmj6y84QRk3ax69knShhdw-_0MsJ2Y',
  gangguan: '1HHv9iiUom0jxtqFcUtF79orS1s8j-x-sW3nxvOXAMaE',
  rekapGangguan: '1LleZ7EW5DfmrHoUvsOyigSkCXUBbGQDNAuTwfQ2ajMQ',
  pentanahan: '19BFGKRvnv3lfumAJSoG4nM0736AJTVgXlzCHv6-d0r4',
} as const;

/** Fallback tab list (name → gid), used when tab discovery fails. Verified Oct 2026. */
export const FALLBACK_TABS: Record<string, { name: string; gid: string }[]> = {
  [SHEETS.nko]: [
    { name: '1.JAN', gid: '1269812816' }, { name: '2.FEB', gid: '78907947' },
    { name: '3.MAR', gid: '1075087019' }, { name: '4.APR', gid: '763748006' },
    { name: '5.MEI', gid: '1427292200' }, { name: '6.JUN', gid: '643624493' },
    { name: '7.JUL', gid: '2011534318' }, { name: '8.AGU', gid: '593166475' },
    { name: '9.SEP', gid: '47640877' }, { name: '10.OKT', gid: '1444855959' },
  ],
  [SHEETS.tegakan]: [
    { name: 'TARIKAN NEW SRINTAMI', gid: '530858889' },
    { name: 'TREN KRITIS', gid: '1505080020' }, { name: 'TREN BAHAYA 1', gid: '1127847990' },
    { name: 'TREN BAHAYA 2', gid: '1543900373' }, { name: 'TREN NORMAL', gid: '536798392' },
    { name: 'TREN JUMLAH', gid: '1351231067' },
  ],
  [SHEETS.penebangan]: [
    { name: 'ULTG PEKALONGAN 2024-2026', gid: '667898772' },
    { name: 'ULTG LAHAT 2024-2026', gid: '1027795127' },
  ],
  [SHEETS.kerawanan]: [{ name: 'SELURUH DATA', gid: '1392116848' }],
  [SHEETS.gangguan]: [{ name: 'UPTBKU', gid: '699810541' }],
  [SHEETS.rekapGangguan]: [{ name: 'INPUT GGN PHT', gid: '1912142062' }],
  [SHEETS.pentanahan]: [
    { name: 'ASESMEN PENTANAHAN 2026', gid: '1980721959' },
    { name: 'ASESMEN PENTANAHAN 2025', gid: '1059579512' },
    { name: 'REALISASI 2026', gid: '1001341677' },
    { name: 'REALISASI 2025', gid: '1977347452' },
    { name: 'JADWAL 2026 ULTG PEKALONGAN', gid: '0' },
    { name: 'JADWAL 2026 ULTG LAHAT', gid: '579042227' },
    { name: 'CHECKLIST 2024', gid: '885393912' },
    { name: 'REALISASI 2024', gid: '1385519651' },
  ],
};

export type Grid = string[][];

/** fetch dengan batas waktu: sheet yang menggantung tidak boleh membuat halaman
 *  menampilkan spinner selamanya (kasus peta Kerawanan: export 1,3 MB ~60 dtk). */
async function fetchWithTimeout(url: string, ms = 25000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { cache: 'no-store', signal: ctrl.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error(`Timeout ${ms / 1000} dtk: ${url.split('?')[0]}`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** Discover the tabs (name + gid) of a public spreadsheet. Falls back to the known list. */
export async function listTabs(id: string): Promise<{ name: string; gid: string }[]> {
  try {
    const res = await fetchWithTimeout(`https://docs.google.com/spreadsheets/d/${id}/htmlview?_t=${Date.now()}`);
    if (!res.ok) throw new Error(String(res.status));
    const html = await res.text();
    const out: { name: string; gid: string }[] = [];
    const re = /name: "((?:[^"\\]|\\.)*)", pageUrl: "[^"]*?gid=(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const name = m[1].replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\//g, '/').replace(/\\"/g, '"');
      out.push({ name, gid: m[2] });
    }
    if (out.length) return out;
    throw new Error('no tabs');
  } catch {
    return FALLBACK_TABS[id] ?? [];
  }
}

/** Fetch one tab as a CSV grid (no cache). */
export async function fetchGrid(id: string, gid: string): Promise<Grid> {
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}&_t=${Date.now()}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (/^\s*<!DOCTYPE html/i.test(text)) throw new Error('Sheet tidak publik / tidak dapat diakses');
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
  return parsed.data as Grid;
}

/** Fetch satu tab sebagai CSV tapi hanya kolom dalam `range` (mis. 'A1:AD').
 *  Untuk sheet yang sangat lebar: 'SELURUH DATA' Kerawanan 72 kolom × 8.368 baris
 *  (1,3 MB) butuh ~48 dtk diekspor penuh, sedangkan A1:AD selesai ~4 dtk.
 *  Bentuk grid sama (baris header 0–1 + data), jadi parser yang sama tetap jalan
 *  selama kolom yang dibutuhkannya berada di dalam range. */
export async function fetchGridRange(id: string, gid: string, range: string): Promise<Grid> {
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}&range=${encodeURIComponent(range)}&_t=${Date.now()}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (/^\s*<!DOCTYPE html/i.test(text)) throw new Error('Sheet tidak publik / tidak dapat diakses');
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
  return parsed.data as Grid;
}

export async function fetchTabByName(id: string, matcher: (name: string) => boolean): Promise<{ name: string; grid: Grid } | null> {
  const tabs = await listTabs(id);
  const tab = tabs.find((t) => matcher(t.name));
  if (!tab) return null;
  return { name: tab.name, grid: await fetchGrid(id, tab.gid) };
}

/** Cell accessor, trimmed. */
export const cell = (row: string[] | undefined, i: number): string => (row && row[i] != null ? String(row[i]).trim() : '');

/** Parse Indonesian / mixed number formats ("1.705,09", "0,0000", "10.5", "1/2 (Rumpun)"). */
export function num(v: unknown): number | null {
  if (v == null) return null;
  let s = String(v).trim();
  if (!s || s === '-' || s.startsWith('#')) return null;
  s = s.replace(/%/g, '').replace(/\s/g, '');
  const m = s.match(/^[-+]?[\d.,]+/);
  if (!m) return null;
  s = m[0];
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
export const num0 = (v: unknown) => num(v) ?? 0;

const ID_MONTHS: Record<string, number> = {
  januari: 1, jan: 1, februari: 2, feb: 2, maret: 3, mar: 3, april: 4, apr: 4, mei: 5, may: 5, juni: 6, jun: 6,
  juli: 7, jul: 7, agustus: 8, agu: 8, agus: 8, aug: 8, august: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, oct: 10, october: 10,
  november: 11, nov: 11, nopember: 11, desember: 12, des: 12, dec: 12, december: 12, january: 1, february: 2, march: 3, june: 6, july: 7,
};
export const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
export const MONTHS_LONG = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];
export const monthIndex = (s: string): number | null => ID_MONTHS[s.trim().toLowerCase().replace(/\.$/, '')] ?? null;

/**
 * Parse a date. order 'mdy' for US-style sheets (Monitoring Gangguan), 'dmy' otherwise.
 * Handles "19 Oktober 2026", "14-Aug-2024", "2026-06-29 21:47:55", "20/10/26".
 */
export function parseDate(v: unknown, order: 'dmy' | 'mdy' = 'dmy'): Date | null {
  const s = String(v ?? '').trim();
  if (!s || s === '-' || s.startsWith('#')) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/);
  if (m) {
    let a = +m[1], b = +m[2];
    let y = +m[3]; if (y < 100) y += 2000;
    let d = order === 'dmy' ? a : b, mo = order === 'dmy' ? b : a;
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    return new Date(y, mo - 1, d);
  }
  m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]+)[\s-]+(\d{2,4})/);
  if (m) {
    const mo = monthIndex(m[2]);
    let y = +m[3]; if (y < 100) y += 2000;
    if (mo) return new Date(y, mo - 1, +m[1]);
  }
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mo = monthIndex(m[1]);
    if (mo) return new Date(+m[3], mo - 1, +m[2]);
  }
  return null;
}

export const fmtDate = (d: Date | null) =>
  d ? `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}` : '—';
export const fmtNum = (n: number | null | undefined, digits = 0) =>
  n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtAuto = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const d = abs !== 0 && abs < 1 ? 4 : Number.isInteger(n) ? 0 : 2;
  return fmtNum(n, d);
};
export const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
