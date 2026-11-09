import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Axe, BookOpen, ChevronDown, ChevronLeft, ChevronRight, Gauge, LayoutDashboard, ShieldAlert } from 'lucide-react';
import { usePageSources, useSource } from '../lib/data';
import { fmtNum, MONTHS_LONG } from '../lib/sheets';
import { C, Card, StatCard } from '../components/ui';
import { GlossarySection, Term } from '../components/Glossary';
import { lowestProblem, statusCounts } from './Kinerja';

/** Gulir halus ke sebuah seksi di halaman Beranda (memperhitungkan TopBar sticky). */
const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/** Slide carousel Visi / Misi / BISA di hero. Teks resmi dari RJP UPT Bengkulu
    2025–2029 Bab I.2; poin misi dipadatkan ke satu baris singkat dengan wording
    setia pada aslinya. Teks saja (tanpa gambar) — gambar dihapus atas permintaan
    user (ronde 4). */
type HeroSlide = { label: string; title: string; body?: string; points?: string[]; foot?: string };
const HERO_SLIDES: HeroSlide[] = [
  {
    label: 'VISI', title: 'Visi UPT Bengkulu',
    body: '“Menjadi Unit Pelaksana Transmisi yang unggul dalam pengelolaan aset dan sistem transmisi yang andal, aman, efisien, dan berkelanjutan untuk mendukung kinerja PLN dan keandalan sistem kelistrikan Regional Sumatera.”',
  },
  {
    label: 'MISI', title: 'Misi UPT Bengkulu',
    points: [
      'Keandalan sistem transmisi — perencanaan, operasi, pemeliharaan, dan proteksi berbasis risiko.',
      'Optimalisasi aset — asset management, condition-based & predictive maintenance.',
      'Keselamatan & kepatuhan — K3, manajemen risiko, pengendalian internal, tata kelola.',
      'Efisiensi & transformasi — digitalisasi, data akurat, inovasi, continuous improvement.',
      'SDM & sinergi — SDM kompeten dan kolaboratif bersama ULTG, unit PLN, mitra, dan stakeholder.',
    ],
  },
  {
    label: 'BISA', title: 'Tagline “BISA” & Tata Nilai AKHLAK',
    points: [
      'Berakhlak — menjunjung nilai AKHLAK.',
      'Inovatif — kreatif mengaplikasikan ide baru.',
      'Sinergi — kolaboratif, bertindak cepat dan tepat.',
      'Andal — menjaga keandalan sistem kelistrikan dengan K3 sebagai fondasi.',
    ],
    foot: 'AKHLAK: Amanah · Kompeten · Harmonis · Loyal · Adaptif · Kolaboratif',
  },
];

/** Carousel geser (panah + dot + swipe sentuh + auto-advance 6 detik yang
    berhenti saat disentuh / saat kursor di atasnya). Dibuat compact agar hero
    tidak terlalu tinggi. */
function HeroCarousel() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const n = HERO_SLIDES.length;
  const go = (d: number) => setIdx((i) => (i + d + n) % n);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % n), 6000);
    return () => clearInterval(t);
  }, [paused, n]);
  const slide = HERO_SLIDES[idx];
  return (
    <div
      data-testid="hero-carousel"
      className="relative overflow-hidden rounded-xl"
      style={{ background: 'rgba(4,20,43,0.22)', border: '1px solid rgba(255,255,255,0.35)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { setPaused(true); touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current != null) {
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (dx < -40) go(1);
          else if (dx > 40) go(-1);
        }
        touchX.current = null;
        setPaused(false);
      }}
    >
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1 px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-extrabold tracking-[0.18em] px-1.5 py-0.5 rounded" style={{ background: '#FFD978', color: '#071426' }}>{slide.label}</span>
            <span className="text-[12px] font-bold text-white" style={{ textShadow: '0 1px 4px rgba(4,20,43,0.65)' }}>{slide.title}</span>
          </div>
          {slide.body ? (
            <p className="text-[11px] sm:text-xs leading-relaxed text-white/90 mt-1.5" style={{ textShadow: '0 1px 4px rgba(4,20,43,0.65)' }}>{slide.body}</p>
          ) : (
            <ul className="text-[11px] sm:text-xs leading-snug text-white/90 mt-1.5 space-y-0.5" style={{ textShadow: '0 1px 4px rgba(4,20,43,0.65)' }}>
              {slide.points?.map((p) => <li key={p} className="flex gap-1.5"><span aria-hidden>•</span><span>{p}</span></li>)}
            </ul>
          )}
          {slide.foot && <div className="text-[10px] font-semibold mt-1.5" style={{ color: '#FFD978' }}>{slide.foot}</div>}
        </div>
      </div>
      <div className="flex items-center justify-between px-2 pb-2">
        <button type="button" aria-label="Slide sebelumnya" className="rounded-full p-1 text-white/80 hover:text-white hover:bg-white/10" onClick={() => go(-1)}><ChevronLeft size={15} /></button>
        <div className="flex gap-1.5" role="tablist" aria-label="Pilih slide">
          {HERO_SLIDES.map((s, i) => (
            <button key={s.label} type="button" role="tab" aria-selected={i === idx} aria-label={`Ke slide ${s.label}`} onClick={() => setIdx(i)} className="h-1.5 rounded-full transition-all" style={{ width: i === idx ? 18 : 6, background: i === idx ? '#FFD978' : 'rgba(255,255,255,0.45)' }} />
          ))}
        </div>
        <button type="button" aria-label="Slide berikutnya" className="rounded-full p-1 text-white/80 hover:text-white hover:bg-white/10" onClick={() => go(1)}><ChevronRight size={15} /></button>
      </div>
    </div>
  );
}

