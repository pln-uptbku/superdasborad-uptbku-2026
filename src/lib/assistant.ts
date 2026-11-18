// AI Assistant demo — client + registry konteks (browser).
// Konteks dibangun oleh halaman dari data yang SUDAH dimuat & dirender
// (angka konteks = angka yang tampil di halaman, termasuk filter aktif),
// lalu didaftarkan ke registry ini. Widget membaca registry saat kirim.

export interface AssistantContext {
  page: 'dashboard' | 'pentanahan' | 'beranda' | 'kinerja' | 'tegakan' | 'penebangan' | 'kerawanan' | 'gangguan' | 'ultg' | 'galeri';
  tahun?: number;
  filter?: Record<string, string>;
  ringkasan: Record<string, unknown>;
  sumber: string[];
  diakses: string; // YYYY-MM-DD
}

const registry = new Map<string, AssistantContext>();
const listeners = new Set<(page: string) => void>();

export function setAssistantContext(page: string, ctx: AssistantContext | null) {
  if (ctx) registry.set(page, ctx);
  else registry.delete(page);
  listeners.forEach((fn) => fn(page));
}

/** Berlangganan perubahan registry (widget me-render ulang saat konteks halaman berganti). */
export function subscribeAssistantContext(fn: (page: string) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getAssistantContext(page: string): AssistantContext | null {
  return registry.get(page) ?? null;
}

export function todayId(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Route -> nama halaman konteks (semua halaman punya widget aktif). */
export function routeToPage(pathname: string): AssistantContext['page'] {
  if (pathname.startsWith('/pentanahan')) return 'pentanahan';
  if (pathname.startsWith('/kinerja')) return 'kinerja';
  if (pathname.startsWith('/tegakan')) return 'tegakan';
  if (pathname.startsWith('/penebangan')) return 'penebangan';
  if (pathname.startsWith('/kerawanan')) return 'kerawanan';
  if (pathname.startsWith('/gangguan')) return 'gangguan';
  if (pathname.startsWith('/ultg')) return 'ultg';
  if (pathname.startsWith('/galeri')) return 'galeri';
  if (pathname === '/' || pathname === '') return 'beranda';
  return 'dashboard';
}

export const SUGGESTED_QUESTIONS: Record<AssistantContext['page'], string[]> = {
  dashboard: [
    'NKO bulan ini berapa?',
    'KPI apa saja yang MASALAH?',
    'Berapa gangguan OPEN saat ini?',
  ],
  pentanahan: [
    'Berapa tower pentanahan yang BURUK tahun ini?',
    'Penghantar mana yang paling banyak BURUK?',
    'Berapa % realisasi pentanahan tahun ini?',
  ],
  beranda: [
    'NKO bulan ini berapa?',
    'Berapa gangguan yang masih OPEN?',
    'Indikator kinerja apa yang paling rendah bulan ini?',
  ],
  kinerja: [
    'NKO bulan ini berapa?',
    'Indikator apa saja yang berstatus MASALAH?',
    'Bagaimana tren NKO tahun ini?',
  ],
  tegakan: [
    'Berapa total tegakan KRITIS?',
    'Penghantar mana yang paling banyak tegakan KRITIS?',
    'Berapa total tegakan ULTG LAHAT?',
  ],
  penebangan: [
    'Berapa total penebangan tahun ini?',
    'Berapa pohon KRITIS yang belum ditebang?',
    'Section mana yang paling banyak penebangan?',
  ],
  kerawanan: [
    'Berapa tower rawan petir?',
    'Penghantar mana yang paling banyak tower rawan?',
    'Berapa tower berstatus Kritis Mayor?',
  ],
  gangguan: [
    'Berapa gangguan OPEN saat ini?',
    'Penyebab gangguan terbanyak apa?',
    'Tahun berapa gangguan terbanyak?',
  ],
  ultg: [
    'Berapa total gangguan bulan ini?',
    'Berapa gangguan Trip dan Reclose bulan ini?',
    'Penghantar mana yang paling sering gangguan bulan ini?',
  ],
  galeri: [
    'Ada berapa foto bulan ini?',
    'Foto apa saja di bulan ini?',
    'Bidang apa yang paling banyak fotonya?',
  ],
};

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  provider?: string;
  providerLabel?: string;
  /** true bila jawaban berasal dari FAQ terverifikasi (tanpa LLM). */
  fromFaq?: boolean;
  error?: boolean;
  /** Pertanyaan pengguna yang dijawab balon ini (untuk vote + share). */
  question?: string;
  /** Vote perangkat ini untuk jawaban ini (optimistis, sesi berjalan). */
  vote?: 'up' | 'down';
}

export interface AskResult {
  answer: string;
  sources: string[];
  provider: string;
  providerLabel?: string;
  fromFaq?: boolean;
}

/** Ambil pesan galat sebagai string. Field error/detail dari respons BISA berupa
 *  objek (mis. galat gateway Vercel: {"error":{"code":...,"message":...}}) —
 *  bila dilempar mentah ke `new Error()`, pesannya jadi "[object Object]".
 *  Untuk objek, pakai .message bila ada, kalau tidak JSON-nya. */
function errorMessage(data: any, status: number): string {
  const raw = data && (data.error || data.detail);
  if (typeof raw === 'string' && raw) return raw;
  if (raw && typeof raw === 'object') {
    if (typeof (raw as any).message === 'string' && (raw as any).message) return (raw as any).message;
    try {
      const s = JSON.stringify(raw);
      if (s) return s;
    } catch { /* abaikan */ }
  }
  return `Gagal (${status})`;
}

/**
 * Batas tunggu klien untuk satu pertanyaan (59 dtk). Harus LEBIH BESAR dari
 * anggaran server terburuk (~52 dtk LLM + maks. 1,5 dtk tulis log + overhead
 * jaringan/cold start) supaya jawaban yang berhasil di percobaan kedua
 * server tidak dibatalkan klien, tapi tetap TERBATAS supaya fungsi yang
 * menggantung tidak memutar status "memikirkan jawaban" selamanya.
 * Sebelumnya: tanpa batas (fetch menunggu tanpa abort) — kegagalan ~60 dtk
 * yang terlihat sejauh ini adalah respons galat server, bukan abort klien.
 */
const ASK_TIMEOUT_MS = 59000;
const ASK_TIMEOUT_MESSAGE = 'AI sedang tidak bisa menjawab — coba lagi sebentar lagi.';

/** Kirim pertanyaan + konteks halaman aktif + riwayat (maks 6 pesan). */
export async function askAssistant(question: string, history: ChatMsg[]): Promise<AskResult> {
  const pathname = window.location.pathname;
  const page = routeToPage(pathname);
  const context = page ? getAssistantContext(page) : null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ASK_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: page ?? pathname,
        question,
        context,
        history: history
          .filter((m) => !m.error)
          .slice(-6)
          .map((m) => ({ role: m.role, content: m.content })),
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    // Abort klien (melewati 59 dtk) -> pesan galat yang sama dengan galat
    // server, bukan "AbortError" mentah. Galat jaringan lain diteruskan.
    if (e && (e as any).name === 'AbortError') throw new Error(ASK_TIMEOUT_MESSAGE);
    throw e;
  }
  clearTimeout(timer);
  let data: any = null;
  try { data = await res.json(); } catch { /* abaikan */ }
  if (!res.ok) {
    throw new Error(errorMessage(data, res.status));
  }
  if (data && typeof data.answer !== 'string') {
    // Jangan pernah menampilkan "[object Object]": jawaban non-string adalah
    // respons tak valid — tampilkan sebagai galat yang terbaca, bukan objek.
    throw new Error('Respons AI tidak valid');
  }
  return {
    answer: data.answer || '',
    sources: Array.isArray(data.sources) ? data.sources : [],
    provider: String(data.provider || ''),
    providerLabel: typeof data.providerLabel === 'string' ? data.providerLabel : undefined,
    fromFaq: data.fromFaq === true,
  };
}

