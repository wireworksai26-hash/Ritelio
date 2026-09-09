// Wrapper animasi scroll — otomatis adaptif: instan & super ringan di HP / liteMode, halus di desktop
import { useEffect, useRef, type ReactNode } from 'react';
import { gsap } from '../lib/gsap';
import { useThemeStore } from '../stores/themeStore';

export type RevealVariant = 'fade-up' | 'fade-down' | 'fade-left' | 'fade-right' | 'scale';

export interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  y?: number;
  x?: number;
  variant?: RevealVariant;
  stagger?: number;
  once?: boolean;
  start?: string;
}

export function Reveal({
  children,
  className,
  delay = 0,
  duration = 0.4,
  y = 20,
  x = 0,
  variant = 'fade-up',
  stagger,
  once = true,
  start = 'top 88%',
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const liteMode = useThemeStore((s) => s.liteMode);

  useEffect(() => {
    // Jika liteMode aktif atau layar HP atau prefers-reduced-motion, jangan pasang observer GSAP berat
    if (liteMode || window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.innerWidth < 768) {
      return;
    }

    const el = ref.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      let fromVars: gsap.TweenVars = { opacity: 0 };
      const toVars: gsap.TweenVars = {
        opacity: 1,
        duration: Math.min(0.5, duration),
        delay,
        ease: 'power2.out',
      };

      switch (variant) {
        case 'fade-up':
          fromVars = { opacity: 0, y };
          toVars.y = 0;
          break;
        case 'fade-down':
          fromVars = { opacity: 0, y: -y };
          toVars.y = 0;
          break;
        case 'fade-left':
          fromVars = { opacity: 0, x: y || x || 35 };
          toVars.x = 0;
          break;
        case 'fade-right':
          fromVars = { opacity: 0, x: -(y || x || 35) };
          toVars.x = 0;
          break;
        case 'scale':
          fromVars = { opacity: 0, scale: 0.92 };
          toVars.scale = 1;
          break;
      }

      if (stagger && el.children.length > 0) {
        // Animasikan anak elemen secara berurutan (cascade) saat masuk viewport scroll
        toVars.stagger = stagger;
        toVars.scrollTrigger = {
          trigger: el,
          start,
          once,
        };
        gsap.fromTo(el.children, fromVars, toVars);
      } else {
        toVars.scrollTrigger = {
          trigger: el,
          start,
          once,
        };
        gsap.fromTo(el, fromVars, toVars);
      }
    }, ref);

    return () => ctx.revert();
  }, [delay, duration, y, x, variant, stagger, once, start]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
