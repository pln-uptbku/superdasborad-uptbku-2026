// Log bersama AI Assistant — Inkubasi 2 (rencana-inkubasi-ai-agent.md §2–§3 Opsi B).
// Menulis 1 baris ke Google Sheet privat "LOG Asisten UPT" (tab LOG) lewat
// service account, dan membaca pola populer dari tab FAQ (kurasi admin).
// Tanpa dependensi baru: JWT RS256 ditandatangani dengan node:crypto, token
// ditukar di oauth2.googleapis.com, tulis/baca lewat Sheets API v4.
//
// Kunci TIDAK PERNAH ada di kode/repo/bundle: service account dibaca dari
// env var GOOGLE_SERVICE_ACCOUNT_JSON (Sensitive) + LOG_SHEET_ID. Bila salah
// satu tidak ada -> modul mengembalikan null / [] dan jawaban berjalan
// normal tanpa log (pola yang sama seperti kunci cadangan LLM yang kosong).
// Gagal tulis/baca log TIDAK PERNAH menggagalkan jawaban — pemanggil
// (api/assistant.js) memakai batas waktu dan menelan galatnya.
//
// Modul murni (tanpa dependensi Vercel) supaya bisa diuji dengan `node`.

import crypto from 'node:crypto';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const FETCH_TIMEOUT_MS = 8000; // per panggilan Google (token / tulis / baca)
const POPULAR_CACHE_MS = 10 * 60 * 1000; // pola populer di-cache 10 menit
const POPULAR_LIMIT = 3;

// Pola yang sama dengan memori perangkat (src/lib/assistant-memory.ts):
// email + nomor HP Indonesia yang jelas.
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(\+?62|0)8\d{7,11}/;

/** true bila pertanyaan mengandung email / nomor HP yang jelas. */
export function containsPii(q) {
  return EMAIL_RE.test(q) || PHONE_RE.test(q);
}

/**
 * Sanitasi pertanyaan untuk log (§2.2): mengandung data pribadi -> teks
 * pertanyaan TIDAK ditulis; yang tercatat hanya penanda "dibersihkan".
 */
export function sanitizeQuestion(q) {
  const text = String(q || '');
  if (containsPii(text)) return { text: '[dibersihkan — mengandung data pribadi]', pii: true };
  return { text, pii: false };
}

/** Konfigurasi log dari env var; null bila belum disiapkan (bukan error). */
export function loadSheetConfig() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const sheetId = process.env.LOG_SHEET_ID;
  if (!raw || !sheetId) return null;
  try {
    const sa = JSON.parse(raw);
    if (!sa || typeof sa.client_email !== 'string' || typeof sa.private_key !== 'string') return null;
    return { serviceAccount: sa, sheetId: String(sheetId).trim() };
  } catch {
    return null;
  }
}

let tokenCache = null; // { token, expMs }
let popularCache = null; // { at, items, ttlMs } — sukses 10 menit, gagal 60 dtk

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Token akses Google (JWT service account), di-cache sampai hampir kedaluwarsa. */
async function getAccessToken(sa) {
  const now = Date.now();
  if (tokenCache && tokenCache.expMs > now + 60_000) return tokenCache.token;
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = {
    iss: sa.client_email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    exp: Math.floor(now / 1000) + 3600,
    iat: Math.floor(now / 1000),
  };
  const payload = base64url(JSON.stringify(claims));
  const data = `${header}.${payload}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(data), sa.private_key);
  const jwt = `${data}.${base64url(sig)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`token HTTP ${r.status}`);
    const j = await r.json();
    if (!j || typeof j.access_token !== 'string') throw new Error('token tanpa access_token');
    tokenCache = { token: j.access_token, expMs: now + (j.expires_in ? j.expires_in * 1000 : 3600_000) };
    return tokenCache.token;
  } finally {
    clearTimeout(timer);
  }
}

async function sheetsFetch(config, url, options = {}) {
  const token = await getAccessToken(config.serviceAccount);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`Sheets HTTP ${r.status}: ${text.slice(0, 200)}`);
    }
    return r.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Satu baris log — kolom persis Lampiran A (tab LOG):
 * waktu | halaman | filter | pertanyaan | terjawab | jawaban_ringkas |
 * sumber | provider | dari_faq | latensi_dtk | vote | status_review.
 * Waktu dalam WIB ("2026-11-18 21:30:00"), terjawab/dari_faq "ya"/"tidak",
 * jawaban_ringkas maks. 300 karakter, status_review selalu "Baru".
 */
