import React, { useEffect, useRef, useState } from 'react';
import { Card } from './ui';

/**
 * Glosarium bahasa awam — definisi bersumber dari dokumen resmi.
 * KOREKSI (user 2026-11-08 23:52 WIB): TEGAKAN adalah jumlah POHON di suatu
 * span saluran transmisi tegangan tinggi — BUKAN menara/tower. Angka
 * "110 kritis dari 87.437 total tegakan" adalah hitungan pohon.
 */
export interface GlossaryEntry {
  term: string;
  short: string;
  def: string;
  source?: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: 'NKO',
    short: 'Nilai Kinerja Organisasi',
    def: 'Total pencapaian KPI: penjumlahan nilai masing-masing variabel KPI yang dikaitkan dengan pencapaian dan bobotnya. Capaian tiap indikator dibatasi maksimal 110% — itulah asal istilah “cap 110”. Indikasi warna resmi: merah bila capaian <95%, kuning bila 95–<100%, hijau bila >100%.',
    source: 'Juknis KPI UIP3B Sumatera 2026',
  },
  {
    term: 'cap 110%',
    short: 'Batas maksimal capaian',
    def: 'Capaian tiap indikator dibatasi maksimal 110% (seratus sepuluh persen). Bila hitungan capaian di atas 110%, nilainya tetap 110%. Rumus polaritas positif: X = Realisasi / Target × 100%; polaritas negatif: X = [2 − Realisasi / Target] × 100%.',
    source: 'Juknis KPI UIP3B Sumatera 2026',
  },
  {
    term: 'KPI',
    short: 'Indikator Kinerja',
    def: 'Ukuran keberhasilan yang dinilai setiap periode, misalnya keandalan jaringan, keselamatan, dan lingkungan. Di UPT Bengkulu ada 35 indikator.',
  },
  {
    term: 'Tegakan',
    short: 'Pohon di span transmisi',
    def: 'Jumlah pohon yang ada di suatu span (ruas antara dua menara) saluran transmisi tegangan tinggi, yang cenderung berdampak negatif terhadap kualitas penyaluran tenaga listrik. “Tegakan kritis” adalah pohon-pohon yang kondisinya kritis dan dipantau khusus.',
    source: 'Definisi UPT Bengkulu',
  },
  {
    term: 'Re-close',
    short: 'Pulih otomatis',
    def: 'Jaringan yang sempat padam sesaat lalu menyala kembali secara otomatis dalam hitungan detik — tanpa menunggu petugas datang.',
  },
  {
    term: 'Trip',
    short: 'Padam, perlu penanganan',
    def: 'Jaringan padam dan tidak bisa pulih sendiri; petugas harus menangani penyebabnya sebelum jaringan dinyalakan lagi.',
  },
  {
    term: 'FOIS',
    short: 'Forced Outage Information System',
    def: 'Aplikasi pencatatan gangguan padam PLN. Data gangguan untuk perhitungan kinerja — antara lain TLOF, TROD/TROF, ABOF, dan Security Index — bersumber dari FOIS (legacy FOIS / EAM FOIS), dan data gangguan wajib diinput ke aplikasi ini. Di dashboard, Status FOIS memakai konvensi: OPEN (merah) = masih diproses; CLOSE (hijau) = selesai — berlaku juga untuk Status UPT.',
    source: 'Juknis KPI UIP3B Sumatera 2026',
  },
  {
    term: 'ULTG',
    short: 'Unit Layanan Transmisi dan Gardu Induk',
    def: 'Unit pelaksana di lapangan. UPT Bengkulu membawahi ULTG Lahat dan ULTG Pekalongan.',
    source: 'RJP UPT Bengkulu 2025–2029',
  },
  {
    term: 'TRAF',
    short: 'Transmission Reliability Availability Factor',
    def: 'Faktor ketersediaan transmisi; target minimum ≥98%. Realisasi 2025: 99,85%.',
    source: 'RJP UPT Bengkulu 2025–2029 · Profil Risiko UPTBKU 2026',
  },
  {
    term: 'CCAF',
    short: 'Connection Configuration Availability Factor',
    def: 'Faktor ketersediaan konfigurasi sambungan; target minimum ≥99%. Realisasi 2025: 99,74%.',
    source: 'RJP UPT Bengkulu 2025–2029 · Profil Risiko UPTBKU 2026',
  },
  {
    term: 'TLOD & TLOF',
    short: 'Durasi & frekuensi gangguan transmisi',
    def: 'TLOD = durasi gangguan transmisi per 100 kms (jam/100 kms), realisasi 2025: 0,1221. TLOF = frekuensi gangguan transmisi per 100 kms (kali/100 kms), realisasi 2025: 0,3159.',
    source: 'Profil Risiko UPTBKU 2026',
  },
  {
    term: 'TROD & TROF',
    short: 'Durasi & frekuensi gangguan terkait transmisi',
    def: 'TROD = durasi gangguan terkait transmisi per unit gardu (jam/unit). TROF = frekuensi gangguan terkait transmisi per unit gardu (kali/unit).',
    source: 'Profil Risiko UPTBKU 2026',
  },
  {
    term: 'ABOF',
    short: 'Another Bay Outage Frequency',
    def: 'Frekuensi gangguan pada “another bay” — bay kapasitor, reaktor, kopel, bay generator pembangkit, diameter, dan busbar di gardu induk — yang menyebabkan padam instalasi. Satuan: kali/unit; polaritas negatif (makin kecil makin baik).',
    source: 'Juknis KPI UIP3B Sumatera 2026',
  },
  {
    term: 'GI',
    short: 'Gardu Induk',
    def: 'Gardu induk — instalasi tempat transformasi tegangan dan pengaturan aliran listrik dari penghantar ke jaringan distribusi atau sebaliknya. UPT Bengkulu memiliki 15 gardu induk.',
    source: 'Data UPT Bengkulu 2026',
  },
  {
    term: 'GITET',
    short: 'Gardu Induk Tegangan Ekstra Tinggi',
    def: 'Gardu induk tegangan ekstra tinggi (275 kV). UPT Bengkulu memiliki 2 GITET: GITET Lahat dan GITET Lubuk Linggau.',
    source: 'Data UPT Bengkulu 2026',
  },
  {
    term: 'PHT',
    short: 'Penghantar',
    def: 'Penghantar — saluran transmisi yang menyalurkan tenaga listrik tegangan tinggi antar gardu induk. UPT Bengkulu mengoperasikan 33 sirkit penghantar.',
    source: 'Data UPT Bengkulu 2026',
  },
  {
    term: 'SUTT',
    short: 'Saluran Udara Tegangan Tinggi',
    def: 'Saluran udara tegangan tinggi (70 kV dan 150 kV) — penghantar di atas menara. UPT Bengkulu mengoperasikan SUTT 70 kV (7 sirkit) dan SUTT 150 kV (22 sirkit).',
    source: 'Data UPT Bengkulu 2026',
  },
  {
    term: 'SUTET',
    short: 'Saluran Udara Tegangan Ekstra Tinggi',
    def: 'Saluran udara tegangan ekstra tinggi (275 kV) — penghantar di atas menara untuk jarak jauh dan daya besar. UPT Bengkulu mengoperasikan SUTET 275 kV (4 sirkit).',
    source: 'Data UPT Bengkulu 2026',
  },
  {
    term: 'UPT',
    short: 'Unit Pelaksana Transmisi',
    def: 'Unit pelaksana PLN yang mengelola aset dan sistem transmisi di suatu wilayah kerja. UPT Bengkulu membawahi ULTG Lahat dan ULTG Pekalongan.',
    source: 'RJP UPT Bengkulu 2025–2029',
  },
  {
    term: 'UIP3B',
    short: 'Unit Induk Penyaluran dan Pusat Pengatur Beban',
    def: 'Unit induk PLN yang membawahi unit pelaksana transmisi di Sumatera. UPT Bengkulu berada di bawah UIP3B Sumatera.',
    source: 'RJP UPT Bengkulu 2025–2029',
  },
  {
    term: 'K3',
    short: 'Keselamatan dan Kesehatan Kerja',
    def: 'Keselamatan dan Kesehatan Kerja — upaya mencegah kecelakaan dan penyakit akibat kerja; menjadi fondasi keandalan sistem kelistrikan.',
    source: 'Definisi umum',
  },
  {
    term: 'SDM',
    short: 'Sumber Daya Manusia',
    def: 'Sumber Daya Manusia — pegawai dan tenaga kerja yang mengoperasikan dan memelihara sistem transmisi.',
    source: 'Definisi umum',
  },
  {
    term: 'MVA',
    short: 'Mega Volt-Ampere',
    def: 'Mega Volt-Ampere — satuan daya semu transformator. Total kapasitas trafo daya UPT Bengkulu 2.475 MVA dari 34 unit.',
    source: 'Data UPT Bengkulu 2026',
  },
  {
    term: 'NS',
    short: 'NEW SRINTAMI',
    def: 'NEW SRINTAMI — sumber data tegakan; data halaman Tegakan ditarik dari sheet “TARIKAN NEW SRINTAMI”.',
    source: 'Data UPT Bengkulu 2026',
  },
];

