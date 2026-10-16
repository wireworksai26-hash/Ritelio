import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { isForeignKeyViolation, isTxConflict, isUniqueViolation, retryOnConflict } from './tx-retry';

const known = (code: string) => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'test' });

describe('retryOnConflict', () => {
  it('mengulang transaksi yang dibatalkan Postgres (P2034) lalu mengembalikan hasilnya', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(known('P2034'))
      .mockRejectedValueOnce(known('P2034'))
      .mockResolvedValueOnce('ok');
    await expect(retryOnConflict(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('menyerah dengan 409 yang jelas (bukan 500) setelah percobaan habis', async () => {
    const fn = vi.fn().mockRejectedValue(known('P2034'));
    await expect(retryOnConflict(fn, 3)).rejects.toBeInstanceOf(ConflictException);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('error lain (termasuk 409 bisnis dari klaim yang kalah) dilempar apa adanya tanpa diulang', async () => {
    const business = new ConflictException('sudah diproses');
    const fn = vi.fn().mockRejectedValue(business);
    await expect(retryOnConflict(fn)).rejects.toBe(business);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('penanda error Prisma', () => {
  it('membedakan P2034, P2002, dan P2003', () => {
    expect(isTxConflict(known('P2034'))).toBe(true);
    expect(isTxConflict(known('P2002'))).toBe(false);
    expect(isUniqueViolation(known('P2002'))).toBe(true);
    expect(isForeignKeyViolation(known('P2003'))).toBe(true);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
  });
});
