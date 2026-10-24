import type { IconName } from '../components/icons/Icon';
import type { IndustryTemplate } from '../types';

// Template industri yang ditawarkan saat pendaftaran. Satu sumber untuk langkah pendaftaran dan halaman Template.
// `examples` mengacu pada jenis usaha di bagian "Dirancang untuk" halaman depan.
export interface IndustryTemplateInfo {
  key: IndustryTemplate;
  icon: IconName;
  title: string;
  desc: string;
  examples: string[];
}

export const INDUSTRY_TEMPLATES: IndustryTemplateInfo[] = [
  { key: 'retail', icon: 'store', title: 'Retail', desc: 'Inventori + POS + Keuangan', examples: ['Toko Retail', 'Kafe & Restoran', 'Bakery', 'Distributor', 'Apotek', 'Toko Online'] },
  { key: 'manufacturing', icon: 'layers', title: 'Manufaktur', desc: 'Inventori + Produksi + Keuangan', examples: ['Manufaktur Kecil'] },
  { key: 'services', icon: 'calendar', title: 'Jasa', desc: 'Booking + POS + Keuangan', examples: ['Jasa & Proyek', 'Laundry', 'Bengkel'] },
];
