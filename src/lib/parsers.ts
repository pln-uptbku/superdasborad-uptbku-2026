import { cell, Grid, MONTHS_SHORT, monthIndex, num, num0, parseDate } from './sheets';

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
/* ============================================================
 * PENTANAHAN TOWER (NEW SRINTAMI) — sheet "REKAP PENGUKURAN PENTANAHAN UPT BKU"
 * ASESMEN PENTANAHAN <tahun>: header baris 0 (23 kolom): No | PHT | Lokasi |
 * Tanggal | Upt | Ultg | Alat | Grounding | Leg A–D | Direct Gr Nilai |
 * Pspt Gr Nilai | Dalam Gr Nilai | Luar Gr Nilai | Nilai Max | Kondisi |
 * Tahanan | RE | Resistivitas | Rekomendasi | Terpasang.
 * REALISASI <tahun>: tabel kanan, header baris 1 (PENANGGUNG JAWAB F | PHT G |
 * TARGET H | KONDISI I | PERSENTASE K), sub-header baris 2 (BAIK I | BURUK J),
 * data dari baris 3, baris TOTAL (G='TOTAL'). Sisi kiri adalah pivot — diabaikan.
 * JADWAL 2026 ULTG <x>: header baris 0–2 (NO | ULTG | PENGHANTAR | TOWER |
 * blok TARGET Feb–Sep col 4–35 + blok REALISASI col 36–67), data dari baris 3.
 * CHECKLIST 2024: header baris 0 (PHT | TOWER | CHECKLIST V/X), data baris 1+.
 * REALISASI 2024: header baris 2 (PENANGGUNG JAWAB A | PHT B | V C | X D |
 * Grand Total E | TARGET F | REALISASI G | PERSENTASE H | TARGET I | KENDALA J),
 * data baris 3–16, baris TOTAL (B='TRS UPT BENGKULU').
 *
 * Aturan Kondisi (SKDIR, Gambar 2-10 "Pengujian Resistansi Pentanahan Tower"):
 * tower ujung = 5 tower pertama (no. 1–5) dan 5 tower terakhir (no. N-4 s.d. N)
 * tiap penghantar → ambang 3 Ohm (70/150/275 kV), 1 Ohm (500 kV, tidak ada
 * di data); tower lain → 10 Ohm (SPLN). BAIK bila Nilai Max <= ambang.
 * N per penghantar = max(nomor tower tertinggi di ASESMEN, target REALISASI)
 * — ujung rentang Jadwal TIDAK dipakai: rentang Jadwal adalah blok 7 tower
 * seragam yang blok terakhirnya bisa melampaui ujung jalur nyata (mis.
 * PBAAI-ARMUR: Jadwal 169–175 padahal jalur hanya 174 tower; N=174 memberi
 * BAIK 1.354 / BURUK 883 untuk 2026, N=175 memberi 1.355/882 — salah satu
 * tower, #0170, ikut berubah status). Rekap per tower UNIK: bila satu tower
 * tercatat 2x, dipakai pengukuran terbaru (tanggal max; seri → baris terakhir).
 * Kondisi dihitung dari Nilai Max + posisi, BUKAN dari kolom Kondisi sheet
 * (kolom sheet memakai 10 Ohm rata untuk semua tower).
 * ============================================================ */

const PHT_ALIASES: Record<string, string> = { BJSRI: 'BJSARI', KBAGN: 'KBANG', PKLGN: 'PKLNG', TES: 'TESS', ARGMR: 'ARMUR' };

/** Kunci kanonik penghantar: buang "TRS"/tegangan, betulkan varian ejaan
    (BJSRI→BJSARI, KBAGN→KBANG, PKLGN→PKLNG, TES→TESS, ARGMR→ARMUR),
    urutkan kedua ujung secara alfabetis supaya "LAHAT-KBANG" dan
    "KBAGN-LAHAT" (juga "TES"/"TESS", "PKLGN"/"PKLNG") bergabung. */
