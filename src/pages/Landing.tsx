// Landing page publik — struktur & ritme editorial Maze style:
// announcement bar → nav → hero kolase → globe statement → tab fitur →
// marquee lime → core values → PRICING → logo wall → trust & security →
// footer CTA → footer.
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { gsap, ScrollTrigger } from '../lib/gsap';
import { Icon } from '../components/icons/Icon';
import { CoreValues } from '../components/landing/CoreValues';
import { FeatureMarquee } from '../components/landing/FeatureMarquee';
import { FeatureTabs } from '../components/landing/FeatureTabs';
import { FooterCTA } from '../components/landing/FooterCTA';
import { GlobeStatement } from '../components/landing/GlobeStatement';
import { Hero } from '../components/landing/Hero';
import { LandingFooter } from '../components/landing/LandingFooter';
import { LandingNav } from '../components/landing/LandingNav';
import { LogoWall } from '../components/landing/LogoWall';
import { Pricing } from '../components/landing/Pricing';
import { TrustSecurity } from '../components/landing/TrustSecurity';
import { Reveal } from '../components/Reveal';

export default function Landing() {
  const [showBar, setShowBar] = useState(true);
  const location = useLocation();
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Scroll Progress Bar dengan GSAP ScrollTrigger & trigger refresh
  useEffect(() => {
    const el = progressBarRef.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      gsap.to(el, {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: document.documentElement,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.15,
        },
      });
    });

    const refreshTimer = setTimeout(() => {
      ScrollTrigger.refresh();
    }, 150);

    return () => {
      clearTimeout(refreshTimer);
      ctx.revert();
    };
  }, []);

  // Dukung navigasi anchor lintas route (mis. /#harga dari Settings)
  useEffect(() => {
    if (!location.hash) return;
    const el = document.querySelector(location.hash);
    if (el) {
      const t = setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 80);
      return () => clearTimeout(t);
    }
  }, [location.hash]);

  return (
    <div className="relative min-h-screen bg-bone">
      {/* GSAP Scroll Progress Bar (Chartreuse Highlighter) */}
      <div className="fixed top-0 left-0 right-0 z-[60] h-[3px] bg-transparent pointer-events-none">
        <div
          ref={progressBarRef}
          className="h-full bg-chartreuse origin-left shadow-sm scale-x-0"
        />
      </div>

      {showBar && (
        <div className="relative bg-charcoal text-paper">
          <p className="px-10 py-2.5 text-center text-body-sm">
            Retalio Intelligence kini tersedia —{' '}
            <a href="#harga" className="underline decoration-chartreuse underline-offset-4 font-medium">
              coba +AI gratis 14 hari
            </a>
          </p>
          <button
            aria-label="Tutup pengumuman"
            onClick={() => setShowBar(false)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-paper/70 hover:text-paper transition-colors"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      <LandingNav />

      <main>
        <Hero />
        <GlobeStatement />

        <section id="fitur" className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 scroll-mt-24">
          <Reveal duration={0.8} y={35}>
            <FeatureTabs />
          </Reveal>
        </section>

        <div className="mt-20 lg:mt-28">
          <FeatureMarquee />
        </div>

        <section id="nilai" className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 mt-20 lg:mt-28 scroll-mt-24">
          <Reveal duration={0.8} y={35}>
            <CoreValues />
          </Reveal>
        </section>

        <section id="harga" className="mt-20 lg:mt-28 scroll-mt-24">
          <Pricing />
        </section>

        <LogoWall />
        <TrustSecurity />
        <FooterCTA />
      </main>

      <LandingFooter />
    </div>
  );
}
