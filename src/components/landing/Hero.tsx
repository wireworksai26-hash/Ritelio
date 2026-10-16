import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap, ScrollTrigger } from '../../lib/gsap';
import { toast } from '../../stores/toastStore';
import { Reveal } from '../Reveal';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Icon } from '../icons/Icon';

// Kolase mini UI (menggantikan kolase produk maze.co) — dibangun dari komponen sistem
function PosMini() {
  return (
    <Card className="p-4">
      <p className="text-caption text-fossil">Kasir · Kemang</p>
      <div className="mt-2.5 space-y-1.5 text-body-sm">
        <div className="flex justify-between"><span className="text-ink">2× Kopi Susu</span><span className="tnum text-fossil">44rb</span></div>
        <div className="flex justify-between"><span className="text-ink">1× Croissant</span><span className="tnum text-fossil">25rb</span></div>
      </div>
      <div className="mt-3 rounded-lg bg-ink text-paper text-caption text-center py-2">Bayar Rp 69.000</div>
    </Card>
  );
}

function ReportMini() {
  return (
    <Card className="overflow-hidden">
      <div className="bg-chartreuse px-3.5 py-3">
        <p className="text-caption text-[#1c1c1c]">Laporan</p>
        <p className="text-[15px] text-[#1c1c1c] leading-tight font-medium">Laba Rugi Oktober</p>
      </div>
      <div className="p-3.5 flex items-end gap-1 h-16">
        {[45, 70, 52, 88, 62, 95].map((h, i) => (
          <div key={i} className={`flex-1 rounded-t-sm ${i === 5 ? 'bg-chartreuse' : 'bg-ink'}`} style={{ height: `${h}%` }} />
        ))}
      </div>
    </Card>
  );
}

function AiChatMini() {
  return (
    <Card className="p-3.5">
      <div className="rounded-lg bg-smoke px-3 py-2 inline-flex items-center gap-2 text-paper/70 text-caption">
        <span className="flex gap-1" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="thinking-dot inline-block h-1 w-1 rounded-full bg-paper/70" />
          ))}
        </span>
        Thinking…
      </div>
      <div className="mt-2 rounded-lg border border-ash bg-bone p-3">
        <Badge variant="accent" icon="assistant">AI</Badge>
        <p className="text-caption text-ink mt-1.5">Penjualan hari ini Rp 412.000, naik 12% dari rata-rata mingguan.</p>
      </div>
    </Card>
  );
}

function ApprovalMini() {
  return (
    <Card className="p-3.5">
      <Badge variant="accent">Menunggu persetujuan</Badge>
      <p className="text-body-sm text-ink mt-2">PO-2026-00042</p>
      <p className="text-caption text-fossil">CV Dairy Fresh · Rp 3.200.000</p>
      <div className="mt-2.5 rounded-lg bg-ink text-paper text-caption text-center py-1.5">Setujui</div>
    </Card>
  );
}

function StatMini() {
  return (
    <Card className="p-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-caption text-fossil">Laba Bersih 30 Hari</p>
        <p className="tnum text-heading-sm font-light text-ink mt-1">Rp 14,2 jt</p>
      </div>
      <Badge variant="outline" icon="trending-up">+8%</Badge>
    </Card>
  );
}

