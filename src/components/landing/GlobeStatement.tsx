import { useEffect, useRef } from 'react';
import { gsap } from '../../lib/gsap';
import { Reveal } from '../Reveal';

// Section headline overlay di atas pixel-globe chartreuse dengan animasi scroll GSAP
export function GlobeStatement() {
  const sectionRef = useRef<HTMLElement>(null);
  const globeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sectionEl = sectionRef.current;
    const globeEl = globeRef.current;
    if (!sectionEl || !globeEl || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        globeEl,
        { scale: 0.75, rotate: -15, opacity: 0.6 },
        {
          scale: 1.18,
          rotate: 15,
          opacity: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: sectionEl,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1,
          },
        }
      );
    }, sectionEl);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="relative overflow-hidden py-28 lg:py-40">
      <div
        ref={globeRef}
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] h-[540px] max-w-[88vw] rounded-full bg-chartreuse overflow-hidden shadow-2xl transition-shadow"
      >
        <div className="absolute inset-0 dot-matrix" />
        <div className="absolute inset-0 globe-shade" />
      </div>
      <Reveal className="relative text-center max-w-3xl mx-auto px-6" duration={0.8} y={35}>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-black/10 bg-white/80 backdrop-blur-xs text-[13px] text-[#1c1c1c] font-medium mb-6 shadow-xs">
          Arsitektur Terintegrasi
        </div>
        <h2 className="font-light text-[#1c1c1c] text-[42px] leading-[1.04] tracking-[-2.4px] sm:text-display">
          Satu platform.
          <br />
          Semua operasi.
        </h2>
        <p className="mt-6 text-[17px] sm:text-[19px] text-[#2d2d2d] leading-relaxed max-w-xl mx-auto font-normal">
          POS, inventori, keuangan, dan AI saling terhubung sejak transaksi pertama —
          tidak ada lagi data tersebar di lima spreadsheet.
        </p>
      </Reveal>
    </section>
  );
}
