import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { roundMoney } from '../../common/utils/money';

export type TaxKind = 'sale' | 'purchase';

export interface TaxResult {
  ruleId: string;
  ruleCode: string;
  ruleName: string;
  rate: number;
  direction: 'output' | 'input';
  source: 'official' | 'estimate';
  base: number;
  tax: number;
  snapshot: Prisma.InputJsonValue;
}

/**
 * Memperhitungkan pajak Indonesia dari aturan di database.
 *
 * PPN dihitung atas DPP. Nilai dokumen disimpan sebagai DPP (nilai neto), lalu
 * pajak dihitung dari nilai itu — bukan dari total yang sudah termasuk pajak.
 * `basisType` pada aturan mencatat resinya, jadi dokumen yang memang sudah
 * termasuk PPN tidak dihitung dua kali.
 */
@Injectable()
export class TaxEngineService {
  /** Ambil aturan aktif pada tanggal tertentu untuk jenis dokumen. */
  async resolveRule(
    tx: Prisma.TransactionClient,
    params: { tenantId: string; companyId: string; kind: TaxKind; on: Date },
  ): Promise<{ id: string; code: string; name: string; rate: number; direction: 'output' | 'input'; source: 'official' | 'estimate' } | null> {
    const rule = await tx.taxRule.findFirst({
      where: {
        tenantId: params.tenantId,
        companyId: params.companyId,
        isActive: true,
        category: 'vat',
        // PPN keluaran (tagihan ke pelanggan) dan PPN masukan (faktur dari
        // vendor) sengaja dipisah lewat `direction`, bukan lewat kategori —
        // keduanya sama-sama PPN barang/jasa.
        direction: params.kind === 'sale' ? 'output' : 'input',
        effectiveFrom: { lte: params.on },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: params.on } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      include: { brackets: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!rule) return null;

    // Aturan bracket dipakai kalau tarif tunggal tidak diisi; PPN barang/jasa
    // tidak pernah bertingkat, tapi strukturnya dipakai PPh21/PPh23.
    const rate = rule.rate !== null ? Number(rule.rate) : Number(rule.brackets[0]?.ratePercent ?? 0);
    if (rate <= 0) return null;

    return {
      id: rule.id,
      code: rule.code,
      name: rule.name,
      rate,
      direction: rule.direction,
      source: rule.source,
    };
  }

  /**
   * Hitung dan simpan TaxComputation untuk satu dokumen.
   *
   * Disimpan (bukan hanya dikembalikan) karena `ruleSnapshot` adalah bukti
   * angka yang dipakai saat itu — kalau tarif berubaheffective date berikutnya,
   * hasil yang sudah terbit tetap bisa ditelusuri.
   */
  async computeAndPersist(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      companyId: string;
      kind: TaxKind;
      documentType: 'customer_invoice' | 'vendor_bill';
      documentId: string;
      base: number;
      on: Date;
    },
  ): Promise<TaxResult | null> {
    // Idempoten per dokumen: memanggil ulang apply pada faktur yang sama tidak
    // boleh menambah PPN kedua kali. Pemanggil sering menjalankan jalur ini
    // dari beberapa tempat (POS, SO, proyek), jadi penjaga ada di dalam
    // engine, bukan di masing-masing pemanggil.
    const existing = await tx.taxComputation.findFirst({
      where: {
        tenantId: params.tenantId,
        companyId: params.companyId,
        documentType: params.documentType,
        documentId: params.documentId,
      },
      orderBy: { computedAt: 'desc' },
    });
    if (existing) {
      return {
        ruleId: existing.taxRuleId,
        ruleCode: '',
        ruleName: '',
        rate: 0,
        direction: existing.direction,
        source: existing.source,
        base: Number(existing.baseAmount),
        tax: Number(existing.taxAmount),
        snapshot: existing.ruleSnapshot as Prisma.InputJsonValue,
      };
    }

    const rule = await this.resolveRule(tx, params);
    if (!rule) return null;

    const base = roundMoney(params.base);
    const tax = roundMoney(base * rule.rate);
    if (tax <= 0) return null;

    const snapshot = {
      code: rule.code,
      name: rule.name,
      rate: rule.rate,
      source: rule.source,
      basis: 'net',
      appliedOn: params.on.toISOString(),
      ruleId: rule.id,
    } as Prisma.InputJsonValue;

    await tx.taxComputation.create({
      data: {
        tenantId: params.tenantId,
        companyId: params.companyId,
        taxRuleId: rule.id,
        documentType: params.documentType,
        documentId: params.documentId,
        direction: rule.direction,
        baseAmount: new Prisma.Decimal(base),
        taxAmount: new Prisma.Decimal(tax),
        source: rule.source,
        ruleSnapshot: snapshot,
      },
    });

    return { ...rule, ruleId: rule.id, ruleCode: rule.code, ruleName: rule.name, base, tax, snapshot };
  }
}