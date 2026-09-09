import { toast } from '../../stores/toastStore';
import { Reveal } from '../Reveal';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

const ITEMS = [
  {
    eyebrow: 'ENKRIPSI',
    body: 'Seluruh trafik terenkripsi via TLS 1.2+ dan data tersimpan aman dengan AES-256 at-rest.',
  },
  {
    eyebrow: 'KONTROL AKSES',
    body: 'RBAC granular per peran — kasir hanya melihat POS, owner melihat semuanya. 2FA untuk admin & owner.',
  },
  {
    eyebrow: 'ISOLASI TENANT',
    body: 'Data tiap bisnis terisolasi ketat dengan Row-Level Security di level database.',
  },
  {
    eyebrow: 'AUDIT TRAIL',
    body: 'Setiap perubahan tercatat lengkap (before/after) — jejak audit siap saat kamu butuh.',
  },
  {
    eyebrow: 'BACKUP HARIAN',
    body: 'Backup otomatis tiap hari dengan RPO ≤ 24 jam dan pemulihan RTO ≤ 4 jam.',
  },
  {
    eyebrow: 'KEPATUHAN LOKAL',
    body: 'Dirancang sesuai UU PDP dan mendukung kebutuhan pajak Indonesia (e-Faktur).',
  },
];

// Trust & security — 6 card di atas wash chartreuse bermotif dot (mirror maze.co card_grid)
export function TrustSecurity() {
  return (
    <section id="keamanan" className="relative overflow-hidden bg-chartreuse py-20 lg:py-24">
      <div aria-hidden="true" className="absolute inset-0 dot-matrix opacity-40" />
      <div className="relative mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center" duration={0.8} y={30}>
          <h2 className="text-heading-lg font-light text-[#1c1c1c]">Keamanan di setiap level.</h2>
          <div className="mt-6">
            <Button
              className="bg-[#1c1c1c] text-[#ffffff] hover:bg-black"
              onClick={() =>
                toast({ title: 'Tim kami akan menghubungimu', description: 'Atau email ke sales@retalio.id', icon: 'mail' })
              }
            >
              Hubungi Sales
            </Button>
          </div>
        </Reveal>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ITEMS.map((item, i) => (
            <Reveal key={item.eyebrow} delay={i * 0.04}>
              <Card className="p-6 h-full">
                <p className="flex items-center gap-2 text-caption text-fossil">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-olive" />
                  {item.eyebrow}
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-ink">{item.body}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
