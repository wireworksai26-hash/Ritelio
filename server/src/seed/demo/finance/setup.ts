import { AccountsService } from '../../../modules/finance/accounts.service';
import { BankingService } from '../../../modules/banking/banking.service';
import { PartyService } from '../../../modules/parties/parties.service';
import type { DemoContext } from '../context';
import { loadAccountIds, type BankRef } from './env';
import { EXTRA_ACCOUNTS, type FinanceProfile } from './profiles';

/**
 * COA bawaan pendaftaran belum punya akun aset tetap, penyusutan, bank tambahan, dan beban operasional rinci,
 * padahal modul aset dan bank membutuhkannya. Dibuat lewat AccountsService (jalur yang sama dengan menu
 * Akuntansi), hanya yang belum ada.
 */
export async function ensureAccounts(ctx: DemoContext): Promise<{ ids: Map<string, string>; created: number }> {
  const accounts = ctx.get(AccountsService);
  const existing = await loadAccountIds(ctx, ctx.companyId);
  let created = 0;
  for (const spec of EXTRA_ACCOUNTS) {
    if (existing.has(spec.code)) continue;
    await accounts.create(ctx.tenantId, spec);
    created++;
  }
  return { ids: created ? await loadAccountIds(ctx, ctx.companyId) : existing, created };
}

/** Rekening bank profil; kode rekening bank bersifat unik per perusahaan, jadi cukup dicek berdasarkan kode. */
export async function ensureBanks(ctx: DemoContext, profile: FinanceProfile, ids: Map<string, string>): Promise<BankRef[]> {
  const banking = ctx.get(BankingService);
  const refs: BankRef[] = [];
  for (const spec of profile.banks) {
    let row = await ctx.prisma.bankAccount.findFirst({
      where: { tenantId: ctx.tenantId, companyId: ctx.companyId, code: spec.code },
      select: { id: true, accountId: true },
    });
    if (!row) {
      const created = await banking.createAccount(ctx.tenantId, {
        code: spec.code,
        name: spec.name,
        bankName: spec.bankName,
        accountNumber: spec.accountNumber,
        accountCode: spec.ledgerCode,
        currencyCode: 'IDR',
      });
      row = { id: created.id, accountId: created.accountId };
    }
    const ledgerId = ids.get(spec.ledgerCode);
    if (!ledgerId || ledgerId !== row.accountId) {
      throw new Error(`Rekening ${spec.code} tertaut ke akun lain dari yang diharapkan (${spec.ledgerCode}).`);
    }
    refs.push({ id: row.id, code: spec.code, name: spec.name, role: spec.role, ledgerCode: spec.ledgerCode, ledgerId });
  }
  return refs;
}

/** Pemasok untuk sewa, internet, pemasaran, dan perawatan; dikenali dari nama. */
export async function ensureVendors(ctx: DemoContext, profile: FinanceProfile): Promise<Map<string, string>> {
  const parties = ctx.get(PartyService);
  const out = new Map<string, string>();
  for (const v of profile.vendors) {
    const found = await ctx.prisma.supplier.findFirst({ where: { tenantId: ctx.tenantId, name: v.name }, select: { id: true } });
    if (found) {
      out.set(v.key, found.id);
      continue;
    }
    const slug = v.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const created = await parties.createSupplier(ctx.tenantId, {
      name: v.name,
      contact: v.contact,
      email: `${slug}@vendor.example.com`,
      phone: '0812-0000-0301',
      city: v.city,
      address: v.address,
      paymentTermDays: v.termDays,
    });
    out.set(v.key, (created as { id: string }).id);
  }
  return out;
}
