import { isEmail } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  BUSINESSES,
  SUPERADMIN,
  barcodeFor,
  ean13,
  emailLocal,
  ownerEmailOf,
  staffEmailOf,
} from './businesses.data';
import { deriveSeedPassword } from './seed-passwords';

const allEmails = (): string[] => [
  SUPERADMIN.email,
  ...BUSINESSES.flatMap((b) => [ownerEmailOf(b), ...b.staff.map((s) => staffEmailOf(b, s))]),
];

describe('struktur usaha', () => {
  it('tiga usaha dengan tiga lini bisnis yang berbeda', () => {
    expect(BUSINESSES).toHaveLength(3);
    expect(new Set(BUSINESSES.map((b) => b.industry))).toEqual(new Set(['retail', 'manufacturing', 'services']));
    expect(new Set(BUSINESSES.map((b) => b.plan)).size).toBeGreaterThan(1);
  });

  it('kunci, nama, dan domain unik', () => {
    for (const field of ['key', 'businessName', 'domain'] as const) {
      expect(new Set(BUSINESSES.map((b) => b[field])).size).toBe(BUSINESSES.length);
    }
  });

  it('setiap usaha punya admin, manager, kasir, dan staf gudang', () => {
    for (const b of BUSINESSES) {
      expect(b.staff.map((s) => s.role).sort()).toEqual(['admin', 'cashier', 'manager', 'staff']);
    }
  });

  it('paket AI konsisten: kuota hanya untuk paket yang punya AI', () => {
    for (const b of BUSINESSES) {
      if (b.plan === 'basic') expect(b.aiQuota).toBe(0);
      else expect(b.aiQuota).toBeGreaterThan(0);
    }
  });
});

describe('akun', () => {
  it('semua email unik dan valid menurut validator backend, termasuk tanpa spasi', () => {
    const emails = allEmails();
    expect(new Set(emails).size).toBe(emails.length);
    for (const e of emails) {
      expect(isEmail(e), e).toBe(true);
      expect(e).toBe(e.toLowerCase());
    }
  });

  it('email pelanggan dan pemasok juga valid', () => {
    for (const b of BUSINESSES) {
      for (const p of [...b.suppliers, ...b.customers]) expect(isEmail(p.email), `${b.key}: ${p.email}`).toBe(true);
    }
  });

  it('bagian lokal email kontak bersih: tanpa titik di ujung atau ganda, dari nama lengkap', () => {
    expect(emailLocal('Dr. Andini')).toBe('dr.andini');
    expect(emailLocal('Ibu Melati')).toBe('ibu.melati');
    expect(emailLocal('  Budi   Hartono ')).toBe('budi.hartono');
    expect(emailLocal('Rahmat Hidayat')).toBe('rahmat.hidayat');
  });

  it('email pemasok dan pelanggan unik di dalam satu usaha', () => {
    for (const b of BUSINESSES) {
      const emails = [...b.suppliers, ...b.customers].map((p) => p.email);
      expect(new Set(emails).size, `${b.key}: email pihak ganda`).toBe(emails.length);
    }
  });

  it('kata sandi turunan untuk semua akun berbeda satu sama lain', () => {
    const passwords = allEmails().map((e) => deriveSeedPassword('kunci-induk-untuk-tes-ini', e));
    expect(new Set(passwords).size).toBe(passwords.length);
  });
});

describe('barcode', () => {
  it('EAN-13 memiliki digit pemeriksa yang benar (contoh baku 4006381333931)', () => {
    expect(ean13('400638133393')).toBe('4006381333931');
  });

  it('semua barcode produk unik di seluruh usaha dan berformat EAN-13', () => {
    const codes = BUSINESSES.flatMap((b, bi) => b.products.map((_, pi) => barcodeFor(bi + 1, pi + 1)));
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) {
      expect(c).toMatch(/^\d{13}$/);
      expect(ean13(c.slice(0, 12))).toBe(c);
    }
  });

  it('menolak badan EAN yang bukan 12 digit', () => {
    expect(() => ean13('123')).toThrow();
    expect(() => ean13('12345678901a')).toThrow();
  });
});