/**
 * Vote up/down untuk satu jawaban — Inkubasi 2. Dikirim lewat POST
 * /api/assistant yang sama (action:'vote', BUKAN endpoint baru); vote
 * dicatat server-side sebagai baris log (kolom vote). Mengembalikan false
 * bila gagal (UI sudah optimistis — kegagalan vote tidak mengganggu chat).
 * Vote TIDAK makan kuota tanya (server membatasinya terpisah: 10/menit/IP).
 */
export interface VoteMeta {
  question: string;
  vote: 'up' | 'down';
  page?: string;
  answered?: boolean;
  fromFaq?: boolean;
  provider?: string;
  answer?: string;
}

export async function sendVote(meta: VoteMeta): Promise<boolean> {
  try {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'vote', ...meta }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * "Pertanyaan populer" bersama — Inkubasi 2. Dibaca dari GET /api/assistant
 * (pola tab FAQ Sheet yang sudah ditinjau admin, bila Sheet terkonfigurasi).
 * [] bila tidak ada -> widget memakai fallback Inkubasi 1 (pola FAQ statis
 * + frekuensi perangkat lokal).
 */
export async function fetchServerPopular(): Promise<string[]> {
  try {
    const res = await fetch('/api/assistant', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.popular)
      ? (data.popular as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 3)
      : [];
  } catch {
    return [];
  }
}

/**
 * Indeks kemampuan per halaman — Inkubasi 1, §5.1. Kontrak, bukan brosur:
 * status Live berarti context builder halaman itu ada; Galeri "Terbatas"
 * karena hanya berisi foto (tanpa angka kinerja).
 */
export interface PageCapability {
  page: AssistantContext['page'];
  label: string;
  route: string;
  bisa: string;
  contoh: string[];
  status: 'Live' | 'Terbatas';
}

export const PAGE_CAPABILITIES: PageCapability[] = [
  { page: 'beranda', label: 'Beranda', route: '/', bisa: 'NKO bulan berjalan, KPI utama, gangguan OPEN', contoh: ['NKO bulan ini berapa?', 'Berapa gangguan yang masih OPEN?'], status: 'Live' },
  { page: 'dashboard', label: 'Dashboard', route: '/dashboard', bisa: 'NKO + status KPI (BAIK/MASALAH), gangguan bulan ini', contoh: ['KPI apa saja yang MASALAH?', 'Berapa gangguan OPEN saat ini?'], status: 'Live' },
  { page: 'kinerja', label: 'Kinerja NKO', route: '/kinerja', bisa: 'NKO per KPI: nilai, target, %, status, tren', contoh: ['Indikator apa saja yang berstatus MASALAH?', 'Bagaimana tren NKO tahun ini?'], status: 'Live' },
  { page: 'tegakan', label: 'Tegakan (NS)', route: '/tegakan', bisa: 'Total tegakan per status, 5 penghantar teratas', contoh: ['Berapa total tegakan KRITIS?', 'Penghantar mana yang paling banyak tegakan KRITIS?'], status: 'Live' },
  { page: 'penebangan', label: 'Penebangan', route: '/penebangan', bisa: 'Rekap per ULTG/tahun, tebang/pangkas', contoh: ['Berapa total penebangan tahun ini?', 'Berapa pohon KRITIS yang belum ditebang?'], status: 'Live' },
  { page: 'kerawanan', label: 'Kerawanan', route: '/kerawanan', bisa: 'Titik rawan per jenis/ULTG, Kritis Mayor', contoh: ['Berapa tower rawan petir?', 'Berapa tower berstatus Kritis Mayor?'], status: 'Live' },
  { page: 'gangguan', label: 'Gangguan', route: '/gangguan', bisa: 'Rekap gangguan per bulan/penghantar/penyebab, OPEN/overdue', contoh: ['Berapa gangguan OPEN saat ini?', 'Penyebab gangguan terbanyak apa?'], status: 'Live' },
  { page: 'pentanahan', label: 'Pentanahan (NS)', route: '/pentanahan', bisa: 'BAIK/BURUK (SKDIR) per tahun/ULTG/penghantar, % realisasi, belum diukur', contoh: ['Berapa tower pentanahan yang BURUK tahun ini?', 'Berapa % realisasi pentanahan tahun ini?'], status: 'Live' },
  { page: 'ultg', label: 'ULTG', route: '/ultg', bisa: 'Rekap gangguan per ULTG, event terbaru', contoh: ['Berapa total gangguan bulan ini?', 'Penghantar mana yang paling sering gangguan bulan ini?'], status: 'Live' },
  { page: 'galeri', label: 'Galeri', route: '/galeri', bisa: 'Hanya foto (judul + bidang)', contoh: ['Ada berapa foto bulan ini?', 'Bidang apa yang paling banyak fotonya?'], status: 'Terbatas' },
];

/**
 * Saran dinamis dari konteks halaman yang benar-benar dimuat — Inkubasi 1,
 * §5.2 + Lampiran C. Template deterministik (tanpa LLM, tidak mengarang):
 * aturan per halaman dari field ringkasan, lalu dilengkapi dari daftar
 * statis bila kurang dari 3. Tanpa konteks -> daftar statis.
 */
export function dynamicSuggestions(ctx: AssistantContext | null, page: AssistantContext['page']): string[] {
  const out: string[] = [];
  const push = (s: string) => { if (s && !out.includes(s)) out.push(s); };
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const has = (v: unknown): boolean => { const n = num(v); return n !== null && n > 0; };
  const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
  const r = ctx?.ringkasan ?? {};
  const f = ctx?.filter ?? {};
  if (ctx) {
    switch (page) {
      case 'dashboard':
      case 'beranda': {
        const st = (r.statusKpi ?? {}) as Record<string, unknown>;
        if (num(r.nko110) != null) push('NKO bulan ini berapa?');
        if (has(st.MASALAH)) push('KPI apa saja yang MASALAH bulan ini?');
        if (has(r.gangguanOpenUpt)) push('Berapa gangguan yang masih OPEN?');
        break;
      }
      case 'kinerja': {
        const st = (r.statusKpi ?? {}) as Record<string, unknown>;
        if (has(st.MASALAH)) push('Indikator apa saja yang berstatus MASALAH?');
        if (num(r.nko110) != null) push('NKO bulan ini berapa?');
        if (arr(r.trenNko110).length > 1) push('Bagaimana tren NKO tahun ini?');
        break;
      }
      case 'tegakan': {
        const top = arr(r.teratasKritis);
        if (top.length > 0) push('Penghantar mana yang paling banyak tegakan KRITIS?');
        if (top.length > 0 && typeof top[0]?.penghantar === 'string') push(`Berapa tegakan KRITIS di ${top[0].penghantar}?`);
        const ps = (r.perStatus ?? {}) as Record<string, unknown>;
        if (has(ps.KRITIS)) push('Berapa total tegakan KRITIS?');
        break;
      }
      case 'penebangan': {
        if (num(r.total) != null) push('Berapa total penebangan tahun ini?');
        if (has(r.kritis)) push('Berapa pohon KRITIS yang belum ditebang?');
        if (arr(r.teratasSection).length > 0) push('Section mana yang paling banyak penebangan?');
        break;
      }
      case 'kerawanan': {
        if (has(r.gangguanPetir)) push('Berapa tower rawan petir?');
        if (has(r.kritisMayor)) push('Berapa tower berstatus Kritis Mayor?');
        if (arr(r.perPhtTeratas).length > 0) push('Penghantar mana yang paling banyak tower rawan?');
        break;
      }
      case 'gangguan': {
        if (has(r.openUpt)) push('Berapa gangguan OPEN saat ini?');
        if (arr(r.perPenyebab).length > 0) push('Penyebab gangguan terbanyak apa?');
        if (arr(r.perTahun).length > 1) push('Tahun berapa gangguan terbanyak?');
        break;
      }
      case 'pentanahan': {
        const thn = ctx.tahun ? ` ${ctx.tahun}` : '';
        if (typeof f.ultg === 'string' && f.ultg) push(`Berapa % realisasi${thn} di ULTG ${f.ultg}?`);
        if (has(r.belumDiukur)) push('Berapa tower yang belum diukur tahun ini?');
        if (arr(r.terburuk).length > 0) push('Tower mana yang nilai pentanahannya paling tinggi?');
        if (has(r.buruk)) push('Berapa tower pentanahan yang BURUK tahun ini?');
        break;
      }
      case 'ultg': {
        if (num(r.totalGangguan) != null) push('Berapa total gangguan bulan ini?');
        if (num(r.trip) != null || num(r.reclose) != null) push('Berapa gangguan Trip dan Reclose bulan ini?');
        if (arr(r.penghantarTersering).length > 0) push('Penghantar mana yang paling sering gangguan bulan ini?');
        break;
      }
      case 'galeri': {
        if (num(r.totalFoto) != null) push('Ada berapa foto bulan ini?');
        if (arr(r.perBidang).length > 0) push('Bidang apa yang paling banyak fotonya?');
        break;
      }
    }
  }
  for (const s of SUGGESTED_QUESTIONS[page]) { if (out.length >= 3) break; push(s); }
  return out.slice(0, 3);
}
