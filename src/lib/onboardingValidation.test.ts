import { describe, expect, it } from 'vitest';
import { ownerAccountProblem, passwordProblem } from './onboardingValidation';

const ok = {
  businessName: 'Toko Maju',
  ownerName: 'Budi Santoso',
  ownerEmail: 'budi@tokomaju.id',
  ownerPassword: 'Rahasia2026',
};

describe('passwordProblem (sama dengan IsStrongPassword di backend)', () => {
  it('menerima sandi 8+ karakter dengan huruf besar, kecil, dan angka', () => {
    expect(passwordProblem('Rahasia2026')).toBeNull();
    expect(passwordProblem('Abcdef12')).toBeNull();
  });

  it('menolak sandi pendek, tanpa huruf besar, tanpa huruf kecil, atau tanpa angka', () => {
    expect(passwordProblem('Ab1')).toMatch(/minimal 8/);
    for (const weak of ['rahasia2026', 'RAHASIA2026', 'RahasiaSaja']) {
      expect(passwordProblem(weak)).toMatch(/huruf besar, huruf kecil, dan angka/);
    }
  });

  it('menolak sandi lebih dari 72 byte (batas bcrypt), dihitung dalam byte bukan karakter', () => {
    expect(passwordProblem('Aa1' + 'x'.repeat(70))).toMatch(/72 byte/);
    // 30 karakter tetapi 90 byte
    expect(passwordProblem('Aa1' + '€'.repeat(27))).toMatch(/72 byte/);
  });

  it('sandi lama bawaan onboarding (123456) ditolak', () => {
    expect(passwordProblem('123456')).not.toBeNull();
  });
});

describe('ownerAccountProblem', () => {
  it('akun lengkap dan benar lolos', () => {
    expect(ownerAccountProblem(ok)).toBeNull();
  });

  it('menolak nama usaha dan nama owner yang kosong atau terlalu pendek', () => {
    expect(ownerAccountProblem({ ...ok, businessName: ' ' })).toMatch(/Nama usaha/);
    expect(ownerAccountProblem({ ...ok, ownerName: 'A' })).toMatch(/Nama owner/);
  });

  it('menolak email tidak valid (termasuk tanpa TLD, yang juga ditolak backend)', () => {
    for (const bad of ['', 'budi', 'budi@tokomaju', 'budi@', '@tokomaju.id', 'bu di@tokomaju.id']) {
      expect(ownerAccountProblem({ ...ok, ownerEmail: bad })).toMatch(/email/i);
    }
  });

  it('spasi di sekitar email dan nama diabaikan', () => {
    expect(ownerAccountProblem({ ...ok, ownerEmail: '  budi@tokomaju.id  ', ownerName: '  Budi  ' })).toBeNull();
  });
});
