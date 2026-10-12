import { AsyncLocalStorage } from 'node:async_hooks';

export interface CompanyContext {
  tenantId: string;
  companyId: string;
}

/**
 * Perusahaan aktif untuk request yang sedang berjalan. Diisi oleh
 * CompanyContextInterceptor dari header X-Company-Id (sudah divalidasi milik
 * tenant dan aktif) dan dibaca oleh defaultCompanyId(), sehingga ratusan
 * pemanggil lama ikut mengikuti pilihan perusahaan tanpa diubah satu per satu.
 */
export const companyContext = new AsyncLocalStorage<CompanyContext>();

/** companyId aktif untuk tenant ini, atau undefined bila request tidak memilih perusahaan. */
export function activeCompanyId(tenantId: string): string | undefined {
  const ctx = companyContext.getStore();
  return ctx && ctx.tenantId === tenantId ? ctx.companyId : undefined;
}