export function canonPht(name: string): string {
  const s = name.toUpperCase().replace(/\bTRS\b/g, '').replace(/\d+\s*KV/g, '');
  const parts = s.split('-').map((p) => p.trim()).filter(Boolean).map((p) => PHT_ALIASES[p] ?? p);
  parts.sort();
  return parts.join('|');
}

/** Nama tampilan penghantar: seperti canonPht tapi urutan ujung dipertahankan
    (mis. "TESS-PKLNG", "LAHAT-KBANG", "PBAAI-ARMUR"). */
export function dispPht(name: string): string {
  const s = name.toUpperCase().replace(/\bTRS\b/g, '').replace(/\d+\s*KV/g, '');
  return s.split('-').map((p) => p.trim()).filter(Boolean).map((p) => PHT_ALIASES[p] ?? p).join('-').replace(/\s+/g, ' ');
}

export function towerNoOf(lokasi: string): number | null {
  const m = lokasi.match(/#(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
export function voltOf(lokasi: string): number | null {
  const m = lokasi.match(/(\d+)\s*kV/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Ambang SKDIR: tower ujung (5 pertama + 5 terakhir) 3 Ohm (1 Ohm bila 500 kV),
    tower lain 10 Ohm (SPLN). `total` = N (jumlah tower penghantar). */
export function ambangPentanahan(n: number | null, total: number | null, kv: number | null): number {
  if (n != null && total != null && total > 0 && (n <= 5 || n >= total - 4)) return kv === 500 ? 1 : 3;
  return 10;
}

/** Integer dengan pemisah ribuan gaya US ("2,423" → 2423). num() biasa salah
    di sini karena menganggap koma sebagai desimal (gaya Indonesia). */
const intCell = (v: string): number | null => {
  const s = v.trim();
  if (!s) return null;
  const n = parseInt(s.replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};

export interface PentanahanRawRow {
  key: number; pht: string; phtKey: string; lokasi: string; lokasiKey: string;
  tanggal: Date | null; tanggalRaw: string; ultg: string; alat: string;
  legA: number | null; legB: number | null; legC: number | null; legD: number | null;
  nilaiMax: number | null; kondisiSheet: string; rekomendasi: string; terpasang: string;
}

export function parsePentanahanAsesmen(grid: Grid): PentanahanRawRow[] {
  const out: PentanahanRawRow[] = [];
  for (let k = 1; k < grid.length; k++) {
    const r = grid[k];
    if (r.length < 23 || !cell(r, 1)) continue;
    const lokasi = cell(r, 2).replace(/\s+/g, ' ');
    out.push({
      key: k, pht: dispPht(cell(r, 1)), phtKey: canonPht(cell(r, 1)), lokasi,
      lokasiKey: lokasi.toUpperCase(),
      tanggalRaw: cell(r, 3), tanggal: parseDate(cell(r, 3)),
      ultg: cell(r, 5).toUpperCase(), alat: cell(r, 6).toUpperCase(),
      legA: num(cell(r, 8)), legB: num(cell(r, 9)), legC: num(cell(r, 10)), legD: num(cell(r, 11)),
      nilaiMax: num(cell(r, 16)), kondisiSheet: cell(r, 17).toUpperCase(),
      rekomendasi: cell(r, 21).toUpperCase(), terpasang: cell(r, 22).toUpperCase(),
    });
  }
  return out;
}

export interface PentanahanTower extends PentanahanRawRow {
  towerNo: number | null;
  kv: number | null;
  ujung: boolean;
  ambang: number;
  kondisi: 'BAIK' | 'BURUK';
  /** Sheet BAIK (10 Ohm rata) tetapi SKDIR BURUK — tower ujung 3–10 Ohm. */
  flipped: boolean;
}
export interface PentanahanRekap {
  phtKey: string; pht: string; pj: string; target: number;
  terukur: number; baik: number; buruk: number; pct: number | null; maxNilai: number | null;
}
export interface PentanahanYearData {
  year: number;
  towers: PentanahanTower[];
  rekap: PentanahanRekap[];
  target: number;
  total: number; // tower unik terukur
  baik: number; buruk: number;
  belumDiukur: number; // target − terukur (>= 0)
  pct: number; // terukur / target * 100
  flipped: number; // tower berubah BAIK→BURUK vs kolom Kondisi sheet
  months: { month: string; label: string; total: number; buruk: number }[];
  sheetTotal: { target: number | null; baik: number | null; buruk: number | null; pct: string } | null;
  rawRows: number; // baris ASESMEN (termasuk BELUM DIUKUR)
  belumDiukurRows: number; // baris BELUM DIUKUR (tanpa pengukuran)
  missingRekap: string[]; // PHT di REALISASI tanpa baris ASESMEN
  /** Tab REALISASI tahun ini ada (false = target/realisasi belum tersedia;
      target dihitung 0, % Realisasi & Belum Diukur ditampilkan '—'). */
  hasRealisasi: boolean;
}

/** REALISASI <tahun>: {phtKey → {pht, pj, target}} + baris TOTAL sheet.
 *  `null` (tab REALISASI tahun itu belum ada) → tidak ada baris/total;
 *  target tahun dihitung 0 dan halaman menampilkan '—' untuk % Realisasi. */
function parsePentanahanRealisasi(grid: Grid | null): { rows: { phtKey: string; pht: string; pj: string; target: number }[]; total: PentanahanYearData['sheetTotal'] } {
  const rows: { phtKey: string; pht: string; pj: string; target: number }[] = [];
  let total: PentanahanYearData['sheetTotal'] = null;
  if (!grid) return { rows, total };
  const hIdx = grid.findIndex((r) => cell(r, 6).toUpperCase() === 'PHT');
  if (hIdx < 0) return { rows, total };
  for (let k = hIdx + 1; k < grid.length; k++) {
    const r = grid[k];
    const pht = cell(r, 6);
    if (!pht) continue;
    if (pht.toUpperCase() === 'TOTAL') {
      total = { target: intCell(cell(r, 7)), baik: intCell(cell(r, 8)), buruk: intCell(cell(r, 9)), pct: cell(r, 10) };
      continue;
    }
    const target = intCell(cell(r, 7));
    if (target == null) continue;
    rows.push({ phtKey: canonPht(pht), pht: dispPht(pht), pj: cell(r, 5), target });
  }
  return { rows, total };
}

/** Satu tahun ASESMEN + REALISASI → tower unik + rekap + tren bulanan.
 *  `realGrid` boleh null (tab REALISASI tahun itu belum ada): tower tetap
 *  dibangun dari ASESMEN, target = 0, `hasRealisasi` = false. */
export function buildPentanahanYear(year: number, asesGrid: Grid, realGrid: Grid | null): PentanahanYearData {
  const raw = parsePentanahanAsesmen(asesGrid);
  const measured = raw.filter((r) => r.kondisiSheet === 'BAIK' || r.kondisiSheet === 'BURUK');
  // Dedup per tower unik (kunci: PHT kanonik + string Lokasi penuh) —
  // pengukuran terbaru menang (tanggal max; seri → baris terakhir).
  const latest = new Map<string, { r: PentanahanRawRow; idx: number }>();
  measured.forEach((r, idx) => {
    const key = `${r.phtKey}||${r.lokasiKey}`;
    const cur = latest.get(key);
    const t = r.tanggal?.getTime() ?? -1;
    const ct = cur?.r.tanggal?.getTime() ?? -1;
    if (!cur || t > ct || (t === ct && idx >= cur.idx)) latest.set(key, { r, idx });
  });
  const towers0 = [...latest.values()].map((v) => v.r);
  const { rows: realRows, total: sheetTotal } = parsePentanahanRealisasi(realGrid);
  const realByKey = new Map(realRows.map((x) => [x.phtKey, x]));
  // N per penghantar = max(nomor tower tertinggi di ASESMEN, target REALISASI).
  const maxNo = new Map<string, number>();
  for (const r of towers0) {
    const n = towerNoOf(r.lokasi);
    if (n != null) maxNo.set(r.phtKey, Math.max(maxNo.get(r.phtKey) ?? 0, n));
  }
  const nOf = (k: string) => Math.max(maxNo.get(k) ?? 0, realByKey.get(k)?.target ?? 0);
  const towers: PentanahanTower[] = towers0.map((r) => {
    const towerNo = towerNoOf(r.lokasi);
    const kv = voltOf(r.lokasi);
    const N = nOf(r.phtKey);
    const ujung = towerNo != null && N > 0 && (towerNo <= 5 || towerNo >= N - 4);
    const ambang = ambangPentanahan(towerNo, N, kv);
    const kondisi: 'BAIK' | 'BURUK' = r.nilaiMax != null && r.nilaiMax <= ambang ? 'BAIK' : 'BURUK';
    return { ...r, towerNo, kv, ujung, ambang, kondisi, flipped: r.kondisiSheet === 'BAIK' && kondisi === 'BURUK' };
  });
  const agg = new Map<string, { terukur: number; baik: number; buruk: number; maxNilai: number | null }>();
  for (const t of towers) {
    const o = agg.get(t.phtKey) ?? { terukur: 0, baik: 0, buruk: 0, maxNilai: null as number | null };
    o.terukur += 1;
    if (t.kondisi === 'BAIK') o.baik += 1; else o.buruk += 1;
    if (t.nilaiMax != null) o.maxNilai = o.maxNilai == null ? t.nilaiMax : Math.max(o.maxNilai, t.nilaiMax);
    agg.set(t.phtKey, o);
  }
  const keys = new Set([...agg.keys(), ...realByKey.keys()]);
  const rekap: PentanahanRekap[] = [...keys].map((k) => {
    const a = agg.get(k) ?? { terukur: 0, baik: 0, buruk: 0, maxNilai: null };
    const b = realByKey.get(k);
    return {
      phtKey: k, pht: b?.pht ?? towers.find((t) => t.phtKey === k)?.pht ?? k, pj: b?.pj ?? '—',
      target: b?.target ?? 0, terukur: a.terukur, baik: a.baik, buruk: a.buruk,
      pct: b?.target ? (a.terukur / b.target) * 100 : null, maxNilai: a.maxNilai,
    };
  }).sort((x, y) => y.buruk - x.buruk || y.terukur - x.terukur);
  const target = realRows.reduce((a, x) => a + x.target, 0);
  const baik = towers.filter((t) => t.kondisi === 'BAIK').length;
  const buruk = towers.length - baik;
  const monthsMap = new Map<string, { total: number; buruk: number }>();
  for (const t of towers) {
    if (!t.tanggal) continue;
    const m = `${t.tanggal.getFullYear()}-${String(t.tanggal.getMonth() + 1).padStart(2, '0')}`;
    const o = monthsMap.get(m) ?? { total: 0, buruk: 0 };
    o.total += 1;
    if (t.kondisi === 'BURUK') o.buruk += 1;
    monthsMap.set(m, o);
  }
  const months = [...monthsMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => {
    const [y, mo] = month.split('-');
    return { month, label: `${MONTHS_SHORT[+mo - 1]} ${y}`, total: v.total, buruk: v.buruk };
  });
  return {
    year, towers, rekap, target, total: towers.length, baik, buruk,
    belumDiukur: Math.max(0, target - towers.length),
    pct: target ? (towers.length / target) * 100 : 0,
    flipped: towers.filter((t) => t.flipped).length,
    months, sheetTotal, rawRows: raw.length,
    belumDiukurRows: raw.length - measured.length,
    missingRekap: realRows.filter((x) => !agg.has(x.phtKey)).map((x) => x.pht),
    hasRealisasi: realGrid != null,
  };
}

/* ---------- JADWAL 2026 ---------- */
export interface PentanahanJadwalRow {
  year: number; key: number; ultg: string; pht: string; phtKey: string; range: string; start: number; end: number;
  minggu: string; bulan: string; mingguNo: number; label: string;
}
const JADWAL_MONTHS = ['FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER'];
/** Minggu diturunkan dari URUTAN BARIS per penghantar: baris ke-i = Feb M1 + i
    minggu (pola terverifikasi 291/291 baris dari warna fill FFCFE2F3 di export
    XLSX; CSV tidak membawa warna). Nama bulan dibaca dari baris header (baris
    1, forward-fill dari kolom pertama tiap blok 4 minggu); bila header tidak
    terbaca, dipakai urutan Feb–Sep. Blok REALISASI (col 36+) masih kosong
    (0 sel berwarna) — v1 hanya menampilkan minggu TARGET. */
export function parsePentanahanJadwal(ultg: 'PEKALONGAN' | 'LAHAT', grid: Grid, year: number): { rows: PentanahanJadwalRow[]; warnings: string[] } {
  const warnings: string[] = [];
  // Nama bulan dari baris header 1, kolom 4–35 (blok TARGET).
  const headerMonths: string[] = [];
  let cur = '';
  for (let c = 4; c <= 35; c++) {
    const v = cell(grid[1], c).toUpperCase();
    if (v) cur = v;
    headerMonths.push(cur);
  }
  const monthAt = (weekIdx: number) => headerMonths[weekIdx] || JADWAL_MONTHS[Math.floor(weekIdx / 4)] || '';
  if (new Set(headerMonths.filter(Boolean)).size < 8) warnings.push(`Header bulan ${ultg} tidak lengkap — label minggu memakai urutan Feb–Sep.`);
  const rows: PentanahanJadwalRow[] = [];
  const perPht = new Map<string, number>();
  for (let k = 3; k < grid.length; k++) {
    const r = grid[k];
    const phtRaw = cell(r, 2);
    if (!phtRaw) continue;
    const nums = (cell(r, 3).match(/\d+/g) ?? []).map(Number);
    if (nums.length < 2) { warnings.push(`Baris ${k + 1} ${ultg}: rentang tower "${cell(r, 3)}" tidak terbaca.`); continue; }
    const phtKey = canonPht(phtRaw);
    const idx = perPht.get(phtKey) ?? 0;
    perPht.set(phtKey, idx + 1);
    const bulan = monthAt(idx);
    const mingguNo = (idx % 4) + 1;
    rows.push({
      year, key: k, ultg, pht: dispPht(phtRaw), phtKey, range: cell(r, 3), start: nums[0], end: nums[nums.length - 1],
      minggu: `M${mingguNo}`, bulan, mingguNo, label: `${bulan} M${mingguNo}`,
    });
  }
  for (const [k, n] of perPht) {
    if (n > 32) warnings.push(`Penghantar ${k} (${ultg}): ${n} baris jadwal melebihi 32 minggu Feb–Sep — minggu dihitung dari urutan baris, periksa sheet.`);
  }
  return { rows, warnings };
}

/* ---------- CHECKLIST + REALISASI 2024 ---------- */
export interface PentanahanChecklistRow { phtKey: string; pht: string; tower: string; status: 'V' | 'X'; }
export interface PentanahanChecklistRekap {
  phtKey: string; pht: string; pj: string; target: number;
  v: number; x: number; pct: number | null; kendala: string;
}
export interface PentanahanData2024 {
  rekap: PentanahanChecklistRekap[];
  rows: PentanahanChecklistRow[];
  target: number; v: number; x: number; pct: number;
  /** Selisih CHECKLIST vs REALISASI 2024 (V/X per PHT) — catatan kualitas data. */
  mismatch: string[];
  checklistRows: number;
}
export function buildPentanahan2024(checklistGrid: Grid, realGrid: Grid): PentanahanData2024 {
  // CHECKLIST 2024: PHT | TOWER | CHECKLIST (V/X). Dihitung per baris apa adanya.
  const per = new Map<string, { pht: string; v: number; x: number }>();
  const rows: PentanahanChecklistRow[] = [];
  let checklistRows = 0;
  for (let k = 1; k < checklistGrid.length; k++) {
    const r = checklistGrid[k];
    if (r.length < 3 || !cell(r, 0) || !cell(r, 1)) continue;
    const key = canonPht(cell(r, 0));
    const o = per.get(key) ?? { pht: dispPht(cell(r, 0)), v: 0, x: 0 };
    const c = cell(r, 2).toUpperCase();
    if (c !== 'V' && c !== 'X') continue;
    if (c === 'V') o.v += 1; else o.x += 1;
    per.set(key, o);
    rows.push({ phtKey: key, pht: dispPht(cell(r, 0)), tower: cell(r, 1).replace(/\s+/g, ' '), status: c });
    checklistRows += 1;
  }
  // REALISASI 2024: header baris 2 (PJ A | PHT B | V C | X D | TARGET F |
  // REALISASI G | KENDALA J). Baris TOTAL (B='TRS UPT BENGKULU') dilewati —
  // total dihitung dari CHECKLIST + target, bukan dari baris total sheet.
  const hIdx = realGrid.findIndex((r) => cell(r, 0).toUpperCase() === 'PENANGGUNG JAWAB' && cell(r, 1).toUpperCase() === 'PHT');
  const base = new Map<string, { pht: string; pj: string; target: number; kendala: string; vSheet: number | null; xSheet: number | null }>();
  if (hIdx >= 0) {
    for (let k = hIdx + 1; k < realGrid.length; k++) {
      const r = realGrid[k];
      const pht = cell(r, 1);
      if (!pht || /TRS UPT/i.test(pht)) continue;
      const target = intCell(cell(r, 5));
      if (target == null) continue;
      base.set(canonPht(pht), { pht: dispPht(pht), pj: cell(r, 0), target, kendala: cell(r, 9), vSheet: intCell(cell(r, 2)), xSheet: intCell(cell(r, 3)) });
    }
  }
  const mismatch: string[] = [];
  const keys = new Set([...per.keys(), ...base.keys()]);
  const rekap: PentanahanChecklistRekap[] = [...keys].map((k) => {
    const c = per.get(k) ?? { pht: base.get(k)?.pht ?? k, v: 0, x: 0 };
    const b = base.get(k);
    if (b && (b.vSheet != null && b.vSheet !== c.v || b.xSheet != null && b.xSheet !== c.x)) {
      mismatch.push(`${c.pht}: CHECKLIST V ${c.v}/X ${c.x} vs REALISASI 2024 V ${b.vSheet ?? '—'}/X ${b.xSheet ?? '—'}`);
    }
    return {
      phtKey: k, pht: c.pht, pj: b?.pj ?? '—', target: b?.target ?? c.v + c.x,
      v: c.v, x: c.x, pct: (b?.target ?? c.v + c.x) ? (c.v / (b?.target ?? c.v + c.x)) * 100 : null,
      kendala: b?.kendala ?? '',
    };
  }).sort((a, b) => b.v - a.v || b.x - a.x);
  const target = rekap.reduce((a, r) => a + r.target, 0);
  const v = rekap.reduce((a, r) => a + r.v, 0);
  const x = rekap.reduce((a, r) => a + r.x, 0);
  return { rekap, rows, target, v, x, pct: target ? (v / target) * 100 : 0, mismatch, checklistRows };
}
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
