// AI Assistant — tombol mengambang + panel chat (karakter: avatar KomBO v3).
// Maskot: <Mascot> (src/components/Mascot.tsx) — still v3
// (/assistant-avatar.webp) + overlay animasi CSS/SVG (mata berkedip +
// spark listrik pipi). File v3 TIDAK diubah isinya.
// Video idle/working karakter LAMA (tanpa helm) sudah tidak dipakai sejak
// v2 — file mp4 masih ada di public/ tapi tidak lagi direferensikan
// (push-files tidak bisa menghapus file; hapus via web UI bila perlu).
// Inkubasi 1: panel pemandu "Apa saja yang bisa ditanyakan?" (tombol "?"),
// saran dinamis dari konteks halaman, jawaban tak-terjawab yang mengarahkan,
// memori perangkat (localStorage) + FAQ terverifikasi (faq-assistant.json).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { HelpCircle, Send, X } from 'lucide-react';
import { askAssistant, ChatMsg, dynamicSuggestions, getAssistantContext, routeToPage, subscribeAssistantContext } from '../lib/assistant';
import { clearMemory, loadMemory, popularQuestions, recordQA } from '../lib/assistant-memory';
import type { MemoryEntry } from '../lib/assistant-memory';
import Mascot from './Mascot';
import AssistantGuide from './AssistantGuide';

/** Render jawaban: dukung **tebal** (model sering membalas dengan markdown). */
function renderRich(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') && p.length > 4
    ? <b key={i}>{p.slice(2, -2)}</b>
    : <span key={i}>{p}</span>));
}

function ProviderBadge({ provider, providerLabel }: { provider?: string; providerLabel?: string }) {
  if (!provider || provider === 'none') return null;
  const name = providerLabel || 'AI';
  return (
    <span className="ml-2 text-[10px] t-muted" title={`Dijawab oleh ${name}`}>
      Powered by {name}
    </span>
  );
}

