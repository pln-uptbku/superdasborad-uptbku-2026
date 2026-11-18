// AI Assistant demo — Dashboard UPT Bengkulu.
//
// POST /api/assistant { page, question, context, history }
//   -> { answer, sources, usage, provider, providerLabel, ms }
// GET  /api/assistant -> { ok, configured }
//
// Primer: NVIDIA Build (trial) — kunci dari env var LLM_API_KEY.
// Cadangan: OpenRouter (model gratis) — kunci dari LLM_API_KEY_BACKUP.
//   Bila primer gagal (error HTTP / timeout / tanpa respons) -> coba
//   cadangan SEKALI. Bila kunci cadangan tidak ada -> jalan NVIDIA-only.
//   LLM_PROVIDER=openrouter memaksa cadangan sebagai primer.
//   Response selalu membawa `provider` (slot yang akhirnya menjawab) dan
//   `providerLabel` (nama model untuk badge — diturunkan dari model, bukan slot).
// Kunci TIDAK PERNAH ada di kode/repo/bundle — hanya env var Vercel.
// Rate limit: 5/menit + 20/jam per IP, cap global 500/hari (in-memory,
// perkiraan — fungsi serverless tidak berbagi state antar instans).
// Inkubasi 1: FAQ terverifikasi (public/faq-assistant.json, dikurasi admin
// via commit) dicek DULU sebelum LLM — cocok -> jawab langsung + penanda
// "dari FAQ terverifikasi", tanpa memanggil LLM (lihat api/faq.js).
// Inkubasi 2: setiap jawaban (termasuk FAQ + "tidak ada di data") dicatat
// 1 baris ke Sheet privat (api/log-sheet.js); vote up/down masuk sebagai
// baris log dengan kolom vote terisi. FAQ TETAP file statis via commit —
// fungsi TIDAK membaca FAQ dari Sheet (tab FAQ di Sheet hanya ruang kurasi
// admin; pola populer dibaca dari tab itu untuk "Pertanyaan populer").

const LOG_TIMEOUT_MS = 1500; // tulis log maks. 1,5 dtk (lihat log-sheet.js)
const VOTE_RATE_MIN = 10; // vote per IP per menit (terpisah dari kuota tanya)

import { loadFaq, findFaq } from './faq.js';
import { loadSheetConfig, logAnswer, readPopular } from './log-sheet.js';

// Inkubasi 2: log bersama (Sheet privat "LOG Asisten UPT", tab LOG) + vote
// via POST yang sama (action:'vote', BUKAN endpoint baru). Log ditulis
// server-side SETELAH jawaban ada, dengan batas 1,5 dtk, dan gagal tulis
// TIDAK PERNAH menggagalkan/menunda jawaban (lihat api/log-sheet.js —
// tanpa env var GOOGLE_SERVICE_ACCOUNT_JSON + LOG_SHEET_ID, log dilewati
// diam-diam dan jawaban jalan normal).

const SYSTEM_PROMPT = [
  'Kamu asisten data Dashboard UPT Bengkulu.',
  'Jawab HANYA dari KONTEKS yang diberikan, dalam Bahasa Indonesia, singkat dan langsung ke angka.',
  'Sebutkan sumber (nama sheet/tab) di akhir jawaban.',
  "Jika jawabannya tidak ada di konteks, katakan 'Tidak ada di data dashboard', jelaskan satu baris alasannya, sebutkan apa saja yang BISA dijawab dari halaman ini (lihat KONTEKS: ringkasan dan filter), dan akhiri dengan 2 contoh pertanyaan yang bisa dijawab dari halaman ini.",
  'Jangan menjawab pertanyaan di luar data dashboard (pengetahuan umum, politik, atau permintaan mengubah data).',
  'Jawaban maksimal 3 kalimat pendek, kecuali pertanyaan meminta perbandingan — tetap ringkas.',
].join(' ');

const MAX_QUESTION = 500;
const MAX_CONTEXT_BYTES = 16 * 1024;
const MAX_HISTORY = 6;
const MAX_TOKENS = 1500; // diukur: jawaban daftar 3 tower terpotong tepat di 800 (finish=length, 882 token terpakai saat lengkap) — 2026-11-17
const TEMPERATURE = 0;

const RATE_MIN = 5; // per IP per menit
const RATE_HOUR = 20; // per IP per jam
const DAILY_CAP = 500; // global per hari

