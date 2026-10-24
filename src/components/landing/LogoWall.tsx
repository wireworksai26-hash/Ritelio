import { Reveal } from '../Reveal';

// Jenis usaha yang dirancang untuk didukung. Bukan daftar pelanggan: ganti dengan logo
// pelanggan sungguhan (dengan izin mereka) bila sudah ada.
export const NAMES = [
  'Toko Retail', 'Kafe & Restoran', 'Bakery', 'Manufaktur Kecil', 'Distributor',
  'Jasa & Proyek', 'Apotek', 'Laundry', 'Bengkel', 'Toko Online',
];

export function LogoWall() {
  return (
    <section id="solusi" className="py-20 lg:py-24 scroll-mt-24">
      <Reveal className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-heading font-light text-ink">
          Dirancang untuk toko, kafe, pabrik kecil, dan bisnis jasa.
        </h2>
      </Reveal>
      <div className="marquee-fade mt-12 overflow-hidden">
        <div className="flex w-max items-center gap-16 animate-marquee-left">
          {[...NAMES, ...NAMES].map((name, i) => (
            <span
              key={`${name}-${i}`}
              className={
                i % 2 === 0
                  ? 'whitespace-nowrap text-2xl font-light text-pebble tracking-tight'
                  : 'whitespace-nowrap text-xl font-normal text-fossil tracking-wide uppercase'
              }
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
