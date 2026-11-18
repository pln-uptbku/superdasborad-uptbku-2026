import React, { useState } from 'react';
import { Bot } from 'lucide-react';

/**
 * Maskot AI Assistant (karakter v3 — file public/assistant-avatar.webp TIDAK
 * pernah diubah isinya; animasi di sini murni OVERLAY di atas still).
 *
 * Koordinat terukur dari file v3 (1600x1600, diukur 2026-11-18 dari piksel):
 * - mata kiri  cx 38,3% cy 38,0% (lebar 6,1% × tinggi 6,75%)
 * - mata kanan cx 58,7% cy 38,0%
 * - pipi kiri  cx 35,2% cy 42,9% (lingkaran merah)
 * - pipi kanan cx 63,4% cy 43,7%
 * Semua overlay memakai % sehingga skala ikut ukuran render apa pun.
 *
 * Gerakan: mata berkedip (kelopak kuning menutup mata), spark petir di luar
 * pipi berdenyut (opacity + skala + rotasi, bukan opacity saja), dan seluruh
 * karakter bergoyang halus. Mode working = semua lebih cepat.
 * Video idle/working karakter LAMA (tanpa helm) tidak lagi dipakai — header
 * panel dan tombol mengambang sama-sama memakai still v3 beranimasi ini.
 *
 * PERBAIKAN 2026-11-18 (verifikasi preview 10:13–10:21 WIB: kedipan + spark
 * tidak terukur di tombol): diagnosis lokal membuktikan overlay ADA di DOM
 * pada posisi benar dan animasi JALAN (computed style: kelopak mencapai
 * scaleY 0,99; opacity spark 0,46–1,0) — tetapi kedipan terlalu singkat
 * (~0,15 dtk per siklus 4,2 dtk) sehingga lolos dari sampling 0,74 dtk,
 * dan ayunan kecerahan spark (9–15) kalah dari noise goyangan bob (22–24).
 * Perbaikan: kedipan ditahan menutup (duty ~9% per siklus 3,4 dtk) dan
 * spark diperbesar + kontras lebih dalam (opacity 0,15–1, skala 0,7–1,35).
 *
 * PERBAIKAN 2 2026-11-18 (verifikasi preview 11:34–11:41 WIB: denyut spark
 * tidak tertangkap bersih): diagnosis membuktikan animasi spark JALAN di
 * production build (rAF: opacity 0,15–1,0, ~20% sampel di tiap ekstrem)
 * dan terlihat di diff paksa (opacity 1 vs 0,05: rerata |Δ| 24–31 per kotak
 * spark vs ~10–12 kotak kontrol) — tetapi denyutnya terlalu halus untuk
 * sampling screenshot 1 dtk: (a) petir kiri menempel di LATAR PUTIH gambar
 * avatar (still v3 tidak mengisi lingkaran) sehingga petir putih di atas
 * putih nyaris tak terlihat; (b) keyframe tanpa tahan di ekstrem (hanya
 * titik 50%) + siklus 1,8 dtk membuat puncak hanya ~0,3 dtk; (c) bob
 * ±3,7px menggeser petir keluar-masuk kotak ukur (noise 10–19 poin).
 * Perbaikan: petir lebih tebal (stroke 3,5, lebar 13%) + outline amber
 * pekat + glow lebih kuat, keyframe MENAHAN di kedua ekstrem (min 0,05,
 * maks 1, masing-masing ~24% siklus) supaya sampling 1 dtk menangkap
 * keduanya. Kedipan TIDAK disentuh.
 */
const EYES = [
  { left: 38.3, top: 38.0 },
  { left: 58.7, top: 38.0 },
];
/** Petir + bintang spark di LUAR lingkaran pipi (tidak menutupi pipi merah). */
const SPARKS = [
  { left: 27.7, top: 42.9, delay: '0s', kind: 'bolt' as const },
  { left: 70.9, top: 43.7, delay: '0.9s', kind: 'bolt' as const },
  { left: 28.5, top: 36.5, delay: '0.45s', kind: 'star' as const },
  { left: 71.5, top: 37.5, delay: '1.35s', kind: 'star' as const },
];

