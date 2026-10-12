import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { roundMoney } from '../../common/utils/money';
import type { JournalService } from '../accounting/journal.service';
import type { JournalLineInput } from '../accounting/journal-validation';

export const INVENTORY_ACCOUNT_CODE = '1100';

export interface AccountSpec {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
}

/** Lawan jurnal untuk selisih persediaan (opname, penyesuaian manual). */
export const INVENTORY_VARIANCE_ACCOUNT: AccountSpec = {
  code: '6500',
  name: 'Selisih Persediaan',
  type: 'expense',
};

/** Lawan jurnal untuk stok awal produk baru. */
export const OPENING_EQUITY_ACCOUNT: AccountSpec = {
  code: '3000',
  name: 'Modal Awal',
  type: 'equity',
};

/**
 * Nilai selisih = qty selisih x biaya moving-average, dibulatkan ke sen.
 * Bertanda: positif = persediaan bertambah (laba selisih), negatif = berkurang.
 */
export function valueOfAdjustment(deltaQty: number, unitCost: number): number {
  if (!Number.isFinite(deltaQty) || !Number.isFinite(unitCost)) return 0;
  return roundMoney(deltaQty * unitCost);
}

/**
 * Baris jurnal untuk kumpulan selisih:
 *  - gain  : Dr Persediaan / Cr Selisih
 *  - loss  : Dr Selisih   / Cr Persediaan
 * Gain dan loss dipisah (tidak dinetto) supaya jejak audit per arah terlihat.
 */
export function buildAdjustmentLines(params: {
  gain: number;
  loss: number;
  inventoryAccountId: string;
  counterAccountId: string;
  memo: string;
}): JournalLineInput[] {
  const gain = roundMoney(params.gain);
  const loss = roundMoney(params.loss);
  const lines: JournalLineInput[] = [];
  if (gain > 0) {
    lines.push(
      { accountId: params.inventoryAccountId, direction: 'debit', amount: gain, memo: `${params.memo} (lebih)` },
      { accountId: params.counterAccountId, direction: 'credit', amount: gain, memo: `${params.memo} (lebih)` },
    );
  }
  if (loss > 0) {
    lines.push(
      { accountId: params.counterAccountId, direction: 'debit', amount: loss, memo: `${params.memo} (kurang)` },
      { accountId: params.inventoryAccountId, direction: 'credit', amount: loss, memo: `${params.memo} (kurang)` },
    );
  }
  return lines;
}

/** Cari akun menurut kode; buat bila belum ada (COA seed lama tidak punya akun selisih). */
export async function ensureAccount(
  tx: Prisma.TransactionClient,
  tenantId: string,
  companyId: string,
  spec: AccountSpec,
): Promise<{ id: string; code: string }> {
  const found = await tx.chartOfAccount.findFirst({
    where: { tenantId, companyId, code: spec.code },
    select: { id: true, code: true },
  });
  if (found) return found;
  // createMany + skipDuplicates: tidak merusak transaksi bila dua request membuat bersamaan.
  await tx.chartOfAccount.createMany({
    data: [{ tenantId, companyId, code: spec.code, name: spec.name, type: spec.type }],
    skipDuplicates: true,
  });
  return tx.chartOfAccount.findFirstOrThrow({
    where: { tenantId, companyId, code: spec.code },
    select: { id: true, code: true },
  });
}

/**
 * Jurnalkan perubahan nilai persediaan di DALAM transaksi pemanggil.
 * Mengembalikan null bila tidak ada nilai yang berubah. Period lock dijaga
 * JournalService.post: bila periode tertutup, error melempar dan seluruh
 * transaksi (termasuk perubahan stok) dibatalkan.
 */
export async function postInventoryValueJournal(
  tx: Prisma.TransactionClient,
  journals: Pick<JournalService, 'post'>,
  params: {
    tenantId: string;
    companyId: string;
    sourceModule: string;
    sourceRefId: string;
    memo: string;
    gain: number;
    loss: number;
    counter?: AccountSpec;
    actorId?: string;
    entryDate?: Date;
  },
) {
  const gain = roundMoney(params.gain);
  const loss = roundMoney(params.loss);
  if (gain <= 0 && loss <= 0) return null;

  const inventory = await tx.chartOfAccount.findFirst({
    where: { tenantId: params.tenantId, companyId: params.companyId, code: INVENTORY_ACCOUNT_CODE },
    select: { id: true },
  });
  if (!inventory) {
    throw new BadRequestException('Akun 1100 (Persediaan) belum ada pada COA perusahaan.');
  }
  const counter = await ensureAccount(tx, params.tenantId, params.companyId, params.counter ?? INVENTORY_VARIANCE_ACCOUNT);

  return journals.post(tx, {
    tenantId: params.tenantId,
    companyId: params.companyId,
    entryDate: params.entryDate ?? new Date(),
    sourceModule: params.sourceModule,
    sourceRefId: params.sourceRefId,
    memo: params.memo,
    actorId: params.actorId,
    lines: buildAdjustmentLines({
      gain,
      loss,
      inventoryAccountId: inventory.id,
      counterAccountId: counter.id,
      memo: params.memo,
    }),
  });
}
