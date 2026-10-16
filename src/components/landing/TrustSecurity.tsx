import { toast } from '../../stores/toastStore';
import { Reveal } from '../Reveal';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

const ITEMS = [
  {
    eyebrow: 'AKSES PER PERAN',
    body: 'Hak akses dijaga di server per peran dan per izin. Kasir tidak bisa membuka keuangan, walau mengetik alamatnya langsung.',
  },
  {
    eyebrow: 'LOGIN & SESI',
    body: 'Kata sandi disimpan sebagai hash. Token akses berumur pendek, token refresh dirotasi dan bisa dicabut, dan 2FA tersedia untuk akunmu.',
  },
  {
    eyebrow: 'DATA TERPISAH',
    body: 'Setiap permintaan dibatasi ke bisnis pemilik akun. Perusahaan yang kamu pilih juga diperiksa kepemilikannya di server.',
  },
  {
    eyebrow: 'JEJAK AUDIT',
    body: 'Perubahan data tercatat lengkap: siapa, kapan, dan nilai sebelum serta sesudahnya. Kejadian login juga ikut tercatat.',
  },
  {
    eyebrow: 'PERIODE TERKUNCI',
    body: 'Periode yang sudah ditutup tidak menerima jurnal baru. Kesalahan dikoreksi dengan jurnal pembalik, bukan dengan menghapus.',
  },
  {
    eyebrow: 'PAJAK SEBAGAI DATA',
    body: 'PPN dihitung otomatis dari aturan tarif beserta riwayat versinya. Tarif PPh 21 diberi label resmi atau estimasi. Pelaporan ke DJP tetap kamu lakukan sendiri.',
  },
];

// Keamanan: 6 kartu di atas wash chartreuse bermotif dot. Setiap klaim harus bisa dibuktikan dari kode.
export function TrustSecurity() {
  return (
    <section id="keamanan" className="relative overflow-hidden bg-chartreuse py-20 lg:py-24">
      <div aria-hidden="true" className="absolute inset-0 dot-matrix opacity-40" />
      <div className="relative mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center" duration={0.8} y={30}>
          <h2 className="text-[30px] sm:text-heading-lg font-light text-[#1c1c1c]">Keamanan dan jejak audit.</h2>
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