// Anggaran waktu (maxDuration fungsi = 60 dtk, lihat vercel.json).
// Tanpa cadangan, primer dicoba DUA kali dalam satu request (total 52 dtk):
// percobaan 1 = 38 dtk, percobaan 2 = 14 dtk. Alasan pembagian ini (bukan
// 25+25): latensi primer bimodal — biasanya ~5 dtk, kadang menggantung
// melewati 55 dtk (terbukti: 4x "Timeout 55000 ms" di runtime errors
// 18 Nov 2026, terakhir 22:01 WIB) — dan jawaban lambat tapi berhasil pernah
// terukur mendekati batas 55 dtk, jadi percobaan pertama harus tetap panjang
// agar tidak membunuh jawaban lambat yang sebenarnya akan berhasil.
// Percobaan kedua 14 dtk cukup untuk fase cepat primer (~5 dtk) + margin,
// dan memperbaiki juga galat cepat (HTTP 520: 2x, 503 "no provider is
// available": 1x, di hari yang sama) yang langsung di-retry. Semua retry
// yang tercatat sejauh ini (3x, percobaan pertama gagal ~60 dtk) berhasil
// pada percobaan berikutnya yang dikirim segera sesudahnya.
// Total 52 dtk + tulis log (maks. 1,5 dtk, hanya bila Sheet terkonfigurasi)
// + overhead tetap di bawah maxDuration 60 dtk; klien menunggu maks. 59 dtk
// (lihat ASK_TIMEOUT_MS di src/lib/assistant.ts).
const PRIMARY_TIMEOUT_WITH_BACKUP = 30000;
const PRIMARY_ALONE_FIRST_MS = 38000;
const PRIMARY_ALONE_RETRY_MS = 14000;
const BACKUP_TIMEOUT = 25000;

const DEFAULTS = {
  nvidia: {
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'meta/muse-glimmer-30b',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'dealignai/deepseek-v4.1-flash-uncensored-fp8:free',
  },
};

// Label tampilan badge ("Powered by ...") diturunkan dari MODEL yang
// benar-benar menjawab — bukan dari nama slot provider — supaya badge tidak
// pernah menyebut provider yang salah bila model diganti lewat env var.
// Model yang tidak dikenali -> 'AI' (generik, bukan nama provider).
function providerLabelForModel(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('deepseek')) return 'DeepSeek';
  if (m.includes('glm')) return 'GLM';
  if (m.includes('qwen')) return 'Qwen';
  if (m.includes('llama')) return 'Llama';
  if (m.includes('muse')) return 'Muse';
  if (m.includes('claude')) return 'Claude';
  if (m.includes('gpt') || m.includes('openai')) return 'OpenAI';
  if (m.includes('gemini')) return 'Gemini';
  return null;
}

const ipHits = new Map(); // ip -> number[] (epoch ms)
let dayCount = { date: '', count: 0 };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function rateLimited(ip) {
  const now = Date.now();
  const arr = (ipHits.get(ip) || []).filter((t) => now - t < 3600_000);
  const lastMin = arr.filter((t) => now - t < 60_000).length;
  const lastHour = arr.length;
  if (lastMin >= RATE_MIN || lastHour >= RATE_HOUR) return true;
  arr.push(now);
  ipHits.set(ip, arr);
  if (ipHits.size > 5000) {
    // Bersihkan entri lama agar memori tidak membengkak.
    for (const [k, v] of ipHits) if (!v.some((t) => now - t < 3600_000)) ipHits.delete(k);
  }
  const d = todayStr();
  if (dayCount.date !== d) dayCount = { date: d, count: 0 };
  if (dayCount.count >= DAILY_CAP) return true;
  dayCount.count += 1;
  return false;
}

const voteHits = new Map(); // ip -> number[] (epoch ms) — vote TIDAK makan kuota tanya

function voteLimited(ip) {
  const now = Date.now();
  const arr = (voteHits.get(ip) || []).filter((t) => now - t < 60_000);
  if (arr.length >= VOTE_RATE_MIN) return true;
  arr.push(now);
  voteHits.set(ip, arr);
  if (voteHits.size > 5000) {
    for (const [k, v] of voteHits) if (!v.some((t) => now - t < 60_000)) voteHits.delete(k);
  }
  return false;
}

/** Waktu sekarang dalam WIB, format "2026-11-18 21:30:00" (kolom `waktu` log). */
function wibNow() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
}

