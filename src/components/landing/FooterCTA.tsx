import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from '../../lib/gsap';
import { toast } from '../../stores/toastStore';
import { Reveal } from '../Reveal';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../icons/Icon';

const FLOATERS: Array<{ icon: IconName; depth: number; className: string }> = [
  { icon: 'pos', depth: 1.4, className: 'left-[8%] top-[16%]' },
  { icon: 'inventory', depth: 0.8, className: 'right-[10%] top-[22%]' },
  { icon: 'assistant', depth: 1.8, className: 'left-[16%] bottom-[18%]' },
  { icon: 'chart', depth: 1.1, className: 'right-[16%] bottom-[24%]' },
  { icon: 'scan', depth: 2.2, className: 'left-[42%] top-[8%]' },
];

export function FooterCTA() {
  const ref = useRef<HTMLElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      const chips = Array.from(el.querySelectorAll<HTMLElement>('[data-depth]'));

      // 1. Scroll-driven parallax scrub
      chips.forEach((chip) => {
        const depth = parseFloat(chip.dataset.depth || '1');
        gsap.to(chip, {
          y: -40 * depth,
          ease: 'none',
          scrollTrigger: {
            trigger: el,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1,
          },
        });
      });

      // 2. Mousemove quickTo response
      const setters = chips.map((chip) => ({
        depth: parseFloat(chip.dataset.depth || '1'),
        x: gsap.quickTo(chip, 'x', { duration: 0.7, ease: 'power2.out' }),
        y: gsap.quickTo(chip, 'y', { duration: 0.7, ease: 'power2.out' }),
      }));

      const onMove = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        setters.forEach((s) => {
          s.x(dx * 36 * s.depth);
          s.y(dy * 26 * s.depth);
        });
      };

      el.addEventListener('mousemove', onMove);
      return () => el.removeEventListener('mousemove', onMove);
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={ref} className="relative overflow-hidden py-28 lg:py-36">
      {FLOATERS.map((f) => (
        <span
          key={f.icon}
          data-depth={f.depth}
          aria-hidden="true"
          className={`absolute hidden lg:inline-flex h-14 w-14 items-center justify-center rounded-full border border-ash/70 bg-paper shadow-sm text-ink ${f.className}`}
        >
          <Icon name={f.icon} size={22} />
        </span>
      ))}
      <Reveal className="relative mx-auto max-w-4xl px-6 text-center" duration={0.8} y={35}>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-ash bg-paper/80 text-[13px] text-fossil mb-6">
          <span className="h-2 w-2 rounded-full bg-chartreuse animate-pulse" />
          Mulai Hari Ini
        </div>
        <h2 className="font-light text-ink text-[48px] sm:text-[64px] leading-[1.02] tracking-[-2.4px] sm:tracking-[-3.5px] lg:text-display-lg">
          Tumbuh bersama
          <br />
          bisnismu.
        </h2>
        <p className="mt-6 text-[17px] sm:text-[19px] text-fossil max-w-lg mx-auto">
          Dari transaksi pertama sampai cabang kesepuluh — mulai gratis, upgrade saat siap.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button size="lg" iconRight="arrow-right" onClick={() => navigate('/onboarding')}>
            Coba Gratis Sekarang
          </Button>
          <Button
            size="lg"
            variant="ghost"
            onClick={() => navigate('/login')}
          >
            Masuk ke Akun
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