export function buildLogRow(entry) {
  const q = sanitizeQuestion(entry.pertanyaan);
  const filter = String(entry.filter || '');
  return [
    String(entry.waktu || ''),
    String(entry.halaman || '').slice(0, 40),
    filter.slice(0, 200),
    q.text.slice(0, 500),
    entry.terjawab ? 'ya' : 'tidak',
    String(entry.jawabanRingkas || '').slice(0, 300),
    Array.isArray(entry.sumber) ? entry.sumber.join(' · ').slice(0, 300) : String(entry.sumber || '').slice(0, 300),
    String(entry.provider || '').slice(0, 40),
    entry.dariFaq ? 'ya' : 'tidak',
    entry.latensiDtk === undefined || entry.latensiDtk === null || entry.latensiDtk === '' ? '' : String(entry.latensiDtk),
    entry.vote === 'up' || entry.vote === 'down' ? entry.vote : '',
    'Baru',
  ];
}

/** Tambah 1 baris ke tab LOG (append-only). Throw bila gagal — pemanggil yang menelan. */
export async function appendLogRow(config, entry) {
  const url = `${SHEETS_API}/${encodeURIComponent(config.sheetId)}/values/${encodeURIComponent('LOG!A:L')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  await sheetsFetch(config, url, {
    method: 'POST',
    body: JSON.stringify({ range: 'LOG!A:L', majorDimension: 'ROWS', values: [buildLogRow(entry)] }),
  });
}

/**
 * Tulis log dengan batas waktu — TIDAK PERNAH throw. Mengembalikan true bila
 * baris tercatat, false bila dilewati (tidak terkonfigurasi / timeout / galat).
 * Dipanggil dengan await SEBELUM jawaban dikirim (batas 1,5 dtk): di fungsi
 * serverless Node biasa tidak ada primitif background yang dijamin jalan
 * setelah respons terkirim, jadi tulis yang tidak ditunggu berisiko hilang —
 * batas waktu yang pendek lebih jujur daripada fire-and-forget yang diam-diam
 * gugur. Bila Sheet belum disiapkan, biayanya nol (langsung false).
 */
export async function logAnswer(config, entry, timeoutMs = 1500) {
  if (!config) return false;
  try {
    const done = appendLogRow(config, entry).then(
      () => true,
      (e) => {
        console.error(`[assistant-log] gagal: ${String(e && e.message ? e.message : e).slice(0, 200)}`);
        return false;
      },
    );
    return await Promise.race([done, sleep(timeoutMs).then(() => false)]);
  } catch (e) {
    console.error(`[assistant-log] gagal: ${String(e && e.message ? e.message : e).slice(0, 200)}`);
    return false;
  }
}

/**
 * "Pertanyaan populer" bersama: pola pertama tiap baris tab FAQ (kolom A
 * `pertanyaan_pola`, pola dipisah ';'), maks. 3, di-cache 10 menit.
 * Tab FAQ adalah ruang kurasi admin — pola di sini SUDAH ditinjau, jadi
 * aman ditampilkan ke semua pengunjung (bukan log mentah). Gagal baca /
 * belum terkonfigurasi -> [] (widget memakai fallback Inkubasi 1).
 */
export async function readPopular(config) {
  if (!config) return [];
  const now = Date.now();
  if (popularCache && now - popularCache.at < popularCache.ttlMs) return popularCache.items;
  try {
    const url = `${SHEETS_API}/${encodeURIComponent(config.sheetId)}/values/${encodeURIComponent('FAQ!A2:A')}?majorDimension=COLUMNS`;
    const j = await sheetsFetch(config, url, { method: 'GET' });
    const col = (j && Array.isArray(j.values) && Array.isArray(j.values[0])) ? j.values[0] : [];
    const items = [];
    for (const cell of col) {
      const first = String(cell || '').split(';')[0].trim();
      if (first && !items.includes(first)) items.push(first);
      if (items.length >= POPULAR_LIMIT) break;
    }
    popularCache = { at: now, items, ttlMs: POPULAR_CACHE_MS };
    return items;
  } catch (e) {
    console.error(`[assistant-log] baca populer gagal: ${String(e && e.message ? e.message : e).slice(0, 200)}`);
    // Cache negatif singkat: jangan bebani setiap GET dengan percobaan yang
    // sudah terbukti gagal (Sheet belum ada / kunci salah).
    popularCache = { at: now, items: [], ttlMs: 60_000 };
    return [];
  }
}