describe('katalog', () => {
  it('SKU unik per usaha, kategori dan pemasok yang dirujuk ada', () => {
    for (const b of BUSINESSES) {
      const skus = b.products.map((p) => p.sku);
      expect(new Set(skus).size, `${b.key}: SKU ganda`).toBe(skus.length);
      const suppliers = new Set(b.suppliers.map((s) => s.name));
      for (const p of b.products) {
        expect(b.categories, `${b.key}/${p.sku}: kategori`).toContain(p.category);
        if (p.supplier) expect(suppliers.has(p.supplier), `${b.key}/${p.sku}: pemasok ${p.supplier}`).toBe(true);
      }
    }
  });

  it('harga jual dan modal masuk akal (modal > 0 dan tidak melebihi harga jual)', () => {
    for (const b of BUSINESSES) {
      for (const p of b.products) {
        expect(p.sell, `${p.sku}: harga jual`).toBeGreaterThan(0);
        if (p.cost !== undefined) {
          expect(p.cost, `${p.sku}: modal`).toBeGreaterThan(0);
          expect(p.cost, `${p.sku}: modal <= harga jual`).toBeLessThanOrEqual(p.sell);
        }
      }
    }
  });

  it('jasa tidak punya stok, barang berstok punya titik pesan ulang', () => {
    for (const b of BUSINESSES) {
      for (const p of b.products) {
        if (p.kind === 'service') {
          expect(p.stock, `${p.sku}: jasa berstok`).toBeUndefined();
        } else {
          expect(p.stock, `${p.sku}: stok awal`).toBeGreaterThan(0);
          expect(p.reorderPoint, `${p.sku}: titik pesan ulang`).toBeGreaterThan(0);
          expect(p.reorderQty, `${p.sku}: jumlah pesan ulang`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('setiap usaha punya setidaknya satu barang di bawah titik pesan ulang (agar peringatan stok terlihat)', () => {
    for (const b of BUSINESSES) {
      const low = b.products.filter((p) => p.stock !== undefined && p.reorderPoint !== undefined && p.stock < p.reorderPoint);
      expect(low.length, `${b.key}: tidak ada stok menipis`).toBeGreaterThan(0);
      // Tetapi tidak semuanya menipis: sebagian besar harus sehat.
      const stocked = b.products.filter((p) => p.stock !== undefined).length;
      expect(low.length).toBeLessThan(stocked / 2);
    }
  });
});

describe('manufaktur', () => {
  it('BOM merujuk produk jadi dan komponen yang ada, tanpa komponen ganda atau melingkar', () => {
    for (const b of BUSINESSES) {
      const bySku = new Map(b.products.map((p) => [p.sku, p]));
      for (const bom of b.boms ?? []) {
        const finished = bySku.get(bom.product);
        expect(finished, `${b.key}: produk jadi ${bom.product}`).toBeDefined();
        expect(finished?.kind ?? 'goods').toBe('goods');
        expect(bom.outputQty).toBeGreaterThan(0);
        const skus = bom.lines.map((l) => l.sku);
        expect(new Set(skus).size, `${bom.product}: komponen ganda`).toBe(skus.length);
        expect(skus).not.toContain(bom.product);
        for (const l of bom.lines) {
          expect(bySku.has(l.sku), `${bom.product}: komponen ${l.sku}`).toBe(true);
          expect(l.qty).toBeGreaterThan(0);
        }
      }
    }
  });

  it('hanya usaha manufaktur yang punya BOM dan work center; kodenya unik', () => {
    for (const b of BUSINESSES) {
      const hasMfg = (b.boms?.length ?? 0) > 0 || (b.workCenters?.length ?? 0) > 0;
      expect(hasMfg).toBe(b.industry === 'manufacturing');
      const codes = (b.workCenters ?? []).map((w) => w.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it('kebutuhan bahan baku BOM tercukupi stok awal untuk produksi satu putaran', () => {
    for (const b of BUSINESSES) {
      const bySku = new Map(b.products.map((p) => [p.sku, p]));
      for (const bom of b.boms ?? []) {
        for (const l of bom.lines) {
          expect(bySku.get(l.sku)?.stock ?? 0, `${bom.product} butuh ${l.sku}`).toBeGreaterThanOrEqual(l.qty);
        }
      }
    }
  });
});

describe('SDM', () => {
  it('jabatan merujuk departemen yang ada; karyawan merujuk jabatan yang ada; nomor karyawan unik', () => {
    for (const b of BUSINESSES) {
      const depts = new Set(b.departments.map((d) => d.code));
      for (const p of b.positions) expect(depts.has(p.department), `${b.key}/${p.code}`).toBe(true);
      const positions = new Set(b.positions.map((p) => p.code));
      const nos = b.employees.map((e) => e.no);
      expect(new Set(nos).size).toBe(nos.length);
      for (const e of b.employees) {
        expect(positions.has(e.position), `${b.key}/${e.no}`).toBe(true);
        expect(e.hired).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(e.salary).toBeGreaterThan(0);
      }
    }
  });
});
