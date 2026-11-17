// AI Assistant demo — client + registry konteks (browser).
// Konteks dibangun oleh halaman dari data yang SUDAH dimuat & dirender
// (angka konteks = angka yang tampil di halaman, termasuk filter aktif),
// lalu didaftarkan ke registry ini. Widget membaca registry saat kirim.

export interface AssistantContext {
  page: 'dashboard' | 'pentanahan';
  tahun?: number;
  filter?: Record<string, string>;
  ringkasan: Record<string, unknown>;
  sumber: string[];
  diakses: string; // YYYY-MM-DD
}

const registry = new Map<string, AssistantContext>();

export function setAssistantContext(page: string, ctx: AssistantContext | null) {
  if (ctx) registry.set(page, ctx);
  else registry.delete(page);
}

export function getAssistantContext(page: string): AssistantContext | null {
  return registry.get(page) ?? null;
}

export function todayId(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Route -> halaman yang didukung demo v1 (Dashboard + Pentanahan saja). */
export function routeToPage(pathname: string): 'dashboard' | 'pentanahan' | null {
  if (pathname === '/dashboard') return 'dashboard';
  if (pathname === '/pentanahan') return 'pentanahan';
  return null;
}

export const SUGGESTED_QUESTIONS: Record<string, string[]> = {
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
};

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  provider?: string;
  providerLabel?: string;
  error?: boolean;
}

export interface AskResult {
  answer: string;
  sources: string[];
  provider: string;
  providerLabel?: string;
}

/** Kirim pertanyaan + konteks halaman aktif + riwayat (maks 6 pesan). */
export async function askAssistant(question: string, history: ChatMsg[]): Promise<AskResult> {
  const pathname = window.location.pathname;
  const page = routeToPage(pathname);
  const context = page ? getAssistantContext(page) : null;
  const res = await fetch('/api/assistant', {
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
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* abaikan */ }
  if (!res.ok) {
    throw new Error((data && (data.error || data.detail)) || `Gagal (${res.status})`);
  }
  return {
    answer: String(data.answer || ''),
    sources: Array.isArray(data.sources) ? data.sources : [],
    provider: String(data.provider || ''),
    providerLabel: typeof data.providerLabel === 'string' ? data.providerLabel : undefined,
  };
}
