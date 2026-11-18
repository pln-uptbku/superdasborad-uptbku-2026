// FAQ terverifikasi AI Assistant — Inkubasi 1 (rencana-inkubasi-ai-agent.md §4).
// File dikurasi admin lewat commit (public/faq-assistant.json); jawaban FAQ
// dipakai langsung tanpa LLM, dengan penanda "dari FAQ terverifikasi".
// Pencocokan: normalisasi + sinonim + skor kata kunci (tanpa embedding —
// kosakata pertanyaan dashboard sempit). Entri kedaluwarsa (berlaku_data)
// tidak dipakai supaya jawaban bulanan yang sudah lewat tidak diulang.
//
// Modul murni (tanpa dependensi Vercel) supaya bisa diuji dengan `node`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SYNONYMS = {
  brp: 'berapa', brapa: 'berapa', menara: 'tower', gmn: 'bagaimana',
  gmna: 'bagaimana', nggak: 'tidak', ga: 'tidak',
};
const STOPWORDS = new Set([
  'yang', 'di', 'ke', 'dan', 'apa', 'saja', 'adalah', 'itu', 'berapa',
  'kah', 'dong', 'sih', 'nya', 'utk', 'untuk', 'dari', 'dengan', 'tolong',
]);

/** Huruf kecil, buang tanda baca, samakan sinonim, buang kata pengisi. */
export function normalizeQuestion(text) {
  const s = String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SYNONYMS[w] || w)
    .filter((w) => !STOPWORDS.has(w));
}

/** Fraksi kata pola yang muncul di pertanyaan (0–1). */
export function faqScore(pola, question) {
  const p = normalizeQuestion(pola);
  if (p.length < 2) return 0;
  const q = new Set(normalizeQuestion(question));
  return p.filter((w) => q.has(w)).length / p.length;
}

function stillValid(entry, now = new Date()) {
  const b = entry && typeof entry.berlaku_data === 'string' ? entry.berlaku_data : '';
  if (/^\d{4}-\d{2}$/.test(b)) {
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return b === ym;
  }
  if (/^\d{4}$/.test(b)) return b === String(now.getFullYear());
  return true; // tanpa berlaku_data: dianggap berlaku terus
}

/** Entri FAQ terbaik untuk pertanyaan, atau null (ambang skor 0,8). */
export function findFaq(question, faq, now = new Date()) {
  if (!faq || !Array.isArray(faq.entri)) return null;
  let best = null;
  let bestScore = 0;
  for (const e of faq.entri) {
    if (!e || !Array.isArray(e.pola) || typeof e.jawaban !== 'string') continue;
    if (!stillValid(e, now)) continue;
    for (const pola of e.pola) {
      const s = faqScore(pola, question);
      if (s > bestScore) { bestScore = s; best = e; }
    }
  }
  return bestScore >= 0.8 ? best : null;
}

let cache = null; // { path, mtimeMs, faq }

/** Baca public/faq-assistant.json (cache per proses; muat ulang bila berubah). */
export function loadFaq() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), 'public', 'faq-assistant.json'),
    path.resolve(here, '..', 'public', 'faq-assistant.json'),
    path.resolve(here, 'faq-assistant.json'),
  ];
  for (const p of candidates) {
    try {
      const st = fs.statSync(p);
      if (cache && cache.path === p && cache.mtimeMs === st.mtimeMs) return cache.faq;
      const faq = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (!faq || !Array.isArray(faq.entri)) return null;
      cache = { path: p, mtimeMs: st.mtimeMs, faq };
      return faq;
    } catch {
      // coba kandidat berikut
    }
  }
  return null;
}