export default function Beranda() {
  usePageSources(['nko', 'gangguan']);
  const nko = useSource('nko');
  const ggn = useSource('gangguan');
  const nav = useNavigate();
  const months = nko.data?.months ?? [];
  const [showGuide, setShowGuide] = useState(true);
  const m = months[months.length - 1];
  const year = new Date().getFullYear();

  const gRows = ggn.data?.rows ?? [];
  const openUpt = gRows.filter((r) => r.statusUpt === 'OPEN').length;

  // Nilai live untuk baris status hero — dari hook yang sama dengan kartu KPI
  // (tidak ada angka yang dikarang: NKO, hitung status indikator, gangguan OPEN).
  const counts = m ? statusCounts(m) : null;
  const totalInd = counts ? counts.BAIK + counts.MASALAH + counts['HATI-HATI'] : 0;
  const lowProb = m ? lowestProblem(m) : null;
  const nkoVal = m?.total110 != null ? Math.min(110, m.total110) : null;

  if (nko.status === 'loading' && ggn.status !== 'ok' && !months.length) return <div className="flex items-center justify-center" style={{ minHeight: 320 }}><div className="w-10 h-10 rounded-full border-2 border-t-transparent refresh-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} /></div>;
  const allErr = [nko, ggn].every((s) => s.status === 'error');
  if (allErr) return <div className="card text-center text-sm t-muted p-8">Semua sumber Google Sheets gagal dimuat.</div>;

  return (
    <div className="space-y-5">
      {/* ---------- HERO (foto kantor UPT Bengkulu, hasil edit premium) ---------- */}
      <section aria-label="Pengantar" className="relative overflow-hidden rounded-2xl">
        <img src="/hero-kantor-upt.jpg" alt="Kantor PLN UPT Bengkulu" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(100deg, rgba(4,20,43,0.78) 0%, rgba(4,20,43,0.55) 46%, rgba(4,20,43,0.22) 78%, rgba(4,20,43,0.08) 100%)' }} />
        <div className="relative flex min-h-[420px] max-w-3xl flex-col justify-center gap-4 p-6 sm:p-10">
          <div className="text-[11px] font-bold tracking-[0.22em]" style={{ color: '#FFD978' }}>KINERJA PLN UPT BENGKULU</div>
          <h1 className="text-3xl sm:text-[42px] leading-[1.12] font-extrabold text-white">Monitoring Online Kinerja UPT Bengkulu</h1>
          <HeroCarousel />
          <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-white">
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: '#00D26A', boxShadow: '0 0 8px #00D26A' }} />
            <span>
              {m ? <>Status {MONTHS_LONG[m.monthNo - 1]} {year}: NKO {fmtNum(nkoVal, 2)} · {counts?.BAIK ?? 0} dari {totalInd} indikator BAIK</> : 'Memuat status kinerja…'}
              {m && lowProb && <> · <Term term="ABOF">{lowProb.short}</Term> {lowProb.status} perlu perhatian</>}
              {m && !lowProb && <> · Semua indikator BAIK</>}
              {m && <> · {openUpt} gangguan OPEN</>}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <button className="btn btn-primary" onClick={() => nav('/dashboard')}>Lihat Ringkasan Kinerja</button>
            <button className="btn" style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', borderColor: 'rgba(255,255,255,0.45)' }} onClick={() => { setShowGuide(true); scrollToId('cara-baca'); }}>Cara Membaca Dashboard</button>
          </div>
          <div className="text-[11px] text-white/70">Foto: Kantor PLN UPT Bengkulu · Sumber data: Google Sheets (live) · Periode {m ? MONTHS_LONG[m.monthNo - 1] : '—'} {year}</div>
        </div>
      </section>

      {/* ---------- STRIP IDENTITAS (kartu model StatCard dashboard; angka
          dari Data UPT Bengkulu 2026; ikon diekstrak dari deck profil UPT) ---------- */}
      <section aria-label="UPT Bengkulu dalam angka">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'GARDU INDUK', value: '15', valueSub: 'Gardu Induk', sub: 'GI 70 kV 3 · GI 150 kV 10 · GITET 275 kV 2', icon: '/icon-gi.png', alt: 'Gardu induk' },
            { label: 'SIRKIT PHT', value: '33', valueSub: 'Sirkit PHT', sub: 'SUTT 70 kV 7 · SUTT 150 kV 22 · SUTET 275 kV 4 — 2.424 tower · 1.582,72 kms', icon: '/icon-pht.png', alt: 'Menara penghantar' },
            { label: 'TRAFO DAYA', value: '2.475 MVA', valueSub: 'Trafo Daya', sub: '34 unit trafo daya', icon: '/icon-trafo.png', alt: 'Trafo daya' },
            { label: 'ULTG', value: '2', valueSub: 'Unit Layanan Transmisi', sub: 'Lahat & Pekalongan', icon: '/icon-ultg.png', alt: 'Unit layanan transmisi' },
          ].map((a) => (
            <StatCard
              key={a.label}
              label={a.label}
              value={a.value}
              valueSub={a.valueSub}
              sub={a.sub}
              color={C.blue}
              icon={
                <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'linear-gradient(145deg, #ffffff 0%, #dcebff 55%, #bcd9ff 100%)', border: '1px solid rgba(0,114,206,0.45)', boxShadow: '0 10px 20px rgba(0,114,206,0.35), 0 2px 4px rgba(4,20,43,0.25), inset 0 2px 3px rgba(255,255,255,0.95), inset 0 -4px 7px rgba(0,114,206,0.22)' }}>
                  <img src={a.icon} alt={a.alt} className="h-10 w-10 object-contain" style={{ filter: 'drop-shadow(0 4px 4px rgba(4,20,43,0.45))' }} />
                </div>
              }
            />
          ))}
        </div>
        <div className="text-center text-[10px] t-muted mt-3">Data UPT Bengkulu 2026</div>
      </section>

      {/* ---------- CARA BACA 30 DETIK ---------- */}
      <section id="cara-baca" aria-label="Cara membaca dashboard" style={{ scrollMarginTop: 76 }}>
        <Card>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-lg font-extrabold" style={{ color: 'var(--heading)' }}>Cara membaca dashboard ini dalam 30 detik</h2>
            <button className="btn" onClick={() => setShowGuide((v) => !v)}>{showGuide ? 'Sembunyikan' : 'Tampilkan lagi'} <ChevronDown size={14} style={{ transform: showGuide ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} /></button>
          </div>
          {showGuide && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
              <div><div className="t-label">1 · Ini dashboard apa?</div><p className="text-[13px] leading-relaxed mt-1">Ringkasan kinerja jaringan transmisi listrik PLN untuk wilayah Bengkulu — diperbarui dari data operasional setiap periode.</p></div>
              <div><div className="t-label">2 · Lihat apa dulu?</div><p className="text-[13px] leading-relaxed mt-1">Mulai dari kartu angka utama di dashboard: skor <Term term="NKO">NKO</Term>, indikator BAIK, penebangan, dan tegakan kritis.</p></div>
              <div><div className="t-label">3 · Artinya statusnya?</div><p className="text-[13px] leading-relaxed mt-1"><b style={{ color: C.ok }}>✓ BAIK</b> mencapai target. <b style={{ color: C.crit }}>! MASALAH</b> belum. Untuk tindak lanjut: <b style={{ color: C.crit }}>OPEN</b> merah = masih diproses, <b style={{ color: C.ok }}>CLOSE</b> hijau = selesai.</p></div>
              <div><div className="t-label">4 · Mau lebih dalam?</div><p className="text-[13px] leading-relaxed mt-1">Klik istilah yang bergaris titik untuk penjelasannya, atau buka halaman detail dari menu di atas.</p></div>
            </div>
          )}
        </Card>
      </section>

      {/* ---------- KARTU "SAYA MAU…" ---------- */}
      <section aria-label="Mulai dari kebutuhan Anda">
        <h2 className="text-lg font-extrabold" style={{ color: 'var(--heading)' }}>Mulai dari kebutuhan Anda</h2>
        <p className="text-xs t-muted mt-1">Tidak perlu paham istilah teknis dulu. Pilih yang ingin Anda ketahui, kami antar ke bagian yang relevan.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mt-3">
          {[
            { icon: <Gauge size={20} />, color: C.blue, title: 'Saya mau lihat apakah jaringan andal', desc: 'Skor kinerja, jumlah gangguan, dan seberapa cepat jaringan pulih.', cta: 'Ke ringkasan kinerja →', act: () => nav('/kinerja') },
            { icon: <ShieldAlert size={20} />, color: C.warn, title: 'Saya mau paham keselamatan kerja', desc: 'Bagaimana kinerja keselamatan petugas yang bekerja di jaringan tegangan tinggi.', cta: 'Ke ringkasan kinerja →', act: () => nav('/kinerja') },
            { icon: <Axe size={20} />, color: C.ok, title: 'Saya mau lihat kepedulian lingkungan', desc: 'Penebangan dan pemangkasan pohon di jalur transmisi agar jaringan aman dan andal.', cta: 'Ke penebangan →', act: () => nav('/penebangan') },
            { icon: <AlertTriangle size={20} />, color: C.crit, title: 'Saya mau tahu apa yang perlu diperhatikan', desc: 'Indikator yang bulan ini belum mencapai target, dan status tindak lanjutnya.', cta: 'Ke ringkasan kinerja →', act: () => nav('/kinerja') },
            { icon: <BookOpen size={20} />, color: C.purple, title: 'Saya mau memahami sebuah istilah', desc: 'NKO, tegakan, re-close, FOIS — semua dijelaskan dengan bahasa sehari-hari.', cta: 'Ke glosarium →', act: () => scrollToId('glosarium') },
            { icon: <LayoutDashboard size={20} />, color: C.cyan, title: 'Saya mau membuka dashboard lengkap', desc: 'Delapan halaman yang sudah berjalan: Beranda, Kinerja, Tegakan, Penebangan, Kerawanan, Gangguan, ULTG, dan Galeri Kegiatan.', cta: 'Buka dashboard live →', act: () => nav('/dashboard') },
          ].map((c) => (
            <Card key={c.title} hover className="cursor-pointer" onClick={c.act}>
              <div style={{ color: c.color }}>{c.icon}</div>
              <div className="font-bold mt-2" style={{ color: 'var(--heading)' }}>{c.title}</div>
              <p className="text-[13px] t-muted leading-relaxed mt-1">{c.desc}</p>
              <div className="text-[13px] font-bold mt-2" style={{ color: 'var(--accent)' }}>{c.cta}</div>
            </Card>
          ))}
        </div>
      </section>

      <GlossarySection />

      {/* ---------- TENTANG UPT BENGKULU ---------- */}
      <section id="tentang" aria-label="Tentang UPT Bengkulu" style={{ scrollMarginTop: 76 }}>
        <h2 className="text-lg font-extrabold" style={{ color: 'var(--heading)' }}>Tentang UPT Bengkulu</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
          <Card>
            <div className="h-section">Siapa kami</div>
            <p className="text-[13px] leading-relaxed mt-2">UPT Bengkulu adalah Unit Pelaksana Transmisi PT PLN (Persero) di bawah UIP3B Sumatera, yang mengelola aset dan sistem transmisi untuk wilayah Provinsi Bengkulu dan sebagian Sumatera Selatan, dengan unit lapangan <Term term="ULTG">ULTG</Term> Lahat dan <Term term="ULTG">ULTG</Term> Pekalongan.</p>
            <ul className="text-[13px] leading-relaxed mt-2 space-y-1 list-disc pl-5">
              <li><b>Terbentuk 7 November 2008</b> (SK Direksi 353.K/DIR/2008) — pemekaran wilayah kerja dari UP Palembang dan Tanjung Karang; beroperasi sejak Juli 2009.</li>
              <li><b>Wilayah kerja</b> — Provinsi Bengkulu dan sebagian Sumatera Selatan.</li>
              <li><b>Aset</b> — 15 Gardu Induk (GI 70 kV 3 · GI 150 kV 10 · GITET 275 kV 2), 1 Switchyard 150 kV, 33 sirkit penghantar (2.424 tower · 1.582,72 kms), 34 unit trafo daya (2.475 MVA).</li>
              <li><b>Aset baru</b> — SUTT 150 kV Manna–Bintuhan dan SUTT 150 kV PLTU–Pulau Baai (belum masuk hitungan tower).</li>
              <li><b>Kantor</b> — Jl. Basuki Rahmat No. 47, Kel. Sukamerindu, Kec. Sungai Serut, Bengkulu 38119.</li>
            </ul>
            <div className="text-[10px] t-muted mt-2">Sumber: Data UPT Bengkulu 2026 · RJP UPT Bengkulu 2025–2029.</div>
            <div className="h-section mt-4">Kinerja keandalan 2025</div>
            <p className="text-[13px] leading-relaxed mt-2"><Term term="TRAF">TRAF</Term> 99,85% (target minimum ≥98%) · <Term term="CCAF">CCAF</Term> 99,74% (target minimum ≥99%) · <Term term="TLOD & TLOF">TLOD</Term> 0,1221 jam/100 kms · <Term term="TLOD & TLOF">TLOF</Term> 0,3159 kali/100 kms. Gangguan penghantar s.d. November 2025: 43 kejadian — Petir 21 · Binatang 13 · NSF 5 · Pohon 3 · Human Error 1.</p>
            <div className="text-[10px] t-muted mt-2">Sumber: Profil Risiko UPTBKU 2026 · RJP UPT Bengkulu 2025–2029.</div>
          </Card>
          <Card>
            <div className="h-section">Visi &amp; Misi resmi</div>
            <p className="text-[13px] leading-relaxed mt-2"><b>Visi UPT Bengkulu</b><br />“Menjadi Unit Pelaksana Transmisi yang unggul dalam pengelolaan aset dan sistem transmisi yang andal, aman, efisien, dan berkelanjutan untuk mendukung kinerja PLN dan keandalan sistem kelistrikan Regional Sumatera.”</p>
            <p className="text-[13px] leading-relaxed mt-2"><b>Misi UPT Bengkulu</b></p>
            <ol className="text-[13px] leading-relaxed mt-1 space-y-1 list-decimal pl-5">
              <li>Menjamin keandalan sistem transmisi melalui perencanaan, pengoperasian, pemeliharaan, dan pengelolaan sistem proteksi yang efektif serta berbasis risiko.</li>
              <li>Mengoptimalkan pengelolaan aset transmisi melalui asset management, condition-based maintenance, predictive maintenance, dan pengelolaan siklus hidup aset.</li>
              <li>Meningkatkan keselamatan, keamanan, dan kepatuhan dengan K3, manajemen risiko, pengendalian internal, dan tata kelola perusahaan yang baik.</li>
              <li>Mendorong efisiensi dan transformasi proses bisnis melalui digitalisasi, data akurat, inovasi, dan continuous improvement.</li>
              <li>Mengembangkan SDM yang kompeten dan kolaboratif serta memperkuat sinergi dengan ULTG, unit PLN, mitra kerja, dan stakeholder.</li>
            </ol>
            <p className="text-[13px] leading-relaxed mt-2"><b>Visi PLN (korporat)</b><br />“Menjadi Perusahaan Global Top 500 dan #1 Pilihan Pelanggan untuk Solusi Energi.”</p>
            <p className="text-[13px] leading-relaxed mt-2">Tagline UPT: <b>“BISA”</b> — Berakhlak, Inovatif, Sinergi, Andal · Tata nilai: <b>AKHLAK</b> (Amanah, Kompeten, Harmonis, Loyal, Adaptif, Kolaboratif)</p>
            <div className="text-[10px] t-muted mt-2">Sumber: RJP UPT Bengkulu 2025–2029, Bab I.2 (Kepdir 0076.P/DIR/2020; visi korporat Kepdir 0319.K/DIR/2024).</div>
          </Card>
        </div>
        <Card className="mt-4">
          <div className="h-section">Struktur organisasi UPT Bengkulu</div>
          <img src="/struktur-organisasi-upt.jpg" alt="Bagan struktur organisasi UPT Bengkulu" className="w-full rounded-xl mt-2" style={{ border: '1px solid var(--card-border)' }} />
          <div className="text-[10px] t-muted mt-2">Sumber: RJP UPT Bengkulu 2025–2029.</div>
        </Card>
      </section>

      {/* ---------- FOOTER KAYA ---------- */}
      <footer className="rounded-2xl px-6 py-8" style={{ background: '#071426', color: '#EAF6FF' }}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="text-[11px] font-bold tracking-widest" style={{ color: '#FFD978' }}>PT PLN (PERSERO) — UPT BENGKULU</div>
            <p className="text-[13px] leading-relaxed mt-2" style={{ color: 'rgba(234,246,255,0.85)' }}>Dashboard kinerja transmisi yang terbuka untuk publik: keandalan, keselamatan, dan lingkungan — dilaporkan apa adanya, termasuk yang belum mencapai target.</p>
            <p className="text-xs mt-3" style={{ color: '#FFD978' }}>Pahlawan energi untuk negeri</p>
          </div>
          <div>
            <div className="t-label" style={{ color: '#FFD978' }}>Jelajahi</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2 text-[13px]">
              <button className="text-left hover:underline" onClick={() => nav('/')}>Beranda</button>
              <button className="text-left hover:underline" onClick={() => nav('/dashboard')}>Dashboard</button>
              <button className="text-left hover:underline" onClick={() => nav('/kinerja')}>Kinerja NKO</button>
              <button className="text-left hover:underline" onClick={() => nav('/tegakan')}>Tegakan (NS)</button>
              <button className="text-left hover:underline" onClick={() => nav('/penebangan')}>Realisasi Penebangan</button>
              <button className="text-left hover:underline" onClick={() => nav('/kerawanan')}>Kerawanan Transmisi</button>
              <button className="text-left hover:underline" onClick={() => nav('/gangguan')}>Monitoring Gangguan</button>
              <button className="text-left hover:underline" onClick={() => nav('/ultg')}>Kinerja ULTG</button>
              <button className="text-left hover:underline" onClick={() => nav('/galeri')}>Galeri Kegiatan</button>
              <button className="text-left hover:underline" onClick={() => scrollToId('tentang')}>Tentang</button>
              <button className="text-left hover:underline" onClick={() => scrollToId('glosarium')}>Glosarium</button>
              <button className="text-left hover:underline" onClick={() => { setShowGuide(true); scrollToId('cara-baca'); }}>Cara membaca</button>
            </div>
          </div>
          <div>
            <div className="t-label" style={{ color: '#FFD978' }}>Sumber &amp; kontak</div>
            <div className="text-[13px] leading-relaxed mt-2" style={{ color: 'rgba(234,246,255,0.85)' }}>
              <div>Sumber data: Google Sheets (live)</div>
              <div>Periode berjalan: {m ? MONTHS_LONG[m.monthNo - 1] : '—'} {year}</div>
              <div>Alamat kantor: Jl. Basuki Rahmat No. 47, Kel. Sukamerindu, Kec. Sungai Serut, Bengkulu 38119</div>
              <div><a className="hover:underline" href="https://www.pln.co.id" target="_blank" rel="noopener noreferrer">pln.co.id</a> · <a className="hover:underline" href="https://plnuptbengkulu.web.id" target="_blank" rel="noopener noreferrer">plnuptbengkulu.web.id</a></div>
            </div>
          </div>
        </div>
        <div className="text-center text-[11px] mt-6 pt-4" style={{ borderTop: '1px solid rgba(234,246,255,0.15)', color: 'rgba(234,246,255,0.6)' }}>© {year} PT PLN (Persero) UPT Bengkulu</div>
      </footer>
    </div>
  );
}
