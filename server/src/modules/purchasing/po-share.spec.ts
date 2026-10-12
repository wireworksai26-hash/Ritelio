import { describe, expect, it } from 'vitest';
import { buildPoShare, normalizeWaPhone } from './po-share';

describe('normalizeWaPhone', () => {
  it('menyeragamkan format Indonesia ke 62…', () => {
    expect(normalizeWaPhone('0812-3456-7890')).toBe('6281234567890');
    expect(normalizeWaPhone('+62 812 3456 7890')).toBe('6281234567890');
    expect(normalizeWaPhone('6281234567890')).toBe('6281234567890');
    expect(normalizeWaPhone('81234567890')).toBe('6281234567890');
  });

  it('kosong bila tidak ada digit', () => {
    expect(normalizeWaPhone('')).toBe('');
    expect(normalizeWaPhone(null)).toBe('');
    expect(normalizeWaPhone('n/a')).toBe('');
  });
});

describe('buildPoShare', () => {
  const input = {
    code: 'PO-2026-007',
    companyName: 'Newsem Bakery',
    warehouseName: 'Gudang Pusat',
    supplier: { name: 'CV Tepung Jaya', phone: '0812-3456-7890', email: 'sales@tepung.id' },
    items: [
      { name: 'Tepung Terigu', unit: 'kg', qty: 10, price: 12_000 },
      { name: 'Gula Pasir', unit: 'kg', qty: 5.5, price: 15_000.5 },
    ],
  };

  it('total = jumlah qty x harga, dibulatkan ke sen', () => {
    // 10 x 12.000 = 120.000; 5,5 x 15.000,5 = 82.502,75
    expect(buildPoShare(input).total).toBe(202_502.75);
  });

  it('teks memuat kode PO, tiap item, total, dan gudang tujuan', () => {
    const { text, subject } = buildPoShare(input);
    expect(subject).toContain('PO-2026-007');
    expect(text).toContain('Yth. CV Tepung Jaya');
    expect(text).toContain('1. Tepung Terigu - 10 kg');
    expect(text).toContain('2. Gula Pasir - 5.5 kg');
    expect(text).toContain('Gudang Pusat');
  });

  it('tautan WhatsApp memakai nomor ternormalisasi dan teks ter-encode', () => {
    const { whatsappUrl, text } = buildPoShare(input);
    expect(whatsappUrl.startsWith('https://wa.me/6281234567890?text=')).toBe(true);
    expect(decodeURIComponent(whatsappUrl.split('?text=')[1])).toBe(text);
  });

  it('tanpa nomor/email tautan tetap valid untuk memilih kontak manual', () => {
    const { whatsappUrl, mailtoUrl } = buildPoShare({
      ...input,
      supplier: { name: 'X', phone: null, email: null },
    });
    expect(whatsappUrl.startsWith('https://wa.me/?text=')).toBe(true);
    expect(mailtoUrl.startsWith('mailto:?subject=')).toBe(true);
  });
});
