import { TaxRulesService } from '../../modules/tax/tax-rules.service';
import type { DemoContext, DemoDomain } from './context';

/**
 * Fondasi yang dibutuhkan domain lain: aturan pajak. Pendaftaran tidak membuat aturan pajak, sehingga
 * tanpa ini faktur dan tagihan terbit tanpa PPN dan payroll tanpa PPh 21.
 *
 * Semua diberi label "estimate" (bukan "official") karena ini data contoh. Angkanya harus diverifikasi
 * konsultan pajak sebelum dipakai untuk pelaporan sungguhan.
 */
const EFFECTIVE_FROM = '2022-04-01';

export const foundationDomain: DemoDomain = {
  key: 'foundation',
  title: 'Aturan pajak (PPN dan PPh 21)',
  async run(ctx: DemoContext) {
    const tax = ctx.get(TaxRulesService);

    const ensure = async (code: string, make: () => Promise<unknown>) => {
      const found = await ctx.prisma.taxRule.findFirst({ where: { tenantId: ctx.tenantId, code }, select: { id: true } });
      if (!found) await make();
    };

    await ensure('PPN-KELUARAN', () =>
      tax.create(ctx.tenantId, {
        code: 'PPN-KELUARAN',
        name: 'PPN Keluaran 11%',
        category: 'vat',
        direction: 'output',
        basisType: 'net',
        rate: 0.11,
        effectiveFrom: EFFECTIVE_FROM,
        sourceRef: 'Tarif PPN umum 11%. Contoh data: verifikasi dengan konsultan pajak.',
        source: 'estimate',
      }),
    );
    await ensure('PPN-MASUKAN', () =>
      tax.create(ctx.tenantId, {
        code: 'PPN-MASUKAN',
        name: 'PPN Masukan 11%',
        category: 'vat',
        direction: 'input',
        basisType: 'net',
        rate: 0.11,
        effectiveFrom: EFFECTIVE_FROM,
        sourceRef: 'Tarif PPN umum 11%. Contoh data: verifikasi dengan konsultan pajak.',
        source: 'estimate',
      }),
    );
    await ensure('PPH21-TARIF', () =>
      tax.create(ctx.tenantId, {
        code: 'PPH21-TARIF',
        name: 'PPh 21 tarif progresif (setahun)',
        category: 'withholding',
        basisType: 'net',
        effectiveFrom: '2022-01-01',
        sourceRef: 'Lapisan tarif Pasal 17 UU PPh. Contoh data: PTKP dan TER belum dimodelkan.',
        source: 'estimate',
        brackets: [
          { lowerBound: 0, upperBound: 60_000_000, ratePercent: 5 },
          { lowerBound: 60_000_000, upperBound: 250_000_000, ratePercent: 15 },
          { lowerBound: 250_000_000, upperBound: 500_000_000, ratePercent: 25 },
          { lowerBound: 500_000_000, upperBound: 5_000_000_000, ratePercent: 30 },
          { lowerBound: 5_000_000_000, ratePercent: 35 },
        ],
      }),
    );
    ctx.log('aturan pajak: PPN keluaran/masukan 11%, PPh 21 progresif');
  },
};
