import { Reveal } from '../Reveal';

// Logo wall bergaya marquee (placeholder wordmark teks, monokrom fossil)
const NAMES = [
  'Kopi Kelana', 'Batik Laras', 'Sahabat Laundry', 'Toko Berkah', 'Roti Nona',
  'Bengkel Maju', 'Apotek Sehat', 'Kedai Senja', 'Florist Aroma', 'Gadget Hub',
];

export function LogoWall() {
  return (
    <section className="py-20 lg:py-24">
      <Reveal className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-heading font-light text-ink">
          Dari toko tunggal sampai multi-cabang, bisnis berjalan di Retalio.
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
