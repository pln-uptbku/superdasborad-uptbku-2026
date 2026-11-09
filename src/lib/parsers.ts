import { cell, Grid, monthIndex, num, num0, parseDate } from './sheets';

/* ============================================================
 * KINERJA NKO — monthly tabs "1.JAN" … "12.DES"
 * Layout (verified Oct 2026): header row with NO | INDIKATOR KINERJA | BOBOT | SATUAN |
 * TARGET 2026 | TARGET SM I | TARGET SM II | TARGET S.D <BLN> | REALISASI S.D <BLN> |
 * % PENCAPAIAN CAPPING 100% | NILAI (CAPPING 100%) | % CAPPING 110% | NILAI 110% | INDIKATOR(status)
 * then wide monthly block JANUARI..DESEMBER × (TARGET, REALISASI, VALIDASI).
 * Rows end at "TOTAL". Block "KINERJA MERAH" follows.
 * ============================================================ */

export type NkoRowKind = 'section' | 'indicator' | 'component';
export interface NkoRow {
  kind: NkoRowKind;
  no: string; // formatted number, e.g. "1.a", "2.a", "4.a.1"
  rawNo: string;
  name: string;
  short: string;
  bobot: string;
  bobotNum: number | null;
  satuan: string;
  target2026: string;
  targetSd: number | null;
  targetSdRaw: string;
  realSd: number | null;
  realSdRaw: string;
  pct100: number | null;
  nilai100: number | null;
  pct110: number | null;
  nilai110: number | null;
  status: string; // BAIK | MASALAH | HATI-HATI | other text
  monthly: { target: number | null; real: number | null }[]; // 12 entries
  lowerBetter: boolean;
  penalty: boolean;
}
export interface KinerjaMerah {
  indikator: string;
  no: string;
  penyebab: string;
  action: string;
  terdampak: string;
  status: string;
  progress: { month: number; value: string }[];
  lastProgress: string;
}
export interface NkoMonth {
  tab: string;
  monthNo: number; // 1..12
  label: string; // "SEPTEMBER 2026"
  rows: NkoRow[];
  total100: number | null;
  total110: number | null;
  merah: KinerjaMerah[];
}

const LOWER_BETTER = /TLOF|TROF|ABOF|ITOF|ITOD|Mean Time|MTTR|Gangguan/i;

export function normStatus(s: string): string {
  const u = s.trim().toUpperCase();
  if (!u) return '';
  if (u.includes('MASALAH')) return 'MASALAH';
  if (u.includes('HATI')) return 'HATI-HATI';
  if (u.includes('BAIK')) return 'BAIK';
  return s.trim();
}

