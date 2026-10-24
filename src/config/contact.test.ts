import { describe, expect, it } from 'vitest';
import { buildMailtoUrl, buildWhatsAppUrl, normalizeFormUrl, normalizeWhatsAppNumber } from './contact';

describe('normalizeWhatsAppNumber', () => {
  it('nomor lokal berawalan 0 diubah ke kode negara 62', () => {
    expect(normalizeWhatsAppNumber('0812-3456-7890')).toBe('6281234567890');
    expect(normalizeWhatsAppNumber('0812 3456 7890')).toBe('6281234567890');
  });

  it('format +62 dan 62 dibiarkan, tanda baca dibuang', () => {
    expect(normalizeWhatsAppNumber('+62 812-3456-7890')).toBe('6281234567890');
    expect(normalizeWhatsAppNumber('6281234567890')).toBe('6281234567890');
  });

  it('nomor tanpa 0 di depan (812...) dianggap nomor Indonesia', () => {
    expect(normalizeWhatsAppNumber('81234567890')).toBe('6281234567890');
  });

  it('nomor negara lain dipakai apa adanya', () => {
    expect(normalizeWhatsAppNumber('+65 9123 4567')).toBe('6591234567');
  });

  it('kosong, terlalu pendek, atau melebihi 15 digit: tidak valid (null)', () => {
    expect(normalizeWhatsAppNumber('')).toBeNull();
    expect(normalizeWhatsAppNumber('   ')).toBeNull();
    expect(normalizeWhatsAppNumber('0812')).toBeNull();
    expect(normalizeWhatsAppNumber('1234567890123456')).toBeNull();
    expect(normalizeWhatsAppNumber('abc')).toBeNull();
  });
});

describe('buildWhatsAppUrl', () => {
  it('membuat tautan wa.me dengan pesan yang di-encode', () => {
    expect(buildWhatsAppUrl('0812-3456-7890', 'Halo Tim Retalio, saya mau konsultasi')).toBe(
      'https://wa.me/6281234567890?text=Halo%20Tim%20Retalio%2C%20saya%20mau%20konsultasi',
    );
  });

  it('tanpa pesan tidak menambah parameter', () => {
    expect(buildWhatsAppUrl('0812-3456-7890')).toBe('https://wa.me/6281234567890');
  });

  it('nomor tidak valid atau kosong menghasilkan null (tombol tidak ditampilkan)', () => {
    expect(buildWhatsAppUrl('', 'x')).toBeNull();
    expect(buildWhatsAppUrl('12', 'x')).toBeNull();
  });
});

describe('buildMailtoUrl', () => {
  it('menyertakan subjek dan isi yang di-encode', () => {
    expect(buildMailtoUrl('sales@contoh.id', 'Konsultasi Paket Custom', 'Halo, saya tertarik')).toBe(
      'mailto:sales@contoh.id?subject=Konsultasi%20Paket%20Custom&body=Halo%2C%20saya%20tertarik',
    );
  });

  it('tanpa subjek dan isi hanya alamatnya', () => {
    expect(buildMailtoUrl('sales@contoh.id')).toBe('mailto:sales@contoh.id');
  });
});

describe('normalizeFormUrl', () => {
  it('menerima tautan https (termasuk Google Form) dan merapikan spasi', () => {
    expect(normalizeFormUrl('  https://docs.google.com/forms/d/e/ABC/viewform ')).toBe('https://docs.google.com/forms/d/e/ABC/viewform');
  });

  it('menolak http, skema berbahaya, teks biasa, dan kosong', () => {
    for (const bad of ['http://docs.google.com/forms/x', 'javascript:alert(1)', 'data:text/html,x', 'docs.google.com/forms', 'bukan url', '', '   ', undefined]) {
      expect(normalizeFormUrl(bad)).toBeNull();
    }
  });
});
