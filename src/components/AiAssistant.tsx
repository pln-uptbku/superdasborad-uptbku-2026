// AI Assistant demo — tombol mengambang + panel chat (karakter: avatar KomBO).
// Avatar: /assistant-avatar.webp (still), /assistant-avatar-idle.mp4 (loop
// di header), /assistant-avatar-working.mp4 (saat menunggu jawaban).
// File avatar BELUM ada di repo (menunggu restyle yang disetujui user) —
// bila file belum ada, komponen jatuh kembali ke ikon Bot (tidak error).
// Video hanya dimuat saat panel dibuka (lazy).
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bot, Send, X } from 'lucide-react';
import { askAssistant, ChatMsg, getAssistantContext, routeToPage, SUGGESTED_QUESTIONS } from '../lib/assistant';

const AVATAR_IMG = '/assistant-avatar.webp';
const AVATAR_IDLE = '/assistant-avatar-idle.mp4';
const AVATAR_WORKING = '/assistant-avatar-working.mp4';

function Avatar({ size, working }: { size: number; working?: boolean }) {
  const [mode, setMode] = useState<'video' | 'img' | 'icon'>('video');
  const src = working ? AVATAR_WORKING : AVATAR_IDLE;
  useEffect(() => { setMode('video'); }, [src]);
  if (mode === 'video') {
    return (
      <video
        key={src}
        src={src}
        width={size}
        height={size}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        onError={() => setMode('img')}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', background: '#0B2340' }}
      />
    );
  }
  if (mode === 'img') {
    return (
      <img
        src={AVATAR_IMG}
        width={size}
        height={size}
        alt="Asisten AI UPT Bengkulu"
        onError={() => setMode('icon')}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', background: '#0B2340' }}
      />
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white"
      style={{ width: size, height: size, background: 'linear-gradient(135deg,#0072CE,#00AEEF)' }}
    >
      <Bot size={size * 0.55} />
    </span>
  );
}

function ProviderBadge({ provider }: { provider?: string }) {
  if (!provider || provider === 'none') return null;
  const label = provider === 'openrouter' ? 'via OpenRouter (cadangan)' : 'via NVIDIA (demo)';
  return (
    <span className="ml-2 text-[10px] t-muted" title={`Dijawab oleh ${label}`}>
      {label}
    </span>
  );
}

export default function AiAssistant() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const page = routeToPage(pathname);
  const supported = page !== null;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [btnImgFailed, setBtnImgFailed] = useState(false);
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
  const suggestions = page ? SUGGESTED_QUESTIONS[page] : [];

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    if (!supported) return;
    if (!getAssistantContext(page!)) {
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
      setMessages((m) => [...m, { role: 'assistant', content: r.answer, sources: r.sources, provider: r.provider }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: e instanceof Error ? e.message : 'Gagal menghubungi AI.', error: true }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Tombol mengambang — kanan bawah, di atas konten, di bawah sidebar (z-40). */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Tutup Asisten AI' : 'Buka Asisten AI — Tanya Data UPT'}
        title="Tanya Data UPT"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2"
      >
        <span className="hidden sm:inline-flex items-center rounded-full px-3 py-2 text-xs font-bold text-white shadow-lg"
          style={{ background: 'linear-gradient(135deg,#0072CE,#00AEEF)' }}>
          Tanya Data UPT
        </span>
        <span className="relative inline-flex rounded-full shadow-lg ring-2 ring-white/70" style={{ background: '#0B2340' }}>
          {btnImgFailed ? (
            <span className="inline-flex items-center justify-center rounded-full text-white"
              style={{ width: 56, height: 56, background: 'linear-gradient(135deg,#0072CE,#00AEEF)' }}>
              <Bot size={30} />
            </span>
          ) : (
            <img src={AVATAR_IMG} width={56} height={56} alt=""
              onError={() => setBtnImgFailed(true)}
              style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }} />
          )}
          <span className="absolute bottom-0 right-0 block w-3.5 h-3.5 rounded-full bg-green-500 ring-2 ring-white" title="Online (demo)" />
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Tanya Data UPT"
          className="fixed z-[60] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
          style={{
            right: 12, bottom: 92, width: 'min(380px, calc(100vw - 24px))', height: 'min(560px, calc(100vh - 120px))',
            background: 'var(--bg2)', border: '1px solid var(--card-border)',
          }}
        >
          {/* Header — video idle (loop); saat menunggu jawaban ganti ke video working. */}
          <div className="flex items-center gap-3 px-4 py-3 text-white shrink-0"
            style={{ background: 'linear-gradient(135deg,#0B2340,#0072CE)' }}>
            <Avatar size={48} working={loading} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="font-extrabold text-sm">Tanya Data UPT</div>
              <div className="text-[11px] opacity-80">
                {loading ? `Memikirkan jawaban… ${elapsed} dtk` : 'Asisten data dashboard · demo'}
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Tutup" className="p-1 rounded-lg hover:bg-white/20">
              <X size={18} />
            </button>
          </div>

          {/* Isi chat */}
          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-xs t-muted leading-relaxed">
                <p className="mb-2">
                  Halo! Saya asisten data dashboard UPT Bengkulu (demo). Saya menjawab dari data yang tampil di
                  halaman ini — lengkap dengan sumbernya.
                </p>
                {!supported && (
                  <div className="rounded-xl p-3 text-xs"
                    style={{ background: 'var(--bg)', border: '1px solid var(--card-border)' }}>
                    Demo ini baru bisa menjawab data halaman <b>Dashboard</b> dan <b>Pentanahan</b>.
                    <button type="button" className="btn btn-primary ml-2" onClick={() => { setOpen(false); nav('/dashboard'); }}>
                      Buka Dashboard
                    </button>
                  </div>
                )}
                {supported && suggestions.length > 0 && (
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
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  {m.role === 'assistant' && !m.error && (
                    <div className="mt-1.5 text-[11px] t-muted">
                      {m.sources && m.sources.length > 0 && <>Sumber: {m.sources.join(' · ')}</>}
                      <ProviderBadge provider={m.provider} />
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

          {/* Input */}
          <div className="shrink-0 flex items-center gap-2 px-3 py-3"
            style={{ borderTop: '1px solid var(--card-border)' }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              maxLength={500}
              placeholder={supported ? 'Tanya data halaman ini…' : 'Buka Dashboard / Pentanahan dulu…'}
              disabled={loading || !supported}
              className="flex-1 min-w-0 rounded-full px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
            />
            <button type="button" onClick={() => send()} disabled={loading || !supported || !input.trim()}
              aria-label="Kirim pertanyaan"
              className="inline-flex items-center justify-center rounded-full w-10 h-10 text-white shrink-0 disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#0072CE,#00AEEF)' }}>
              <Send size={17} />
            </button>
          </div>
          <div className="shrink-0 px-3 pb-2 text-[10px] t-muted text-center">
            Demo — jawaban hanya dari data dashboard &amp; bisa salah; cek sumbernya.
          </div>
        </div>
      )}
    </>
  );
}
