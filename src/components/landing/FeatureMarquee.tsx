import { useEffect, useRef } from 'react';
import { gsap } from '../../lib/gsap';
import { Icon } from '../icons/Icon';
import { Reveal } from '../Reveal';

const ROW_1 = [
  'Buku Besar', 'Piutang & Utang', 'Rekonsiliasi Bank', 'Aset Tetap', 'PPN Otomatis',
  'Laba Rugi & Neraca', 'Periode Fiskal', 'Multi-mata Uang', 'Jejak Audit', 'Persetujuan Dokumen',
];

const ROW_2 = [
  'POS Offline', 'Scan Barcode', 'Reorder Otomatis', 'Purchase Order', 'BOM & MRP',
  'Kontrol Mutu', 'Absensi & Cuti', 'Payroll PPh 21', 'Lead & Penawaran', 'Armada & Pengiriman',
  'Proyek & Gantt', 'Sensor IoT', 'OCR Invoice', 'Tanya AI', 'PWA di HP',
];

function ChipRow({ items, reverse, className }: { items: string[]; reverse?: boolean; className?: string }) {
  return (
    <div className={`marquee-fade overflow-hidden ${className || ''}`}>
      <div className={`flex w-max gap-3 ${reverse ? 'animate-marquee-right' : 'animate-marquee-left'}`}>
        {[...items, ...items].map((chip, i) => (
          <span
            key={`${chip}-${i}`}
            className="whitespace-nowrap rounded-lg bg-[#1c1c1c] px-4 py-2.5 text-[15px] text-[#f5f4f0] font-normal shadow-xs transition-transform hover:scale-105"
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}

// Full-bleed chartreuse + marquee chip fitur dengan scroll velocity scrub
export function FeatureMarquee() {
  const sectionRef = useRef<HTMLElement>(null);
  const row1Ref = useRef<HTMLDivElement>(null);
  const row2Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sec = sectionRef.current;
    const r1 = row1Ref.current;
    const r2 = row2Ref.current;
    if (!sec || !r1 || !r2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      gsap.to(r1, {
        x: -80,
        ease: 'none',
        scrollTrigger: {
          trigger: sec,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 0.6,
        },
      });

      gsap.to(r2, {
        x: 80,
        ease: 'none',
        scrollTrigger: {
          trigger: sec,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 0.6,
        },
      });
    }, sec);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="bg-chartreuse py-20 lg:py-24 overflow-hidden">
      <Reveal className="mx-auto max-w-3xl px-6 text-center" duration={0.8} y={30}>
        <h2 className="text-[30px] sm:text-heading-lg font-light text-[#1c1c1c]">Satu transaksi, semua modul ikut bergerak.</h2>
        <p className="mt-4 text-[16px] sm:text-[19px] text-[#2d2d2d] leading-relaxed max-w-2xl mx-auto font-normal">
          Penjualan mengurangi stok, stok yang menipis menyusun draf pembelian,
          dan setiap pergerakan uang berakhir di jurnal yang sama.
        </p>
      </Reveal>
      <div className="mt-12 space-y-3">
        <div ref={row1Ref}><ChipRow items={ROW_1} /></div>
        <div ref={row2Ref}><ChipRow items={ROW_2} reverse /></div>
      </div>
      <div className="mt-10 text-center">
        <a href="#modul" className="group inline-flex items-center gap-2 text-[15px] font-medium text-[#1c1c1c]">
          <span className="underline decoration-[#4b5b0a] underline-offset-4">Lihat semua modul</span>
          <Icon name="arrow-right" size={15} className="transition-transform duration-150 group-hover:translate-x-0.5" />
        </a>
      </div>
    </section>
  );
}
