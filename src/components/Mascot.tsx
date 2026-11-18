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
@keyframes msc-spark { 0%, 100% { opacity: .15; transform: scale(.7) rotate(-10deg); } 50% { opacity: 1; transform: scale(1.35) rotate(10deg); } }
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
                position: 'absolute', left: `calc(${s.left}% - ${s.kind === 'bolt' ? 6 : 4}%)`, top: `calc(${s.top}% - ${s.kind === 'bolt' ? 6 : 4}%)`,
                width: s.kind === 'bolt' ? '12%' : '8%', height: 'auto', pointerEvents: 'none',
                transformBox: 'fill-box', transformOrigin: 'center',
                filter: 'drop-shadow(0 0 5px #ffffff) drop-shadow(0 0 14px #ffe45e) drop-shadow(0 0 20px rgba(255,228,94,0.6))',
                animation: `msc-spark ${sparkDur} ease-in-out infinite`, animationDelay: s.delay,
              }}>
              {s.kind === 'bolt'
                ? <path d="M13 2 L4.5 13.5 H10 L8.5 22 L19 9.5 H13.5 Z" fill="#ffffff" stroke="#f5b301" strokeWidth="2" strokeLinejoin="round" />
                : <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" fill="#ffffff" stroke="#f5b301" strokeWidth="1.4" strokeLinejoin="round" />}
            </svg>
          ))}
        </div>
      )}
    </div>
  );
}
