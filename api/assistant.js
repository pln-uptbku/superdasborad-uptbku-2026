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

import { loadFaq, findFaq } from './faq.js';

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
const PRIMARY_TIMEOUT_WITH_BACKUP = 30000;
const PRIMARY_TIMEOUT_ALONE = 55000;
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
      return res.status(200).json({ ok: true, configured: Boolean(process.env.LLM_API_KEY), faqEntries: (loadFaq()?.entri || []).length });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Metode tidak didukung' });
    }
    const ip = clientIp(req);
    if (rateLimited(ip)) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ error: 'Terlalu banyak pertanyaan — coba lagi sebentar lagi.' });
    }

    const body = await readBody(req);
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Body JSON tidak valid' });
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

    // Tanpa konteks (data halaman belum dimuat), jawab langsung tanpa
    // memanggil LLM (hemat panggilan, deterministik).
    if (!context || typeof context.ringkasan !== 'object') {
      return res.status(200).json({
        answer: 'Saya hanya bisa menjawab dari data yang tampil di halaman ini. Data halaman ini belum dimuat — tunggu sebentar (atau tekan Refresh Data), lalu tanya lagi.',
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
      return res.status(200).json({
        answer: faqHit.jawaban,
        sources: Array.isArray(faqHit.sumber) ? faqHit.sumber : [],
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

    const primaryTimeout = backup ? PRIMARY_TIMEOUT_WITH_BACKUP : PRIMARY_TIMEOUT_ALONE;
    const attempts = [{ ...primary, timeoutMs: primaryTimeout }];
    if (backup) attempts.push({ ...backup, timeoutMs: BACKUP_TIMEOUT });

    let lastError = null;
    for (const a of attempts) {
      try {
        const r = await callLlm({ baseUrl: a.baseUrl, apiKey: a.apiKey, model: a.model, messages, timeoutMs: a.timeoutMs });
        return res.status(200).json({
          answer: cleanAnswer(r.content),
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
    return res.status(502).json({
      error: 'AI sedang tidak bisa menjawab — coba lagi sebentar lagi.',
      detail: lastError ? String(lastError.message || lastError).slice(0, 200) : undefined,
    });
  } catch (e) {
    console.error(`[assistant] error: ${String(e && e.message ? e.message : e).slice(0, 200)}`);
    return res.status(500).json({ error: 'Terjadi kesalahan di server.' });
  }
}
