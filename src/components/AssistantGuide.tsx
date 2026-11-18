// Panel pemandu "Apa saja yang bisa ditanyakan?" — Inkubasi 1
// (rencana-inkubasi-ai-agent.md §5.4). Indeks kemampuan 10 halaman +
// pertanyaan populer + riwayat perangkat. Panel ini adalah kontrak, bukan
// brosur: status Live/Terbatas jujur mengikuti context builder yang ada.
// Contoh di halaman AKTIF langsung bertanya; contoh halaman lain membuka
// halaman itu dulu (konteksnya baru ada setelah halaman dimuat).
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PAGE_CAPABILITIES } from '../lib/assistant';
import type { AssistantContext } from '../lib/assistant';
import type { MemoryEntry } from '../lib/assistant-memory';
import { DISPLAY_HISTORY, unansweredEntries } from '../lib/assistant-memory';

function Chip({ label, onClick, arrow }: { label: string; onClick: () => void; arrow?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-left"
      style={{ background: 'var(--bg)', border: '1px solid var(--card-border)', color: 'var(--accent)' }}>
      {label}{arrow ? ' ↗' : ''}
    </button>
  );
}

export default function AssistantGuide({ page, popular, history, onAsk, onClearHistory }: {
  page: AssistantContext['page'];
  popular: string[];
  history: MemoryEntry[];
  onAsk: (q: string) => void;
  onClearHistory: () => void;
}) {
  const nav = useNavigate();
  const unanswered = unansweredEntries(history);
  const shown = history.slice(0, DISPLAY_HISTORY);
  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="font-extrabold mb-1">Apa saja yang bisa ditanyakan?</div>
        <p className="text-xs t-muted leading-relaxed">
          Saya hanya menjawab dari data dashboard UPT Bengkulu — lengkap dengan sumbernya.
          Ketuk contoh di halaman ini untuk langsung bertanya; contoh halaman lain akan membuka halaman itu dulu.
        </p>
      </div>

      {popular.length > 0 && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide t-muted mb-1.5">Pertanyaan populer</div>
          <div className="flex flex-wrap gap-2">
            {popular.map((q) => <Chip key={q} label={q} onClick={() => onAsk(q)} />)}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {PAGE_CAPABILITIES.map((c) => {
          const active = c.page === page;
          return (
            <div key={c.page} className="rounded-xl p-3"
              style={{ background: 'var(--bg)', border: `1px solid ${active ? 'var(--accent)' : 'var(--card-border)'}` }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[13px]">{c.label}{active ? ' · di sini' : ''}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={c.status === 'Live'
                    ? { background: 'rgba(46,125,50,0.15)', color: '#2E7D32' }
                    : { background: 'rgba(245,124,0,0.15)', color: '#F57C00' }}>
                  {c.status === 'Live' ? '● Live' : '● Terbatas'}
                </span>
              </div>
              <div className="text-xs t-muted mt-0.5">{c.bisa}</div>
              <div className="flex flex-wrap gap-2 mt-2">
                {c.contoh.map((q) => (
                  <Chip key={q} label={q} arrow={!active}
                    onClick={() => { if (active) onAsk(q); else nav(c.route); }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {unanswered.length > 0 && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide t-muted mb-1.5">
            Belum terjawab di perangkat ini ({unanswered.length})
          </div>
          <div className="text-xs t-muted mb-2 leading-relaxed">
            Pertanyaan ini belum ada datanya di dashboard — dicatat di perangkat ini saja sebagai bahan perbaikan.
          </div>
          <div className="flex flex-wrap gap-2">
            {unanswered.slice(0, 5).map((e, i) => <Chip key={i} label={e.q} onClick={() => onAsk(e.q)} />)}
          </div>
        </div>
      )}

      {shown.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wide t-muted">Riwayat perangkat</div>
            <button type="button" onClick={onClearHistory}
              className="text-[11px] font-semibold t-muted underline">Hapus riwayat</button>
          </div>
          <div className="space-y-1">
            {shown.slice(0, 5).map((e, i) => (
              <button key={i} type="button" onClick={() => onAsk(e.q)}
                className="block w-full text-left text-xs rounded-lg px-2 py-1.5 truncate"
                style={{ background: 'var(--bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
                title={e.q}>
                {e.answered ? '✓ ' : '○ '}{e.q}
              </button>
            ))}
          </div>
          <div className="text-[11px] t-muted mt-1.5 leading-relaxed">
            Hanya di perangkat ini — tidak dikirim ke server. Tersimpan maks. 90 hari.
          </div>
        </div>
      )}

      <div className="text-[11px] t-muted leading-relaxed rounded-xl p-3"
        style={{ background: 'var(--bg)', border: '1px solid var(--card-border)' }}>
        Jangan mengetik data pribadi (nama, nomor HP, email) — bot ini hanya menjawab data dashboard.
        Pertanyaan yang mengandung data pribadi tidak disimpan.
      </div>
    </div>
  );
}