export function Hero() {
  const navigate = useNavigate();
  const heroRef = useRef<HTMLElement>(null);
  const collageRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const heroEl = heroRef.current;
    const collageEl = collageRef.current;
    const textEl = textRef.current;
    if (!heroEl || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      // 1. Parallax scrub pada floating cards
      if (collageEl) {
        const floatUp = collageEl.querySelectorAll('.hero-float-up');
        const floatDown = collageEl.querySelectorAll('.hero-float-down');

        gsap.to(floatUp, {
          y: -120,
          rotate: -3.5,
          ease: 'none',
          scrollTrigger: {
            trigger: heroEl,
            start: 'top top',
            end: 'bottom top',
            scrub: 0.4,
          },
        });

        gsap.to(floatDown, {
          y: 110,
          rotate: 3.5,
          ease: 'none',
          scrollTrigger: {
            trigger: heroEl,
            start: 'top top',
            end: 'bottom top',
            scrub: 0.4,
          },
        });
      }

      // 2. Parallax drift halus pada text hero saat scroll ke bawah
      if (textEl) {
        gsap.to(textEl, {
          y: 60,
          opacity: 0.75,
          ease: 'none',
          scrollTrigger: {
            trigger: heroEl,
            start: 'top top',
            end: 'bottom top',
            scrub: 0.4,
          },
        });
      }
    }, heroEl);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={heroRef} className="relative mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 pt-12 lg:pt-20 pb-16">
      <div className="grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
        <div ref={textRef}>
          <Reveal duration={0.8} y={30}>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-ash bg-paper/80 text-[13px] text-fossil mb-6">
                <span className="h-2 w-2 rounded-full bg-chartreuse animate-pulse" />
                ERP untuk UKM, bisa dipakai dari HP
              </div>
              <h1 className="font-light text-ink text-[36px] sm:text-[50px] leading-[1.03] tracking-[-1.8px] sm:tracking-[-2.8px] lg:text-display-lg">
                Jalankan seluruh bisnismu dari satu aplikasi.
              </h1>
              <p className="mt-5 sm:mt-6 text-[16px] sm:text-[18px] text-fossil max-w-md leading-relaxed">
                Retalio menyatukan kasir, stok, pembelian, produksi, penggajian, dan pembukuan. Penjualan,
                penerimaan barang, dan gaji langsung tercatat sebagai jurnal, jadi laporan keuangan tidak perlu
                direkap manual.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" iconRight="arrow-right" onClick={() => navigate('/onboarding')}>
                  Coba Gratis 14 Hari
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  onClick={() => navigate('/login')}
                >
                  Masuk ke Akun
                </Button>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-caption text-fossil">
                <span className="inline-flex items-center gap-1.5"><Icon name="check" size={14} className="text-olive" />Tanpa kartu kredit</span>
                <span className="inline-flex items-center gap-1.5"><Icon name="check" size={14} className="text-olive" />Onboarding &lt; 30 menit</span>
                <span className="inline-flex items-center gap-1.5"><Icon name="check" size={14} className="text-olive" />Batal kapan saja</span>
              </div>
            </div>
          </Reveal>
        </div>

        <div ref={collageRef} className="relative">
          <Reveal delay={0.15} duration={0.85} stagger={0.08}>
            <div className="grid grid-cols-2 gap-3 sm:gap-4.5">
              <div className="hero-float-up transition-transform duration-300 hover:scale-[1.02]"><PosMini /></div>
              <div className="hero-float-down translate-y-3 sm:translate-y-6 transition-transform duration-300 hover:scale-[1.02]"><ReportMini /></div>
              <div className="hero-float-up transition-transform duration-300 hover:scale-[1.02]"><AiChatMini /></div>
              <div className="hero-float-down translate-y-3 sm:translate-y-6 transition-transform duration-300 hover:scale-[1.02]"><ApprovalMini /></div>
              <div className="col-span-2 hero-float-up transition-transform duration-300 hover:scale-[1.01]"><StatMini /></div>
            </div>
          </Reveal>
        </div>
      </div>

      <div className="mt-16 flex justify-center">
        <a
          href="#fitur"
          className="inline-flex items-center gap-2 rounded-full border border-ash bg-paper/80 backdrop-blur-xs px-4 py-2 text-body-sm text-ink hover:border-pebble hover:bg-sand/40 transition-all shadow-xs"
        >
          Scroll untuk jelajahi
          <Icon name="chevron-down" size={14} className="cue-bounce text-fossil" />
        </a>
      </div>
    </section>
  );
}