function shortName(name: string): string {
  const n = name.replace(/^[a-z](\.\d+)?\.?\s+/i, '').trim();
  const paren = n.match(/^([A-Z]{3,6})\s*\(/);
  if (paren) return paren[1];
  if (/^Mean Time To Recovery\s+(\w+)/i.test(n)) return 'MTTR ' + n.match(/^Mean Time To Recovery\s+(\w+)/i)![1];
  return n.length > 28 ? n.slice(0, 26) + '…' : n;
}

export function parseNkoTab(tab: string, grid: Grid, monthNo: number): NkoMonth {
  let headerIdx = grid.findIndex((r) => cell(r, 1).toUpperCase() === 'NO' && cell(r, 2).toUpperCase().includes('INDIKATOR'));
  if (headerIdx < 0) headerIdx = 8;
  const H = grid[headerIdx].map((h) => h.replace(/\s+/g, ' ').trim().toUpperCase());
  const find = (pred: (h: string) => boolean, def: number) => { const i = H.findIndex(pred); return i < 0 ? def : i; };
  const C = {
    no: 1, name: 2,
    bobot: find((h) => h === 'BOBOT', 3),
    satuan: find((h) => h === 'SATUAN', 4),
    t2026: find((h) => h.startsWith('TARGET') && h.includes('2026'), 5),
    tsd: find((h) => h.startsWith('TARGET S.D'), 8),
    rsd: find((h) => h.startsWith('REALISASI S.D'), 9),
    p100: find((h) => h.includes('PENCAPAIAN') && h.includes('100'), 10),
    n100: find((h) => h.startsWith('NILAI') && h.includes('100'), 11),
    p110: find((h) => h.includes('PENCAPAIAN') && h.includes('110'), 12),
    n110: find((h) => h.startsWith('NILAI') && h.includes('110'), 13),
    status: find((h) => h === 'INDIKATOR', 14),
  };
  // monthly wide block
  const monthCols: { m: number; t: number; r: number }[] = [];
  H.forEach((h, i) => {
    const mi = monthIndex(h);
    if (mi && i > C.status) {
      const sub = (grid[headerIdx + 1] || []).map((x) => x.trim().toUpperCase());
      const t = sub[i] === 'TARGET' ? i : i;
      const r = sub[i + 1] === 'REALISASI' ? i + 1 : i + 1;
      monthCols.push({ m: mi, t, r });
    }
  });
  // label
  let label = '';
  for (let i = 0; i < Math.min(headerIdx, 8); i++) {
    const r = grid[i] || [];
    const bi = r.findIndex((c) => c.trim().toUpperCase() === 'BULAN');
    if (bi >= 0) { label = `${cell(r, bi + 1)} ${cell(r, bi + 2)}`.trim(); break; }
  }
  const rows: NkoRow[] = [];
  let total100: number | null = null, total110: number | null = null;
  let section = '';
  let letter = '';
  let i = headerIdx + 1;
  for (; i < grid.length; i++) {
    const r = grid[i];
    const rawNo = cell(r, C.no);
    const name = cell(r, C.name).replace(/\s+/g, ' ');
    if (name.toUpperCase() === 'TOTAL') { total100 = num(cell(r, C.n100)); total110 = num(cell(r, C.n110)); break; }
    if (!name) continue;
    const bobot = cell(r, C.bobot);
    const statusRaw = cell(r, C.status);
    let kind: NkoRowKind;
    let no = '';
    if (/^\d+$/.test(rawNo)) {
      section = rawNo; letter = '';
      kind = bobot ? 'indicator' : 'section';
      no = rawNo;
    } else if (/^[a-z]$/i.test(rawNo)) {
      letter = rawNo.toLowerCase();
      kind = 'indicator';
      no = `${section}.${letter}`;
    } else {
      const m = name.match(/^([a-z])(?:\.(\d+))?\.?\s/i);
      if (m && !name.startsWith('∑')) {
        if (m[2]) no = `${section}.${m[1].toLowerCase()}.${m[2]}`;
        else { letter = m[1].toLowerCase(); no = `${section}.${letter}`; }
        kind = bobot ? 'indicator' : 'section';
      } else {
        kind = 'component';
      }
    }
    const monthly = Array.from({ length: 12 }, () => ({ target: null as number | null, real: null as number | null }));
    for (const mc of monthCols) {
      monthly[mc.m - 1] = { target: num(cell(r, mc.t)), real: num(cell(r, mc.r)) };
    }
    rows.push({
      kind, no, rawNo, name, short: shortName(name), bobot, bobotNum: num(bobot), satuan: cell(r, C.satuan),
      target2026: cell(r, C.t2026),
      targetSd: num(cell(r, C.tsd)), targetSdRaw: cell(r, C.tsd),
      realSd: num(cell(r, C.rsd)), realSdRaw: cell(r, C.rsd),
      pct100: num(cell(r, C.p100)), nilai100: num(cell(r, C.n100)),
      pct110: num(cell(r, C.p110)), nilai110: num(cell(r, C.n110)),
      status: kind === 'component' ? '' : normStatus(statusRaw),
      monthly,
      lowerBetter: LOWER_BETTER.test(name),
      penalty: /max\s*-/i.test(bobot),
    });
  }
  // Kinerja merah
  const merah: KinerjaMerah[] = [];
  const kmIdx = grid.findIndex((r, idx) => idx > i && r.some((c) => c.trim().toUpperCase() === 'KINERJA MERAH'));
  if (kmIdx >= 0) {
    const hIdx = grid.findIndex((r, idx) => idx > kmIdx && r.some((c) => c.toUpperCase().includes('PENYEBAB')));
    if (hIdx >= 0) {
      let indikator = '';
      for (let k = kmIdx + 1; k < hIdx; k++) { const t = (grid[k] || []).map((c) => c.trim()).filter(Boolean).join(' '); if (t) indikator = t; }
      const hr = grid[hIdx].map((c) => c.trim().toUpperCase());
      const cPen = hr.findIndex((c) => c.includes('PENYEBAB'));
      const cAct = hr.findIndex((c) => c === 'ACTION' || c.includes('ACTION'));
      const cInd = hr.findIndex((c) => c.includes('TERDAMPAK'));
      const cSt = hr.findIndex((c) => c === 'STATUS');
      const mr = (grid[hIdx + 1] || []).map((c) => c.trim());
      const mcols: { m: number; c: number }[] = [];
      mr.forEach((c, idx) => { const mi = monthIndex(c); if (mi) mcols.push({ m: mi, c: idx }); });
      for (let k = hIdx + 2; k < grid.length; k++) {
        const r = grid[k];
        if (!/^\d+$/.test(cell(r, 1)) || !cell(r, cPen)) continue;
        const prog = new Map<number, string>();
        for (const mc of mcols) { const v = cell(r, mc.c); if (v) prog.set(mc.m, v); }
        const progress = [...prog.entries()].sort((a, b) => a[0] - b[0]).map(([month, value]) => ({ month, value }));
        merah.push({
          indikator, no: cell(r, 1), penyebab: cell(r, cPen), action: cell(r, cAct), terdampak: cInd >= 0 ? cell(r, cInd) : '',
          status: cell(r, cSt), progress, lastProgress: progress.length ? progress[progress.length - 1].value : '—',
        });
      }
    }
  }
  return { tab, monthNo, label: label || tab, rows, total100, total110, merah };
}

/** Achievement % capped (follows the sheet value when present). */
export const pctOf = (r: NkoRow) => r.pct110 ?? r.pct100;

/* ============================================================
 * TEGAKAN (NS) — sheet "TARIKAN NEW SRINTAMI"
 * ============================================================ */
export const TEG_STATUSES = ['NORMAL', 'BAHAYA_II', 'BAHAYA_I', 'KRITIS'] as const;
export interface TegakanRow {
  no: string; span: string; ultg: string; gi: string; pht: string; tglUpdate: Date | null; tglUpdateRaw: string;
  petugas: string; tipe: string; posisi: string; line: string;
  tinggi: number | null; tinggiSpan: number | null; jarakPohon: number | null; u: number | null; jml: number; status: string; lat: string; lng: string;
}
export function parseTegakan(grid: Grid): { rows: TegakanRow[]; headerTotal: number | null } {
  const hIdx = grid.findIndex((r) => r.some((c) => c.trim().toUpperCase() === 'JML') && r.some((c) => c.trim().toUpperCase() === 'STATUS'));
  const H = (grid[hIdx] || []).map((c) => c.trim().toUpperCase());
  const col = (name: string) => H.indexOf(name);
  const C = {
    no: col('NO'), span: col('SPAN'), ultg: col('ULTG'), gi: col('GARDU INDUK'), pht: col('PENGHANTAR'), upd: col('TGL UPDATE'),
    petugas: col('PETUGAS'), tipe: col('TIPE'), posisi: col('POSISI'), line: col('LINE'), tinggi: col('TINGGI (M)'),
    tspan: col('TINGGI SPAN (M)'), jarak: col('SAMPING SPAN (M)'), u: col('U (M)'), jml: col('JML'), status: col('STATUS'), lat: col('LAT'), lng: col('LNG'),
  };
  let headerTotal: number | null = null;
  for (let k = 0; k < hIdx; k++) { const v = num(cell(grid[k], C.jml)); if (v != null) headerTotal = v; }
  const rows: TegakanRow[] = [];
  for (let k = hIdx + 1; k < grid.length; k++) {
    const r = grid[k];
    const span = cell(r, C.span);
    const status = cell(r, C.status).toUpperCase();
    if (!span || !status) continue;
    rows.push({
      no: cell(r, C.no), span, ultg: cell(r, C.ultg), gi: cell(r, C.gi), pht: cell(r, C.pht),
      tglUpdateRaw: cell(r, C.upd), tglUpdate: parseDate(cell(r, C.upd)), petugas: cell(r, C.petugas), tipe: cell(r, C.tipe).toUpperCase(),
      posisi: cell(r, C.posisi), line: cell(r, C.line), tinggi: num(cell(r, C.tinggi)), tinggiSpan: num(cell(r, C.tspan)), jarakPohon: num(cell(r, C.jarak)),
      u: num(cell(r, C.u)), jml: num0(cell(r, C.jml)), status, lat: cell(r, C.lat), lng: cell(r, C.lng),
    });
  }
  return { rows, headerTotal };
}

export interface TrendSeries { status: string; phts: string[]; points: { date: Date; values: Record<string, number>; total: number }[] }
/** Sheets "TREN KRITIS" / "TREN BAHAYA 1" / ...: TANGGAL | <PHT…> | JUMLAH, newest first. */
export function parseTrend(status: string, grid: Grid): TrendSeries {
  const hIdx = grid.findIndex((r) => cell(r, 0).toUpperCase() === 'TANGGAL');
  const H = (grid[hIdx] || []).map((c) => c.trim());
  const phtCols: { name: string; c: number }[] = [];
  let jmlCol = -1;
  for (let c = 1; c < H.length; c++) {
    if (!H[c]) break;
    if (H[c].toUpperCase() === 'JUMLAH') { jmlCol = c; break; }
    if (H[c].toUpperCase() === 'TANGGAL') break;
    phtCols.push({ name: H[c], c });
  }
  const points: TrendSeries['points'] = [];
  for (let k = hIdx + 1; k < grid.length; k++) {
    const r = grid[k];
    const date = parseDate(cell(r, 0), 'dmy');
    if (!date) continue;
    const values: Record<string, number> = {};
    let sum = 0;
    for (const p of phtCols) { const v = num0(cell(r, p.c)); values[p.name] = v; sum += v; }
    const total = jmlCol >= 0 ? (num(cell(r, jmlCol)) ?? sum) : sum;
    points.push({ date, values, total });
  }
  points.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { status, phts: phtCols.map((p) => p.name), points };
}

/* ============================================================
 * REALISASI PENEBANGAN — "ULTG PEKALONGAN 2024-2026", "ULTG LAHAT 2024-2026"
 * ============================================================ */
export interface PenebanganRow {
  ultg: 'PEKALONGAN' | 'LAHAT'; no: string; tahun: number; bulanNo: number; bulan: string; minggu: string; section: string; tower: string;
  tanggal: Date | null; tanggalRaw: string; pohon: string; status: string; ukuran: string; jumlah: number; tindakan: string; keterangan: string;
}
export function parsePenebangan(ultg: 'PEKALONGAN' | 'LAHAT', grid: Grid): PenebanganRow[] {
  const hIdx = grid.findIndex((r) => cell(r, 1).toUpperCase() === 'TAHUN' && cell(r, 0).toUpperCase() === 'NO');
  const H = (grid[hIdx] || []).map((c) => c.replace(/\s+/g, ' ').trim().toUpperCase());
  const sub = (grid[hIdx + 1] || []).map((c) => c.trim().toUpperCase());
  const idx = (p: (h: string) => boolean, d: number) => { const i = H.findIndex(p); return i < 0 ? d : i; };
  const C = {
    no: 0, tahun: 1, bulanNo: idx((h) => h === 'NO. BULAN', 3), bulan: idx((h) => h === 'BULAN', 4), minggu: idx((h) => h === 'MINGGU', 5),
    section: idx((h) => h === 'SECTION', 7), tower: idx((h) => h.startsWith('TOWER'), 8), tgl: idx((h) => h.startsWith('TANGGAL'), 9),
    pohon: idx((h) => h.startsWith('NAMA POHON'), 10), status: idx((h) => h === 'STATUS', 11), ukuran: idx((h) => h === 'UKURAN', 12),
    jml: Math.max(sub.findIndex((c) => c.startsWith('JUMLAH TOTAL')), 0) || 17,
    tl: idx((h) => h === 'TINDAK LANJUT', 18), ket: idx((h) => h === 'KETERANGAN', 22),
  };
  const out: PenebanganRow[] = [];
  for (let k = hIdx + 2; k < grid.length; k++) {
    const r = grid[k];
    const tahun = parseInt(cell(r, C.tahun), 10);
    if (!tahun) continue;
    const tanggalRaw = cell(r, C.tgl);
    out.push({
      ultg, no: cell(r, C.no), tahun, bulanNo: parseInt(cell(r, C.bulanNo), 10) || 0, bulan: cell(r, C.bulan).toUpperCase(), minggu: cell(r, C.minggu),
      section: cell(r, C.section).replace(/\s+/g, ' '), tower: cell(r, C.tower), tanggal: parseDate(tanggalRaw), tanggalRaw,
      pohon: cell(r, C.pohon).toUpperCase(), status: cell(r, C.status).toUpperCase().replace(/\s+/g, ' '), ukuran: cell(r, C.ukuran).toUpperCase(),
      jumlah: num0(cell(r, C.jml)), tindakan: cell(r, C.tl).toUpperCase(), keterangan: cell(r, C.ket),
    });
  }
  return out;
}

/* ============================================================
 * KERAWANAN TRANSMISI — sheet "SELURUH DATA" (two header rows: groups + columns)
 * ============================================================ */
export interface KerawananRow { idx: number; no: string; ultg: string; pht: string; tower: string; span: string; jenisTower: string; get: (key: string) => string }
export function parseKerawanan(grid: Grid): { rows: KerawananRow[]; keys: string[] } {
  const g = grid[0] || [], s = grid[1] || [];
  const keys: string[] = [];
  let group = '';
  const width = Math.max(g.length, s.length);
  for (let c = 0; c < width; c++) {
    if (cell(g, c)) group = cell(g, c).toUpperCase().replace(/\s+/g, ' ');
    const sub = cell(s, c).toUpperCase().replace(/\s+/g, ' ');
    keys.push(sub ? `${group}|${sub}` : group);
  }
  const keyIndex = new Map<string, number>();
  keys.forEach((k, i) => { if (!keyIndex.has(k)) keyIndex.set(k, i); });
  const rows: KerawananRow[] = [];
  for (let k = 2; k < grid.length; k++) {
    const r = grid[k];
    if (!cell(r, 0) || !cell(r, 4)) continue;
    rows.push({
      idx: k, no: cell(r, 0), ultg: cell(r, 2).toUpperCase(), pht: cell(r, 3), tower: cell(r, 4), span: cell(r, 5), jenisTower: cell(r, 6),
      get: (key: string) => { const i = keyIndex.get(key); return i == null ? '' : cell(r, i); },
    });
  }
  return { rows, keys };
}

/* ============================================================
 * MONITORING GANGGUAN — sheet "UPTBKU"
 * Header: NO | IDCASE | TAHUN | BULAN | TANGGAL GGN | JAM | LOKASI GANGGUAN | PENYEBAB | TEMUAN |
 * TINDAK LANJUT OPEN | PROGRESS TINJUT | STATUS (UPT) | STATUS (PIHAK LUAR) | STATUS (FOIS) | TARGET PENUTUPAN
 * Dates are M/D/Y.
 * ============================================================ */
export interface GangguanRow {
  key: number; no: string; idcase: string; tahun: string; bulan: string; tanggal: Date | null; tanggalRaw: string; jam: string; lokasi: string;
  penyebab: string; temuan: string; tindakLanjut: string; progress: string; statusUpt: string; statusLuar: string; statusFois: string;
  target: Date | null; targetRaw: string; overdueUpt: boolean; overdueFois: boolean; isOpen: boolean;
}
export function parseGangguan(grid: Grid): GangguanRow[] {
  const hIdx = grid.findIndex((r) => cell(r, 1).toUpperCase() === 'NO' && r.some((c) => c.trim().toUpperCase() === 'LOKASI GANGGUAN'));
  const H = (grid[hIdx] || []).map((c) => c.trim().toUpperCase());
  const grp = (grid[hIdx - 1] || []).map((c) => c.trim().toUpperCase());
  const statusCols = H.map((h, i) => (h === 'STATUS' ? i : -1)).filter((i) => i >= 0);
  const findGrp = (name: string, d: number) => statusCols.find((i) => grp[i]?.includes(name)) ?? d;
  const C = {
    no: 1, id: H.indexOf('IDCASE'), tahun: H.indexOf('TAHUN'), bulan: H.indexOf('BULAN'), tgl: H.findIndex((h) => h.startsWith('TANGGAL')),
    jam: H.findIndex((h) => h.startsWith('JAM')), lok: H.indexOf('LOKASI GANGGUAN'), pen: H.indexOf('PENYEBAB'), tem: H.indexOf('TEMUAN'),
    tl: H.findIndex((h) => h.startsWith('TINDAK LANJUT')), prog: H.findIndex((h) => h.startsWith('PROGRESS')),
    upt: findGrp('UPT', statusCols[0] ?? 12), luar: findGrp('LUAR', statusCols[1] ?? 13), fois: findGrp('FOIS', statusCols[2] ?? 14),
    target: H.findIndex((h) => h.startsWith('TARGET')),
  };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out: GangguanRow[] = [];
  for (let k = hIdx + 1; k < grid.length; k++) {
    const r = grid[k];
    if (!/^\d+$/.test(cell(r, C.no)) || !cell(r, C.lok)) continue;
    const statusUpt = cell(r, C.upt).toUpperCase();
    const statusFois = cell(r, C.fois).toUpperCase();
    const targetRaw = cell(r, C.target);
    const target = parseDate(targetRaw, 'mdy');
    const past = !!target && target.getTime() < today.getTime();
    out.push({
      key: k, no: cell(r, C.no), idcase: cell(r, C.id), tahun: cell(r, C.tahun), bulan: cell(r, C.bulan), tanggalRaw: cell(r, C.tgl),
      tanggal: parseDate(cell(r, C.tgl), 'mdy'), jam: cell(r, C.jam), lokasi: cell(r, C.lok).replace(/\s+/g, ' ').toUpperCase(),
      penyebab: cell(r, C.pen).toUpperCase() || '-', temuan: cell(r, C.tem), tindakLanjut: cell(r, C.tl), progress: cell(r, C.prog),
      statusUpt, statusLuar: cell(r, C.luar).toUpperCase(), statusFois, target, targetRaw,
      overdueUpt: statusUpt === 'OPEN' && past, overdueFois: statusFois === 'OPEN' && past,
      isOpen: statusUpt === 'OPEN' || statusFois === 'OPEN',
    });
  }
  return out;
}

/* ============================================================
 * SUMMARY GANGGUAN — sheet "INPUT GGN PHT" (spreadsheet rekap gangguan)
 * Header (baris ke-3): NO | UPT | TAHUN | BULAN | NO. BULAN | TANGGAL | MINGGU | ULTG |
 * TEGANGAN (kV) | PENGHANTAR | SEGMEN | ASET | PENYEBAB | PENYEBAB DETIL | STATUS |
 * KET STATUS | TGL GGN | JAM GGN | WAKTU SIAP OPERASI/DECLARE | TGL NORMAL | JAM NORMAL |
 * DURASI (Jam) ×2 | TEMUAN | NO. TOWER TEMUAN | KODE KINERJA | ENS (MWh) |
 * Jam Petir LDS | Analisa DFR | Temuan Lapangan | Evaluasi Kinerja DFR |
 * KETERANGAN TAMBAHAN | line 1 | line 2 | LINK ANEV
 * Tanggal format "1-Jan-20" (d-Mon-yy). Kolom DURASI ganda: kolom pertama
 * adalah durasi total (jam) — cocok dengan selisih jam normal − jam gangguan
 * di semua baris yang bisa dicek (mis. NO 323: 30,13 jam); kolom kedua hanya
 * dipakai bila kolom pertama kosong/teks. Nilai "0:41" dibaca sebagai 41 menit.
 * ============================================================ */
export interface RekapGangguanRow {
  key: number; no: string; tahun: string; bulan: string; noBulan: number | null;
  tanggal: Date | null; tanggalRaw: string; minggu: string; ultg: string;
  tegangan: string; teganganNum: number | null; penghantar: string; segmen: string; aset: string;
  penyebab: string; penyebabDetil: string; status: string; ketStatus: string;
  tglGgn: Date | null; jamGgn: string; tglNormal: Date | null; jamNormal: string;
  durasi: number | null; temuan: string; towerTemuan: string; kodeKinerja: string; ens: number | null;
  jamPetirLds: string; analisaDfr: string; temuanLapangan: string; evaluasiKinerja: string;
  keterangan: string; linkAnev: string;
}
/** Durasi: angka jam ("0,317") atau format jam:menit ("0:41" → 0,68 jam). */
function parseDurasi(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) return +m[1] + +m[2] / 60 + (+m[3] || 0) / 3600;
  return num(s);
}
export function parseRekapGangguan(grid: Grid): RekapGangguanRow[] {
  const hIdx = grid.findIndex((r) => cell(r, 0).toUpperCase() === 'NO' && r.some((c) => c.trim().toUpperCase() === 'PENGHANTAR'));
  if (hIdx < 0) return [];
  const H = (grid[hIdx] || []).map((c) => c.trim().toUpperCase().replace(/\s+/g, ' '));
  const col = (name: string) => H.indexOf(name);
  const durCols = H.map((h, i) => (h.startsWith('DURASI') ? i : -1)).filter((i) => i >= 0);
  const C = {
    no: 0, tahun: col('TAHUN'), bulan: col('BULAN'), noBulan: col('NO. BULAN'), tgl: col('TANGGAL'), minggu: col('MINGGU'),
    ultg: col('ULTG'), teg: col('TEGANGAN (KV)'), pht: col('PENGHANTAR'), seg: col('SEGMEN'), aset: col('ASET'),
    pen: col('PENYEBAB'), det: col('PENYEBAB DETIL'), st: col('STATUS'), ketSt: col('KET STATUS'),
    tglGgn: col('TGL GGN'), jamGgn: col('JAM GGN'), tglNormal: col('TGL NORMAL'), jamNormal: col('JAM NORMAL'),
    tem: col('TEMUAN'), tower: col('NO. TOWER TEMUAN'), kode: col('KODE KINERJA'), ens: col('ENS (MWH)'),
    lds: col('JAM PETIR LDS'), dfr: col('ANALISA DFR'), lap: col('TEMUAN LAPANGAN'), ev: col('EVALUASI KINERJA DFR'),
    ket: col('KETERANGAN TAMBAHAN'), link: col('LINK ANEV'),
  };
  const out: RekapGangguanRow[] = [];
  for (let k = hIdx + 1; k < grid.length; k++) {
    const r = grid[k];
    if (!/^\d+$/.test(cell(r, C.no)) || !cell(r, C.pht)) continue;
    const tanggalRaw = cell(r, C.tgl);
    const durasi = durCols.length ? (parseDurasi(cell(r, durCols[0])) ?? (durCols.length > 1 ? parseDurasi(cell(r, durCols[durCols.length - 1])) : null)) : null;
    out.push({
      key: k, no: cell(r, C.no), tahun: cell(r, C.tahun), bulan: cell(r, C.bulan), noBulan: num(cell(r, C.noBulan)),
      tanggal: parseDate(tanggalRaw, 'dmy'), tanggalRaw, minggu: cell(r, C.minggu),
      ultg: cell(r, C.ultg).toUpperCase(), tegangan: cell(r, C.teg), teganganNum: num(cell(r, C.teg)),
      penghantar: cell(r, C.pht).replace(/\s+/g, ' ').toUpperCase(), segmen: cell(r, C.seg).replace(/\s+/g, ' ').toUpperCase(),
      aset: cell(r, C.aset).toUpperCase(), penyebab: cell(r, C.pen).toUpperCase() || '-', penyebabDetil: cell(r, C.det),
      status: cell(r, C.st).toUpperCase() || '-', ketStatus: cell(r, C.ketSt),
      tglGgn: parseDate(cell(r, C.tglGgn), 'dmy'), jamGgn: cell(r, C.jamGgn),
      tglNormal: parseDate(cell(r, C.tglNormal), 'dmy'), jamNormal: cell(r, C.jamNormal),
      durasi, temuan: cell(r, C.tem), towerTemuan: cell(r, C.tower), kodeKinerja: cell(r, C.kode).toUpperCase() || '-',
      ens: num(cell(r, C.ens)), jamPetirLds: cell(r, C.lds), analisaDfr: cell(r, C.dfr), temuanLapangan: cell(r, C.lap),
      evaluasiKinerja: cell(r, C.ev), keterangan: cell(r, C.ket), linkAnev: cell(r, C.link),
    });
  }
  return out;
}
