import type { JournalStatus } from '@prisma/client';

/**
 * Status jurnal yang ikut membentuk saldo buku besar.
 *
 * Jurnal asal yang sudah dibalik ditandai `voided`, sedangkan jurnal pembaliknya
 * `posted`. Kalau laporan hanya membaca `posted`, jurnal asal hilang dan jurnal
 * pembalik berdiri sendiri sehingga saldo bergeser sebesar nominal jurnal itu
 * (bukan kembali ke semula). Pasangan asal+pembalik harus dibaca bersama; draft
 * tidak pernah ikut.
 */
export const LEDGER_STATUSES: JournalStatus[] = ['posted', 'voided'];