export default function AiAssistant() {
  const { pathname } = useLocation();
  const page = routeToPage(pathname);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.removeEventListener('keydown', onKey);
  }, [open ]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) { setElapsed(0); return; }
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  // Ganti halaman: konteks ikut berganti; riwayat sesi tetap (tidak dihapus).
  // Inkubasi 1 — memori perangkat + panel pemandu.
  const [showGuide, setShowGuide] = useState(false);
  const [memory, setMemory] = useState<MemoryEntry[]>(() => loadMemory());
  const [faqPola, setFaqPola] = useState<string[]>([]);
  const [faqLoaded, setFaqLoaded] = useState(false);
  const [ctxVersion, setCtxVersion] = useState(0);
  useEffect(() => subscribeAssistantContext(() => setCtxVersion((v) => v + 1)), []);
  useEffect(() => {
    if (!open || faqLoaded) return;
    setFaqLoaded(true);
    fetch('/faq-assistant.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const entri = Array.isArray(d?.entri) ? d.entri : [];
        setFaqPola(entri.slice(0, 3).map((e: any) => String(e?.pola?.[0] || '')).filter(Boolean));
      })
      .catch(() => { /* tanpa FAQ: populer dari riwayat perangkat saja */ });
  }, [open, faqLoaded]);
  // Saran dinamis (Inkubasi 1, §5.2) — dibangkitkan dari konteks halaman
  // yang sedang dimuat; ctxVersion memaksa render ulang saat registry berubah.
  const ctx = getAssistantContext(page);
  const suggestions = useMemo(() => dynamicSuggestions(ctx, page), [ctx, ctxVersion, page]);
  // "Pertanyaan populer": FAQ kurasi dulu (lintas pengunjung), lalu riwayat perangkat.
  const popular = useMemo(() => popularQuestions(memory, faqPola, 3), [memory, faqPola]);

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    if (!getAssistantContext(page)) {
      setMessages((m) => [...m,
        { role: 'user', content: q },
        { role: 'assistant', content: 'Data halaman ini belum dimuat — coba tekan Refresh Data, lalu tanya lagi.', error: true }]);
      setInput('');
      return;
    }
    setMessages((m) => [...m, { role: 'user', content: q }]);
    setInput('');
    setLoading(true);
    try {
      const r = await askAssistant(q, messages);
      setMessages((m) => [...m, { role: 'assistant', content: r.answer, sources: r.sources, provider: r.provider, providerLabel: r.providerLabel, fromFaq: r.fromFaq }]);
      // Inkubasi 1 — catat di memori perangkat (jawaban error tidak dicatat).
      setMemory(recordQA({ q, a: r.answer, page, answered: !r.answer.includes('Tidak ada di data dashboard'), sources: r.sources, providerLabel: r.providerLabel, fromFaq: r.fromFaq }));
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: e instanceof Error ? e.message : 'Gagal menghubungi AI.', error: true }]);
    } finally {
      setLoading(false);
    }
  }

  /** Tanya dari panel pemandu / riwayat: tutup pemandu, lalu kirim. */
  function askFromGuide(q: string) {
    setShowGuide(false);
    send(q);
  }

  return (
    <>
      {/* Tombol mengambang — kanan bawah; maskot 3x (168px, dulu 56px). */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Tutup Asisten AI' : 'Buka Asisten AI — Tanya Data UPT'}
        title="Tanya Data UPT"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2"
      >
        <span className="hidden sm:inline-flex items-center rounded-full px-4 py-2.5 text-sm font-bold text-white shadow-lg"
          style={{ background: 'linear-gradient(135deg,#0072CE,#00AEEF)' }}>
          Tanya Data UPT
        </span>
        <span className="relative inline-flex rounded-full shadow-lg ring-2 ring-white/70" style={{ background: '#0B2340' }}>
          <Mascot size={168} working={loading} />
          <span className="absolute bottom-1 right-1 block w-5 h-5 rounded-full bg-green-500 ring-2 ring-white" title="Online (demo)" />
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Tanya Data UPT"
          className="fixed z-[60] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
          style={{
            right: 12, bottom: 200, width: 'min(430px, calc(100vw - 24px))', height: 'min(560px, calc(100vh - 240px))',
            background: 'var(--bg2)', border: '1px solid var(--card-border)',
          }}
        >
          {/* Header — maskot v3 beranimasi (mode working saat menunggu jawaban). */}
          <div className="flex items-center gap-3 px-4 py-3 text-white shrink-0"
            style={{ background: 'linear-gradient(135deg,#0B2340,#0072CE)' }}>
            <Mascot size={64} working={loading} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="font-extrabold text-sm">Tanya Data UPT</div>
              <div className="text-[11px] opacity-80">
                {loading ? `Memikirkan jawaban… ${elapsed} dtk` : 'Asisten data dashboard · demo'}
              </div>
            </div>
            <button type="button" onClick={() => setShowGuide((v) => !v)} aria-label="Apa saja yang bisa ditanyakan?" title="Apa saja yang bisa ditanyakan?" className="p-1 rounded-lg hover:bg-white/20">
              <HelpCircle size={18} />
            </button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Tutup" className="p-1 rounded-lg hover:bg-white/20">
              <X size={18} />
            </button>
          </div>

          {/* Isi chat — atau panel pemandu "Apa saja yang bisa ditanyakan?" */}
          {showGuide ? (
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <AssistantGuide page={page} popular={popular} history={memory} onAsk={askFromGuide}
                onClearHistory={() => { clearMemory(); setMemory([]); }} />
            </div>
          ) : (
          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-xs t-muted leading-relaxed">
                <p className="mb-2">
                  Halo! Saya asisten data dashboard UPT Bengkulu (demo). Saya menjawab dari data yang tampil di
                  halaman ini — lengkap dengan sumbernya. Ketuk <b>?</b> di atas untuk melihat semua yang bisa ditanyakan.
                </p>
                {suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {suggestions.map((s) => (
                      <button key={s} type="button" onClick={() => send(s)}
                        className="rounded-full px-3 py-1.5 text-[11px] font-semibold"
                        style={{ background: 'var(--bg)', border: '1px solid var(--card-border)', color: 'var(--accent)' }}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                {popular.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5">Pertanyaan populer</div>
                    <div className="flex flex-wrap gap-2">
                      {popular.map((s) => (
                        <button key={s} type="button" onClick={() => send(s)}
                          className="rounded-full px-3 py-1.5 text-[11px] font-semibold"
                          style={{ background: 'var(--bg)', border: '1px solid var(--card-border)', color: 'var(--accent)' }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed"
                  style={m.role === 'user'
                    ? { background: 'linear-gradient(135deg,#0072CE,#00AEEF)', color: '#fff' }
                    : m.error
                      ? { background: 'rgba(255,59,59,0.12)', border: '1px solid rgba(255,59,59,0.4)', color: 'var(--text)' }
                      : { background: 'var(--bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.role === 'assistant' ? renderRich(m.content) : m.content}</div>
                  {m.role === 'assistant' && !m.error && (
                    <div className="mt-1.5 text-[11px] t-muted">
                      {m.sources && m.sources.length > 0 && <>Sumber: {m.sources.join(' · ')}</>}
                      {m.fromFaq
                        ? <span className="ml-2 text-[10px] font-bold" style={{ color: '#2E7D32' }} title="Jawaban terverifikasi admin (FAQ)">✓ dari FAQ terverifikasi</span>
                        : <ProviderBadge provider={m.provider} providerLabel={m.providerLabel} />}
                    </div>
                  )}
                  {m.role === 'assistant' && !m.error && m.content.includes('Tidak ada di data dashboard') && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {dynamicSuggestions(ctx, page).map((s) => (
                        <button key={s} type="button" onClick={() => send(s)}
                          className="rounded-full px-3 py-1.5 text-[11px] font-semibold"
                          style={{ background: 'var(--bg)', border: '1px solid var(--card-border)', color: 'var(--accent)' }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3 py-2 text-sm t-muted"
                  style={{ background: 'var(--bg)', border: '1px solid var(--card-border)' }}>
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce">•</span><span className="animate-bounce" style={{ animationDelay: '0.15s' }}>•</span><span className="animate-bounce" style={{ animationDelay: '0.3s' }}>•</span>
                  </span>
                  <span className="ml-2">Mencari di data halaman…</span>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Input */}
          <div className="shrink-0 flex items-center gap-2 px-3 py-3"
            style={{ borderTop: '1px solid var(--card-border)' }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              maxLength={500}
              placeholder="Tanya data halaman ini…"
              disabled={loading}
              className="flex-1 min-w-0 rounded-full px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
            />
            <button type="button" onClick={() => send()} disabled={loading || !input.trim()}
              aria-label="Kirim pertanyaan"
              className="inline-flex items-center justify-center rounded-full w-10 h-10 text-white shrink-0 disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#0072CE,#00AEEF)' }}>
              <Send size={17} />
            </button>
          </div>
          <div className="shrink-0 px-3 pb-2 text-[10px] t-muted text-center">
            Demo — jawaban hanya dari data halaman ini &amp; bisa salah; cek sumbernya.
          </div>
        </div>
      )}
    </>
  );
}