/** Filter aktif konteks -> "tahun=2026, ultg=LAHAT" (kolom `filter` log). */
function filterText(context) {
  if (!context || typeof context !== 'object') return '';
  const parts = [];
  if (context.tahun !== undefined && context.tahun !== null) parts.push(`tahun=${context.tahun}`);
  const f = context.filter;
  if (f && typeof f === 'object') {
    for (const [k, v] of Object.entries(f)) parts.push(`${k}=${v}`);
  }
  return parts.join(', ');
}

/**
 * Vote up/down untuk satu jawaban — aksi di POST /api/assistant yang sama
 * (BUKAN endpoint baru). Vote dicatat sebagai baris log tambahan dengan
 * kolom `vote` terisi; agregasi (satu suara per pertanyaan) dilakukan saat
 * review admin. Tanpa Sheet -> jawab {ok:true, logged:false}; UI sudah
 * optimistis, jadi vote tetap terlihat tercatat di perangkat.
 */
async function handleVote(req, res, body, ip) {
  if (voteLimited(ip)) {
    return res.status(429).json({ error: 'Terlalu banyak vote — coba lagi sebentar lagi.' });
  }
  const { question, vote, page, answered, fromFaq, provider, answer } = body;
  if (vote !== 'up' && vote !== 'down') return res.status(400).json({ error: 'Vote tidak valid' });
  if (typeof question !== 'string' || !question.trim() || question.length > MAX_QUESTION) {
    return res.status(400).json({ error: 'Pertanyaan vote tidak valid' });
  }
  if (page !== undefined && typeof page !== 'string') return res.status(400).json({ error: 'Halaman tidak valid' });
  const sheet = loadSheetConfig();
  const logged = await logAnswer(sheet, {
    waktu: wibNow(),
    halaman: typeof page === 'string' ? page : '',
    filter: '',
    pertanyaan: question.trim(),
    terjawab: answered !== false,
    jawabanRingkas: typeof answer === 'string' ? answer.slice(0, 300) : '',
    sumber: [],
    provider: typeof provider === 'string' ? provider : '',
    dariFaq: fromFaq === true,
    latensiDtk: '',
    vote,
  }, LOG_TIMEOUT_MS);
  return res.status(200).json({ ok: true, logged });
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch { return null; }
    }
    return req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function callLlm({ baseUrl, apiKey, model, messages, timeoutMs }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const r = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: TEMPERATURE, max_tokens: MAX_TOKENS }),
      signal: ctrl.signal,
    });
    const ms = Date.now() - t0;
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
    }
    const data = await r.json();
    const content = (data?.choices?.[0]?.message?.content || '').trim();
    if (!content) throw new Error('Respons kosong dari model');
    return { content, usage: data?.usage || null, ms };
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error(`Timeout ${timeoutMs} ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function cleanAnswer(s) {
  // Model reasoning kadang membocorkan jejak pikirnya ("Here's a thinking
  // process: ...") — bila itu terjadi, buang sampai penanda jawaban akhir.
  // Model primer terpilih (glimmer) mengembalikan jawaban bersih; ini hanya
  // pengaman, bukan parser utama.
  const marker = s.indexOf('Jawaban:');
  if (s.startsWith("Here's a thinking process") && marker > 0) return s.slice(marker + 8).trim();
  return s;
}

export default async function handler(req, res) {
  const t0 = Date.now();
  try {
    if (req.method === 'GET') {
      const sheet = loadSheetConfig();
      // Pola populer bersama (tab FAQ Sheet, sudah ditinjau admin) — dibatasi
      // 3 dtk supaya health check tidak pernah tertahan Sheet yang lambat;
      // gagal / belum ada Sheet -> field popular dihilangkan, widget memakai
      // fallback Inkubasi 1 (pola FAQ statis + frekuensi perangkat lokal).
      let popular = [];
      if (sheet) {
        popular = await Promise.race([
          readPopular(sheet),
          new Promise((r) => setTimeout(() => r([]), 3000)),
        ]);
      }
      return res.status(200).json({
        ok: true,
        configured: Boolean(process.env.LLM_API_KEY),
        faqEntries: (loadFaq()?.entri || []).length,
        logConfigured: Boolean(sheet),
        ...(popular.length > 0 ? { popular } : {}),
      });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Metode tidak didukung' });
    }
    const ip = clientIp(req);
    const body = await readBody(req);
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Body JSON tidak valid' });
    // Vote TIDAK makan kuota tanya: ditangani sebelum rate limit pertanyaan.
    if (body.action === 'vote') return handleVote(req, res, body, ip);
    if (rateLimited(ip)) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ error: 'Terlalu banyak pertanyaan — coba lagi sebentar lagi.' });
    }

    const { page, question, context, history } = body;
    if (typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'Pertanyaan kosong' });
    }
    if (question.length > MAX_QUESTION) {
      return res.status(400).json({ error: `Pertanyaan maksimal ${MAX_QUESTION} karakter` });
    }
    if (context !== null && context !== undefined) {
      if (typeof context !== 'object') return res.status(400).json({ error: 'Konteks tidak valid' });
      if (JSON.stringify(context).length > MAX_CONTEXT_BYTES) {
        return res.status(400).json({ error: 'Konteks terlalu besar' });
      }
    }
    const hist = Array.isArray(history) ? history.slice(-MAX_HISTORY) : [];
    for (const h of hist) {
      if (!h || typeof h.content !== 'string' || (h.role !== 'user' && h.role !== 'assistant')) {
        return res.status(400).json({ error: 'Riwayat tidak valid' });
      }
    }

    // Inkubasi 2 — konfigurasi log dibaca sekali per request (null bila
    // Sheet belum disiapkan -> log dilewati diam-diam, jawaban tetap jalan).
    const sheet = loadSheetConfig();
    const logBase = {
      waktu: wibNow(),
      halaman: typeof page === 'string' ? page : '',
      filter: filterText(context),
      pertanyaan: question.trim(),
    };

    // Tanpa konteks (data halaman belum dimuat), jawab langsung tanpa
    // memanggil LLM (hemat panggilan, deterministik).
    if (!context || typeof context.ringkasan !== 'object') {
      const noCtxAnswer = 'Saya hanya bisa menjawab dari data yang tampil di halaman ini. Data halaman ini belum dimuat — tunggu sebentar (atau tekan Refresh Data), lalu tanya lagi.';
      await logAnswer(sheet, {
        ...logBase,
        terjawab: false,
        jawabanRingkas: noCtxAnswer,
        sumber: [],
        provider: 'none',
        dariFaq: false,
        latensiDtk: ((Date.now() - t0) / 1000).toFixed(1),
        vote: '',
      }, LOG_TIMEOUT_MS);
      return res.status(200).json({
        answer: noCtxAnswer,
        sources: [],
        usage: null,
        provider: 'none',
        ms: Date.now() - t0,
      });
    }

    // Inkubasi 1 — FAQ terverifikasi dulu (tanpa LLM, instan, konsisten).
    // Entri dikurasi admin via commit; yang kedaluwarsa tidak dipakai.
    // Gagal baca file -> lanjut ke LLM seperti biasa (bukan error).
    const faq = loadFaq();
    const faqHit = faq ? findFaq(question, faq) : null;
    if (faqHit) {
      const faqSources = Array.isArray(faqHit.sumber) ? faqHit.sumber : [];
      await logAnswer(sheet, {
        ...logBase,
        terjawab: true,
        jawabanRingkas: faqHit.jawaban,
        sumber: faqSources,
        provider: 'faq',
        dariFaq: true,
        latensiDtk: ((Date.now() - t0) / 1000).toFixed(1),
        vote: '',
      }, LOG_TIMEOUT_MS);
      return res.status(200).json({
        answer: faqHit.jawaban,
        sources: faqSources,
        usage: null,
        provider: 'faq',
        providerLabel: 'FAQ terverifikasi',
        fromFaq: true,
        ms: Date.now() - t0,
      });
    }

    const providerPref = (process.env.LLM_PROVIDER || 'nvidia').toLowerCase();
    const hasBackupKey = Boolean(process.env.LLM_API_KEY_BACKUP);
    const primary = providerPref === 'openrouter'
      ? { name: 'openrouter', baseUrl: process.env.LLM_BASE_URL_BACKUP || DEFAULTS.openrouter.baseUrl, apiKey: process.env.LLM_API_KEY_BACKUP, model: process.env.LLM_MODEL_BACKUP || DEFAULTS.openrouter.model }
      : { name: 'nvidia', baseUrl: process.env.LLM_BASE_URL || DEFAULTS.nvidia.baseUrl, apiKey: process.env.LLM_API_KEY, model: process.env.LLM_MODEL || DEFAULTS.nvidia.model };
    const backup = providerPref === 'openrouter'
      ? null
      : (hasBackupKey
        ? { name: 'openrouter', baseUrl: process.env.LLM_BASE_URL_BACKUP || DEFAULTS.openrouter.baseUrl, apiKey: process.env.LLM_API_KEY_BACKUP, model: process.env.LLM_MODEL_BACKUP || DEFAULTS.openrouter.model }
        : null);

    if (!primary.apiKey) {
      const msg = primary.name === 'openrouter'
        ? 'AI Assistant belum diaktifkan: kunci cadangan (LLM_API_KEY_BACKUP) belum dipasang.'
        : 'AI Assistant belum diaktifkan: kunci utama (LLM_API_KEY) belum dipasang.';
      return res.status(503).json({ error: msg });
    }

    const contextText = `KONTEKS: ${JSON.stringify(context)}\n\nPERTANYAAN: ${question.trim()}`;
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...hist.map((h) => ({ role: h.role, content: String(h.content).slice(0, 1000) })),
      { role: 'user', content: contextText },
    ];
    const sources = Array.isArray(context.sumber) ? context.sumber : [];

    // Tanpa cadangan: primer DUA kali (38 dtk + 14 dtk) dalam satu request,
    // supaya pengunjung tidak perlu klik retry manual. Dengan cadangan:
    // failover yang dirancang tetap berlaku (primer 30 dtk -> cadangan 25 dtk).
    const attempts = backup
      ? [{ ...primary, timeoutMs: PRIMARY_TIMEOUT_WITH_BACKUP }, { ...backup, timeoutMs: BACKUP_TIMEOUT }]
      : [{ ...primary, timeoutMs: PRIMARY_ALONE_FIRST_MS }, { ...primary, timeoutMs: PRIMARY_ALONE_RETRY_MS }];

    let lastError = null;
    for (const a of attempts) {
      try {
        const r = await callLlm({ baseUrl: a.baseUrl, apiKey: a.apiKey, model: a.model, messages, timeoutMs: a.timeoutMs });
        const answer = cleanAnswer(r.content);
        await logAnswer(sheet, {
          ...logBase,
          terjawab: !answer.includes('Tidak ada di data dashboard'),
          jawabanRingkas: answer,
          sumber: sources,
          provider: a.name,
          dariFaq: false,
          // Latensi TOTAL (semua percobaan), bukan percobaan yang berhasil saja.
          latensiDtk: ((Date.now() - t0) / 1000).toFixed(1),
          vote: '',
        }, LOG_TIMEOUT_MS);
        return res.status(200).json({
          answer,
          sources,
          usage: r.usage ? { inputTokens: r.usage.prompt_tokens ?? null, outputTokens: r.usage.completion_tokens ?? null } : null,
          provider: a.name,
          providerLabel: providerLabelForModel(a.model) || 'AI',
          fromFaq: false,
          ms: Date.now() - t0,
        });
      } catch (e) {
        lastError = e;
        console.error(`[assistant] ${a.name} gagal: ${String(e && e.message ? e.message : e).slice(0, 200)}`);
      }
    }
    // Semua percobaan gagal: catat SATU baris log hasil akhir (terjawab =
    // tidak). Pertanyaan tak terjawab adalah bahan belajar utama Inkubasi 2,
    // jadi kegagalan pun dicatat, bukan didiamkan. Satu baris per pertanyaan,
    // bukan per percobaan — percobaan yang gagal tidak dicatat sendiri-sendiri.
    await logAnswer(sheet, {
      ...logBase,
      terjawab: false,
      jawabanRingkas: 'AI sedang tidak bisa menjawab — coba lagi sebentar lagi.',
      sumber: sources,
      provider: primary.name,
      dariFaq: false,
      latensiDtk: ((Date.now() - t0) / 1000).toFixed(1),
      vote: '',
    }, LOG_TIMEOUT_MS);
    return res.status(502).json({
      error: 'AI sedang tidak bisa menjawab — coba lagi sebentar lagi.',
      detail: lastError ? String(lastError.message || lastError).slice(0, 200) : undefined,
    });
  } catch (e) {
    console.error(`[assistant] error: ${String(e && e.message ? e.message : e).slice(0, 200)}`);
    return res.status(500).json({ error: 'Terjadi kesalahan di server.' });
  }
}
