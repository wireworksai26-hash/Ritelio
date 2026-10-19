import type { DemoDomain } from './context';
import { commercialDomain } from './commercial';
import { financeDomain } from './finance';
import { foundationDomain } from './foundation';
import { peopleOpsDomain } from './people-ops';
import { supplyDomain } from './supply';

/**
 * Urutan eksekusi penting:
 *  1. foundation  aturan pajak (PPN/PPh 21) supaya faktur dan payroll berikutnya terhitung pajak
 *  2. supply      pembelian dan produksi dulu agar stok cukup untuk penjualan
 *  3. commercial  penjualan POS dan CRM mengurangi stok dan menerbitkan faktur piutang
 *  4. people-ops  SDM, proyek, logistik, perawatan, IoT
 *  5. finance     bank, aset tetap, jurnal manual; rekonsiliasi memakai jurnal kas yang sudah terbentuk
 */
export const DEMO_DOMAINS: DemoDomain[] = [foundationDomain, supplyDomain, commercialDomain, peopleOpsDomain, financeDomain];
