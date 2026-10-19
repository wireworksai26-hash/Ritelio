import { CompaniesService } from '../../../modules/companies/companies.service';
import { auditAt, loadAccountIds, postKeyed, type FinanceEnv } from './env';
import { planSubsidiary } from './plan';

/**
 * Satu perusahaan tambahan (anak usaha, rupiah) beserta jurnal ringkas per bulan, supaya halaman konsolidasi
 * dan pemilih perusahaan tidak kosong. Dibuat lewat CompaniesService (menyalin COA perusahaan utama dan membuat
 * kalender fiskal), jurnalnya lewat JournalService.post pada perusahaan itu.
 *
 * Kurs asing sengaja tidak dibuat: tabel mata uang hanya berisi IDR dan aplikasi tidak punya jalur menambah mata uang.
 */
export async function seedSubsidiary(env: FinanceEnv): Promise<{ journals: number; companyCode: string }> {
  const { ctx, profile } = env;
  const sub = profile.subsidiary;

  let company = await ctx.prisma.company.findFirst({ where: { tenantId: ctx.tenantId, code: sub.code }, select: { id: true } });
  if (!company) {
    const created = await ctx.get(CompaniesService).create(ctx.tenantId, {
      code: sub.code,
      name: sub.name,
      legalName: sub.legalName,
      taxId: sub.taxId,
      countryCode: 'ID',
      defaultCurrencyCode: 'IDR',
      parentId: ctx.companyId,
    });
    company = { id: created.id };
    await auditAt(env, env.at(env.plan.start, 9), { role: 'owner', entity: 'companies', entityId: created.id, after: { code: sub.code, name: sub.name } });
  }

  const accountIds = await loadAccountIds(ctx, company.id);
  const entries = planSubsidiary(profile, env.today, env.stats, env.plan.start);
  let journals = 0;
  for (const e of entries) {
    const [debit, credit] = e.accounts;
    const r = await postKeyed(env, {
      key: e.key,
      at: env.at(e.date, 12),
      memo: e.memo,
      role: 'owner',
      companyId: company.id,
      accountIds,
      lines: [
        { code: debit, direction: 'debit', amount: e.amount, memo: e.memo },
        { code: credit, direction: 'credit', amount: e.amount, memo: e.memo },
      ],
    });
    if (r.created) journals++;
  }
  return { journals, companyCode: sub.code };
}