const KEYFRAMES = `
@keyframes msc-blink { 0%, 86%, 100% { transform: scaleY(0); } 89.5%, 95% { transform: scaleY(1); } 98.5% { transform: scaleY(0); } }
@keyframes msc-spark { 0%, 12% { opacity: .05; transform: scale(.7) rotate(-10deg); } 38%, 62% { opacity: 1; transform: scale(1.35) rotate(10deg); } 88%, 100% { opacity: .05; transform: scale(.7) rotate(-10deg); } }
@keyframes msc-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2.2%); } }
@media (prefers-reduced-motion: reduce) { .msc-anim { animation: none !important; } }
`;

export default function Mascot({ size = 168, working = false, className, style }: {
  size?: number; working?: boolean; className?: string; style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const blinkDur = working ? '2.2s' : '3.4s';
  const sparkDur = working ? '0.9s' : '1.8s';
  const bobDur = working ? '1.8s' : '3.4s';
  return (
    <div
      role="img" aria-label="Maskot AI Assistant UPT Bengkulu"
      className={className}
      style={{ position: 'relative', width: size, height: size, flexShrink: 0, ...style }}
    >
      <style>{KEYFRAMES}</style>
      {failed ? (
        <div className="flex items-center justify-center rounded-full" style={{ width: '100%', height: '100%', background: '#FFD94D', color: '#0B2340' }}>
          <Bot size={Math.max(24, size * 0.45)} />
        </div>
      ) : (
        <div className="msc-anim" style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', animation: `msc-bob ${bobDur} ease-in-out infinite` }}>
          <img
            src="/assistant-avatar.webp" alt="" draggable={false}
            onError={() => setFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: '50%' }}
          />
          {/* Kelopak mata — kuning bulu di sekitar mata, menutup saat berkedip.
              Ukuran sedikit lebih besar dari mata (mata 6,1% × 6,75%) agar
              saat menutup benar-benar menutupi mata + margin. */}
          {EYES.map((e, i) => (
            <div key={i} className="msc-anim" aria-hidden
              style={{
                position: 'absolute', left: `calc(${e.left}% - 4.0%)`, top: `calc(${e.top}% - 4.6%)`,
                width: '8.0%', height: '9.2%', borderRadius: '50%',
                background: 'linear-gradient(180deg, #f9db55 0%, #eeb218 100%)',
                transform: 'scaleY(0)', transformOrigin: 'center',
                animation: `msc-blink ${blinkDur} ease-in-out infinite`,
                animationDelay: i === 1 ? '0.06s' : '0s',
              }} />
          ))}
          {/* Spark listrik di pipi — petir + bintang, berdenyut bergantian. */}
          {SPARKS.map((s, i) => (
            <svg key={i} viewBox="0 0 24 24" aria-hidden className="msc-anim"
              style={{
                position: 'absolute', left: `calc(${s.left}% - ${s.kind === 'bolt' ? 6.5 : 4.5}%)`, top: `calc(${s.top}% - ${s.kind === 'bolt' ? 6.5 : 4.5}%)`,
                width: s.kind === 'bolt' ? '13%' : '9%', height: 'auto', pointerEvents: 'none',
                transformBox: 'fill-box', transformOrigin: 'center',
                filter: 'drop-shadow(0 0 6px #ffffff) drop-shadow(0 0 16px #ffd500) drop-shadow(0 0 26px rgba(255,170,0,0.75))',
                animation: `msc-spark ${sparkDur} ease-in-out infinite`, animationDelay: s.delay,
              }}>
              {s.kind === 'bolt'
                ? <path d="M13 2 L4.5 13.5 H10 L8.5 22 L19 9.5 H13.5 Z" fill="#ffffff" stroke="#e8930c" strokeWidth="3.5" strokeLinejoin="round" />
                : <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" fill="#ffffff" stroke="#e8930c" strokeWidth="2.5" strokeLinejoin="round" />}
            </svg>
          ))}
        </div>
      )}
    </div>
  );
}
