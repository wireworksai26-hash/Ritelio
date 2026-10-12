import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { JournalService } from './journal.service';

/**
 * Reversal dijaga di dalam JournalService dengan memuat jurnal asal lebih dulu,
 * jadi guard bisa diuji tanpa database: cukup kontrol apa yang findFirst kembalikan.
 */
function mockTx(journal: Record<string, unknown> | null) {
  const created: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const lines: Record<string, unknown>[] = [];
  const tx = {
    fiscalPeriod: { findFirst: async () => ({ id: 'period-1' }) },
    journalSequence: { createMany: async () => undefined, update: async () => ({ lastNumber: 7 }) },
    journalHeader: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'jurnal-baru', ...data };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return journal;
      },
      findUniqueOrThrow: async () => ({ id: 'jurnal-baru', lines: [] }),
      findFirst: async () => journal,
    },
    journalLine: {
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        lines.push(...data);
      },
    },
  };
  return { tx, created, updates, lines };
}

const base = { tenantId: 't1', companyId: 'c1', entryDate: new Date('2026-03-10') };

describe('JournalService.reverse', () => {
  const posted = {
    id: 'j1',
    number: 'JRN-202603-000001',
    status: 'posted',
    reversalOfId: null,
    lines: [
      { lineNo: 1, accountId: 'a-kas', direction: 'debit', amount: 500_000, memo: 'Kas' },
      { lineNo: 2, accountId: 'a-pendapatan', direction: 'credit', amount: 500_000, memo: 'Pendapatan' },
    ],
    reversedBy: [],
  };

  it('menukar arah debit dan kredit', async () => {
    const { tx, lines } = mockTx(posted);
    await new JournalService({} as never).reverse(tx as never, {
      ...base,
      journalId: 'j1',
      actorId: 'u1',
    });

    const kas = lines.find((l) => l.accountId === 'a-kas');
    const pendapatan = lines.find((l) => l.accountId === 'a-pendapatan');
    expect(kas?.direction).toBe('credit');
    expect(pendapatan?.direction).toBe('debit');
  });

  it('mengaitkan jurnal pembalik ke jurnal asal', async () => {
    const { tx, created } = mockTx(posted);
    await new JournalService({} as never).reverse(tx as never, { ...base, journalId: 'j1' });
    expect(created[0].reversalOfId).toBe('j1');
  });

  it('menandai jurnal asal sebagai voided', async () => {
    const { tx, updates } = mockTx(posted);
    await new JournalService({} as never).reverse(tx as never, { ...base, journalId: 'j1' });
    expect(updates[0].status).toBe('voided');
  });

  it('menolak jurnal yang sudah pernah dibalik', async () => {
    const { tx } = mockTx({ ...posted, reversedBy: [{ id: 'j2', number: 'JRN-202603-000002' }] });
    await expect(
      new JournalService({} as never).reverse(tx as never, { ...base, journalId: 'j1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('menolak pembalikan atas jurnal pembalik', async () => {
    const { tx } = mockTx({ ...posted, reversalOfId: 'j0' });
    await expect(
      new JournalService({} as never).reverse(tx as never, { ...base, journalId: 'j1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('menolak jurnal berstatus draft', async () => {
    const { tx } = mockTx({ ...posted, status: 'draft' });
    await expect(
      new JournalService({} as never).reverse(tx as never, { ...base, journalId: 'j1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});