// Memori perangkat AI Assistant — Inkubasi 1 (rencana-inkubasi-ai-agent.md §3 Opsi A).
// Riwayat Q&A + pertanyaan tak terjawab disimpan di localStorage perangkat
// pengunjung saja — TIDAK PERNAH dikirim ke server, tanpa ID pelacak.
// Keputusan yang dipakai: retensi 90 hari; log bersama maks 10.000 baris
// (Inkubasi 2, Sheet); perangkat dibatasi 1.000 entri agar muat localStorage.
// Pertanyaan yang mengandung data pribadi (email/HP) tidak disimpan teksnya:
// hanya penanda "dibersihkan" yang tercatat (§2.2).

export interface MemoryEntry {
  q: string; // teks pertanyaan ('' + pii:true bila dibersihkan)
  a: string; // jawaban (ringkas, maks 500 karakter)
  page: string;
  answered: boolean; // false = dijawab "Tidak ada di data dashboard"
  sources: string[];
  providerLabel?: string;
  fromFaq?: boolean;
  pii?: boolean;
  ts: number; // epoch ms
}

const KEY = 'upt-assistant-memory-v1';
const MAX_ENTRIES = 1000; // batas perangkat (lihat catatan di atas)
const RETENTION_MS = 90 * 24 * 3600 * 1000; // 90 hari
export const DISPLAY_HISTORY = 20;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(\+?62|0)8\d{7,11}/;

/** true bila pertanyaan mengandung email / nomor HP yang jelas. */
export function containsPii(q: string): boolean {
  return EMAIL_RE.test(q) || PHONE_RE.test(q);
}

function prune(entries: MemoryEntry[]): MemoryEntry[] {
  const cut = Date.now() - RETENTION_MS;
  return entries.filter((e) => e && typeof e.ts === 'number' && e.ts >= cut).slice(0, MAX_ENTRIES);
}

export function loadMemory(): MemoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return prune(parsed as MemoryEntry[]);
  } catch {
    return [];
  }
}

function saveMemory(entries: MemoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prune(entries)));
  } catch {
    // Kuota penuh: buang separuh entri terlama, coba sekali lagi.
    try {
      localStorage.setItem(KEY, JSON.stringify(prune(entries).slice(0, Math.floor(MAX_ENTRIES / 2))));
    } catch {
      // localStorage tidak tersedia (mode privat) — riwayat sekadar tidak tersimpan.
    }
  }
}

/** Catat satu pasangan Q&A (jawaban error TIDAK dicatat — bukan celah data). */
export function recordQA(entry: Omit<MemoryEntry, 'ts' | 'pii'> & { ts?: number }): MemoryEntry[] {
  const pii = containsPii(entry.q);
  const full: MemoryEntry = {
    ...entry,
    q: pii ? '[pertanyaan dibersihkan — mengandung data pribadi]' : entry.q,
    a: entry.a.slice(0, 500),
    pii: pii || undefined,
    ts: entry.ts ?? Date.now(),
  };
  const next = [full, ...loadMemory()];
  saveMemory(next);
  return prune(next);
}

export function clearMemory(): void {
  try { localStorage.removeItem(KEY); } catch { /* abaikan */ }
}

/** Pertanyaan tak terjawab (emas inkubasi: celah data dashboard). */
export function unansweredEntries(entries: MemoryEntry[]): MemoryEntry[] {
  return entries.filter((e) => !e.answered && !e.pii);
}

/** Normalisasi ringan untuk agregat (huruf kecil, buang tanda baca). */
export function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * "Pertanyaan populer" perangkat ini: pertanyaan yang paling sering muncul
 * di riwayat perangkat (agregat anonim — tanpa identitas). FAQ kurasi
 * didahulukan (lintas pengunjung, karena dikurasi admin dari review).
 */
export function popularQuestions(entries: MemoryEntry[], faqPola: string[], limit = 3): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const t = (s || '').trim();
    if (t && !out.some((x) => normalizeQuestion(x) === normalizeQuestion(t))) out.push(t);
  };
  for (const p of faqPola) { if (out.length >= limit) break; push(p); }
  if (out.length < limit) {
    const counts = new Map<string, { q: string; n: number }>();
    for (const e of entries) {
      if (e.pii || !e.q) continue;
      const k = normalizeQuestion(e.q);
      if (k.length < 4) continue;
      const cur = counts.get(k) ?? { q: e.q, n: 0 };
      cur.n += 1;
      counts.set(k, cur);
    }
    for (const { q } of [...counts.values()].sort((a, b) => b.n - a.n)) {
      if (out.length >= limit) break;
      push(q);
    }
  }
  return out.slice(0, limit);
}
