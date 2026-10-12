import { roundMoney } from '../../common/utils/money';

export interface PoShareInput {
  code: string;
  companyName: string;
  warehouseName: string;
  supplier: { name: string; phone?: string | null; email?: string | null };
  items: Array<{ name: string; unit?: string | null; qty: number; price: number }>;
}

export interface PoShare {
  subject: string;
  text: string;
  whatsappUrl: string;
  mailtoUrl: string;
  total: number;
}

const rupiah = (n: number) => `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n)}`;

/**
 * Nomor WhatsApp format Indonesia → digit internasional tanpa plus.
 * "0812-3456-7890" dan "+62 812 3456 7890" sama-sama jadi "6281234567890".
 * Kosong bila tidak ada digit; tautan lalu jatuh ke pemilihan kontak manual.
 */
export function normalizeWaPhone(raw?: string | null): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

/**
 * Susun teks PO siap-bagikan. Tidak ada pengiriman dari server: tanpa kredensial
 * WhatsApp/email, yang bisa dijamin hanyalah pesan dan tautan yang dibuka
 * pengguna sendiri, jadi dokumen tidak pernah "terkirim" tanpa tindakan manusia.
 */
export function buildPoShare(input: PoShareInput): PoShare {
  const total = roundMoney(input.items.reduce((s, i) => s + i.qty * i.price, 0));
  const lines = input.items.map((i, idx) => {
    const unit = i.unit ? ` ${i.unit}` : '';
    return `${idx + 1}. ${i.name} - ${i.qty}${unit} x ${rupiah(i.price)} = ${rupiah(roundMoney(i.qty * i.price))}`;
  });

  const subject = `Pesanan Pembelian ${input.code} - ${input.companyName}`;
  const text = [
    `Yth. ${input.supplier.name},`,
    '',
    `Berikut pesanan pembelian ${input.code} dari ${input.companyName}:`,
    ...lines,
    '',
    `Total: ${rupiah(total)}`,
    `Dikirim ke: ${input.warehouseName}`,
    '',
    'Mohon konfirmasi ketersediaan barang dan jadwal pengiriman. Terima kasih.',
  ].join('\n');

  const phone = normalizeWaPhone(input.supplier.phone);
  const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  const mailtoUrl = `mailto:${input.supplier.email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;

  return { subject, text, whatsappUrl, mailtoUrl, total };
}
