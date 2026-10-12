import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { CreateManualJournalDto } from './dto/journal.dto';
import { JournalService } from './journal.service';

const TENANT = 't1';
const COMPANY = 'c1';

interface TxOptions {
  accounts?: Array<{ id: string; code: string; children?: number }>;
  openPeriod?: boolean;
  suppliers?: string[];
  customers?: string[];
  projects?: string[];
}

function buildTx(opts: TxOptions = {}) {
  const accounts = opts.accounts ?? [
    { id: 'kas', code: '1000' },
    { id: 'modal', code: '3000' },
  ];
  const createMany = vi.fn().mockResolvedValue({ count: 2 });
  const tx = {
    chartOfAccount: {
      findMany: vi.fn().mockImplementation(({ where }) =>
        Promise.resolve(
          accounts
            .filter((a) => where.id.in.includes(a.id))
            .map((a) => ({ id: a.id, code: a.code, _count: { children: a.children ?? 0 } })),
        ),
      ),
    },
    supplier: { findMany: vi.fn().mockResolvedValue((opts.suppliers ?? []).map((id) => ({ id }))) },
    customer: { findMany: vi.fn().mockResolvedValue((opts.customers ?? []).map((id) => ({ id }))) },
    project: { findMany: vi.fn().mockResolvedValue((opts.projects ?? []).map((id) => ({ id }))) },
    fiscalPeriod: { findFirst: vi.fn().mockResolvedValue(opts.openPeriod === false ? null : { id: 'p1' }) },
    journalSequence: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({ lastNumber: 7 }),
    },
    journalHeader: {
      create: vi.fn().mockResolvedValue({ id: 'j1' }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'j1', number: 'JRN-202610-000007', lines: [] }),
    },
    journalLine: { createMany },
  };
  return { tx, createMany };
}

const service = new JournalService({} as never);

function input(lines: Array<Record<string, unknown>>) {
  return {
    tenantId: TENANT,
    companyId: COMPANY,
    entryDate: new Date('2026-10-10'),
    memo: 'Setoran modal',
    actorId: 'u1',
    lines: lines as never,
  };
}

describe('JournalService.postManual', () => {
  it('memposting jurnal seimbang sebagai sumber "manual" lewat jalur post() yang sama', async () => {
    const { tx, createMany } = buildTx();

    await service.postManual(tx as never, input([
      { accountId: 'kas', debit: 1_000_000 },
      { accountId: 'modal', credit: 1_000_000, memo: 'Modal awal' },
    ]));

    expect(tx.journalHeader.create.mock.calls[0][0].data).toMatchObject({
      sourceModule: 'manual',
      status: 'posted',
      number: 'JRN-202610-000007',
      createdById: 'u1',
    });
    const rows = createMany.mock.calls[0][0].data;
    expect(rows.map((r: { direction: string; amount: number }) => [r.direction, r.amount])).toEqual([
      ['debit', 1_000_000],
      ['credit', 1_000_000],
    ]);
  });

  it('menolak jurnal tidak seimbang sebelum menyentuh database', async () => {
    const { tx } = buildTx();

    await expect(
      service.postManual(tx as never, input([
        { accountId: 'kas', debit: 1_000_000 },
        { accountId: 'modal', credit: 900_000 },
      ])),
    ).rejects.toThrow(/debit dan kredit/i);
    expect(tx.journalHeader.create).not.toHaveBeenCalled();
  });

  it('menolak satu baris yang berisi debit sekaligus kredit', async () => {
    const { tx } = buildTx();

    await expect(
      service.postManual(tx as never, input([
        { accountId: 'kas', debit: 500, credit: 500 },
        { accountId: 'modal', credit: 500 },
      ])),
    ).rejects.toThrow(/Baris 1/);
  });

  it('menolak baris tanpa nominal', async () => {
    const { tx } = buildTx();

    await expect(
      service.postManual(tx as never, input([
        { accountId: 'kas', debit: 500 },
        { accountId: 'modal' },
      ])),
    ).rejects.toThrow(/Baris 2/);
  });

  it('menolak jurnal pada periode fiskal yang tertutup', async () => {
    const { tx } = buildTx({ openPeriod: false });

    await expect(
      service.postManual(tx as never, input([
        { accountId: 'kas', debit: 100 },
        { accountId: 'modal', credit: 100 },
      ])),
    ).rejects.toThrow(/periode fiskal yang terbuka/);
    expect(tx.journalHeader.create).not.toHaveBeenCalled();
  });

  it('menolak akun yang tidak ada / milik perusahaan lain', async () => {
    const { tx } = buildTx();

    await expect(
      service.postManual(tx as never, input([
        { accountId: 'kas', debit: 100 },
        { accountId: 'akun-asing', credit: 100 },
      ])),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.journalHeader.create).not.toHaveBeenCalled();
  });

  it('menolak akun induk (punya anak) agar saldo tidak menumpuk di akun grup', async () => {
    const { tx } = buildTx({
      accounts: [
        { id: 'kas', code: '1000', children: 2 },
        { id: 'modal', code: '3000' },
      ],
    });

    await expect(
      service.postManual(tx as never, input([
        { accountId: 'kas', debit: 100 },
        { accountId: 'modal', credit: 100 },
      ])),
    ).rejects.toThrow(/akun induk/);
  });

  it('menyimpan dimensi mitra & proyek, dan menolak yang bukan milik tenant', async () => {
    const ok = buildTx({ suppliers: ['sup-1'], projects: ['prj-1'] });
    await service.postManual(ok.tx as never, input([
      { accountId: 'kas', debit: 100, partnerId: 'sup-1', projectId: 'prj-1' },
      { accountId: 'modal', credit: 100 },
    ]));
    expect(ok.createMany.mock.calls[0][0].data[0]).toMatchObject({ partnerId: 'sup-1', projectId: 'prj-1' });
    expect(ok.createMany.mock.calls[0][0].data[1]).toMatchObject({ partnerId: null, projectId: null });

    const bad = buildTx();
    await expect(
      service.postManual(bad.tx as never, input([
        { accountId: 'kas', debit: 100, partnerId: 'milik-tenant-lain' },
        { accountId: 'modal', credit: 100 },
      ])),
    ).rejects.toThrow(/mitra/);
  });
});

describe('CreateManualJournalDto', () => {
  const valid = {
    entryDate: '2026-10-10',
    memo: 'Koreksi biaya',
    lines: [
      { accountId: 'a', debit: 10 },
      { accountId: 'b', credit: 10 },
    ],
  };

  it('menerima payload valid', async () => {
    expect(await validate(plainToInstance(CreateManualJournalDto, valid))).toHaveLength(0);
  });

  it('menolak kurang dari dua baris dan nominal negatif', async () => {
    const one = plainToInstance(CreateManualJournalDto, { ...valid, lines: [valid.lines[0]] });
    expect((await validate(one)).length).toBeGreaterThan(0);

    const negative = plainToInstance(CreateManualJournalDto, {
      ...valid,
      lines: [{ accountId: 'a', debit: -5 }, valid.lines[1]],
    });
    expect((await validate(negative)).length).toBeGreaterThan(0);
  });
});