export function glossaryDef(term: string): GlossaryEntry | undefined {
  return GLOSSARY.find((g) => g.term.toLowerCase() === term.toLowerCase());
}

/** Istilah bergaris titik — arahkan kursor (hover) atau ketuk/klik untuk
    menampilkan definisinya (popover). Popover memakai position: fixed agar
    tidak terpotong oleh kartu yang ber-overflow-hidden (mis. StatCard).
    Catatan: popover yang dibuka lewat hover TIDAK memakai lapisan penangkap
    klik layar penuh — lapisan itu akan menutupi tombolnya sendiri dan membuat
    hover langsung tertutup lagi. Lapisan penangkap klik hanya dipakai saat
    dibuka lewat klik. */
export function Term({ term, children }: { term: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [openBy, setOpenBy] = useState<'hover' | 'click' | null>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number }>({ left: 8 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);
  const entry = glossaryDef(term);
  const openPop = (by: 'hover' | 'click') => {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const w = Math.min(320, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      // Letakkan di bawah tombol; bila tidak muat, letakkan di atasnya.
      if (r.bottom + 8 + 220 <= window.innerHeight) setPos({ top: r.bottom + 8, left });
      else setPos({ bottom: window.innerHeight - r.top + 8, left });
    }
    setOpenBy(by);
    setOpen(true);
  };
  const closePop = () => {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
    setOpen(false);
    setOpenBy(null);
  };
  // Jeda singkat supaya gerakan kursor kecil tidak langsung menutup bubble.
  const scheduleClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => { setOpen(false); setOpenBy(null); }, 200);
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePop(); };
    const onScroll = () => closePop();
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll, true); };
  }, [open ]);
  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); }, []);
  if (!entry) return <>{children ?? term}</>;
  return (
    <span className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        aria-expanded={open}
        aria-label={`Penjelasan istilah ${entry.term}`}
        onMouseEnter={() => openPop('hover')}
        onMouseLeave={() => { if (openBy === 'hover') scheduleClose(); }}
        onClick={(e) => { e.stopPropagation(); if (open) closePop(); else openPop('click'); }}
        style={{ borderBottom: '1px dotted var(--accent)', color: 'inherit', background: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
      >
        {children ?? entry.term}
      </button>
      {open && (
        <>
          {openBy === 'click' && <span className="fixed inset-0 z-40" onClick={() => closePop()} aria-hidden="true" />}
          <span
            className="fixed z-50 w-[320px] max-w-[calc(100vw-16px)] rounded-xl p-3 text-left text-xs leading-relaxed"
            style={{ top: pos.top, bottom: pos.bottom, left: pos.left, background: 'var(--bg2)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow-hover)', color: 'var(--text)', textTransform: 'none', letterSpacing: 'normal' }}
            role="dialog"
            aria-label={`Definisi ${entry.term}`}
          >
            <span className="block font-bold mb-1" style={{ color: 'var(--heading)' }}>{entry.term} — {entry.short}</span>
            <span className="block">{entry.def}</span>
            {entry.source && <span className="block mt-2 t-muted" style={{ fontSize: 10 }}>Sumber: {entry.source}</span>}
          </span>
        </>
      )}
    </span>
  );
}

/** Seksi glosarium lengkap (id="glosarium") untuk halaman Home. */
export function GlossarySection() {
  return (
    <section id="glosarium" aria-label="Glosarium" style={{ scrollMarginTop: 76 }}>
      <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
        <div>
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--heading)' }}>Glosarium bahasa awam</h2>
          <p className="text-xs t-muted mt-1">Istilah yang muncul di dashboard, dijelaskan tanpa jargon. Definisi bersumber dari dokumen resmi — label sumber ada di tiap kartu. Arahkan kursor (atau ketuk) pada istilah bergaris titik di mana pun untuk penjelasannya.</p>
        </div>
      </div>
      {/* flex-wrap + justify-center: baris terakhir yang tidak penuh (1–2 kartu)
          berada di tengah, bukan menyisakan sel kosong di kanan. */}
      <div className="flex flex-wrap justify-center gap-4">
        {GLOSSARY.map((g) => (
          <Card key={g.term} className="flex flex-col w-full sm:w-[calc(50%-8px)] xl:w-[calc(33.333%-10.67px)]">
            <div className="h-section">{g.term}</div>
            <div className="text-xs font-bold mt-0.5" style={{ color: 'var(--accent)' }}>{g.short}</div>
            <p className="text-[13px] leading-relaxed mt-2 flex-1">{g.def}</p>
            {g.source && <div className="text-[10px] t-muted mt-2">Sumber: {g.source}</div>}
          </Card>
        ))}
      </div>
    </section>
  );
}
