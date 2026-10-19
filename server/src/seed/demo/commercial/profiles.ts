import type { PosProfile } from './plan';

/** Porsi stok tiap outlet setelah distribusi awal (outlet pertama menyimpan sisanya). Urutan = biz.outlets. */
export const OUTLET_SHARES: Record<string, number[]> = {
  kopisenja: [0.6, 0.4],
  rotinusantara: [0.65, 0.35],
  laundrysegar: [0.6, 0.4],
};

/** Penjualan POS memakai paling banyak porsi ini dari stok tiap outlet; sisanya untuk pesanan/kredit B2B. */
export const POS_STOCK_FRACTION = 0.45;
/** Pesanan dan penjualan kredit B2B memakai paling banyak porsi ini dari stok outlet pertama. */
export const B2B_STOCK_FRACTION = 0.22;

const flat = (n: number, v = 0): number[] => Array.from({ length: n }, () => v);
const hoursOf = (map: Record<number, number>): number[] => {
  const arr = flat(24);
  for (const [h, w] of Object.entries(map)) arr[Number(h)] = w;
  return arr;
};

const KOPI_SENJA: PosProfile = {
  businessKey: 'kopisenja',
  count: 150,
  days: 58,
  hours: hoursOf({ 7: 6, 8: 10, 9: 8, 10: 5, 11: 5, 12: 9, 13: 8, 14: 5, 15: 5, 16: 7, 17: 9, 18: 8, 19: 6, 20: 4, 21: 2 }),
  dow: [1.5, 0.85, 0.85, 0.9, 0.95, 1.15, 1.55],
  growth: 0.35,
  outletWeights: [0.6, 0.4],
  lineWeights: [0.38, 0.34, 0.2, 0.08],
  payment: [['cash', 28], ['qris', 42], ['debit', 18], ['transfer', 12]],
  cashier: [['cashier', 85], ['manager', 15]],
  memberRate: 0.06,
  members: ['Budi Hartono (member)'],
  catalog: [
    { sku: 'KS-001', weight: 10, qty: [[1, 70], [2, 30]] },
    { sku: 'KS-002', weight: 14, qty: [[1, 75], [2, 25]] },
    { sku: 'KS-003', weight: 14, qty: [[1, 75], [2, 25]] },
    { sku: 'KS-004', weight: 20, qty: [[1, 60], [2, 30], [3, 10]] },
    { sku: 'KS-005', weight: 10, qty: [[1, 80], [2, 20]] },
    { sku: 'KS-006', weight: 7, qty: [[1, 85], [2, 15]] },
    { sku: 'KS-007', weight: 6, qty: [[1, 85], [2, 15]] },
    { sku: 'KS-008', weight: 4, qty: [[1, 100]] },
    { sku: 'KS-009', weight: 6, qty: [[1, 100]] },
    { sku: 'KS-010', weight: 5, qty: [[1, 100]] },
    { sku: 'KS-011', weight: 2, qty: [[1, 100]] },
    { sku: 'KS-012', weight: 2, qty: [[1, 100]] },
  ],
};

const ROTI_NUSANTARA: PosProfile = {
  businessKey: 'rotinusantara',
  count: 60,
  days: 45,
  hours: hoursOf({ 6: 6, 7: 12, 8: 10, 9: 6, 10: 4, 11: 4, 12: 5, 13: 4, 14: 4, 15: 8, 16: 10, 17: 9, 18: 5, 19: 2 }),
  dow: [1.3, 0.9, 0.85, 0.9, 0.95, 1.1, 1.4],
  growth: 0.25,
  outletWeights: [0.65, 0.35],
  lineWeights: [0.86, 0.14],
  payment: [['cash', 42], ['qris', 36], ['debit', 14], ['transfer', 8]],
  cashier: [['cashier', 85], ['manager', 15]],
  memberRate: 0,
  members: [],
  catalog: [
    { sku: 'RN-001', weight: 18, qty: [[1, 85], [2, 15]] },
    { sku: 'RN-002', weight: 13, qty: [[1, 80], [2, 20]] },
    { sku: 'RN-003', weight: 24, qty: [[1, 40], [2, 35], [3, 20], [4, 5]] },
    { sku: 'RN-004', weight: 4, qty: [[1, 100]] },
    { sku: 'RN-005', weight: 20, qty: [[1, 65], [2, 35]] },
  ],
};

const LAUNDRY_SEGAR: PosProfile = {
  businessKey: 'laundrysegar',
  count: 80,
  days: 55,
  hours: hoursOf({ 8: 8, 9: 10, 10: 9, 11: 6, 12: 4, 13: 4, 14: 5, 15: 6, 16: 9, 17: 10, 18: 8, 19: 4, 20: 2 }),
  dow: [0.9, 1.3, 1.0, 0.9, 0.9, 1.0, 1.3],
  growth: 0.2,
  outletWeights: [0.6, 0.4],
  lineWeights: [0.5, 0.35, 0.15],
  payment: [['cash', 44], ['qris', 32], ['transfer', 16], ['debit', 8]],
  cashier: [['cashier', 85], ['manager', 15]],
  memberRate: 0.1,
  members: ['Dewi Kartika (member)'],
  catalog: [
    { sku: 'LS-001', weight: 36, qty: [[2, 15], [2.5, 10], [3, 20], [3.5, 10], [4, 15], [5, 15], [6, 10], [8, 5]] },
    { sku: 'LS-002', weight: 20, qty: [[3, 25], [4, 25], [5, 25], [6, 15], [8, 10]] },
    { sku: 'LS-003', weight: 8, qty: [[2, 30], [3, 30], [4, 25], [5, 15]] },
    { sku: 'LS-004', weight: 8, qty: [[2, 30], [3, 30], [4, 25], [5, 15]] },
    { sku: 'LS-005', weight: 6, qty: [[1, 50], [2, 35], [3, 15]] },
    { sku: 'LS-006', weight: 6, qty: [[1, 60], [2, 40]] },
    { sku: 'LS-007', weight: 3, qty: [[4, 30], [6, 40], [9, 30]] },
    { sku: 'LS-008', weight: 4, qty: [[1, 60], [2, 40]] },
    { sku: 'LS-009', weight: 14, qty: [[1, 100]] },
    { sku: 'PL-001', weight: 2, qty: [[1, 100]] },
    { sku: 'PL-002', weight: 1.5, qty: [[1, 100]] },
    { sku: 'PL-003', weight: 1, qty: [[1, 100]] },
    { sku: 'PL-004', weight: 3, qty: [[1, 70], [2, 30]] },
  ],
};

export const POS_PROFILES: Record<string, PosProfile> = {
  kopisenja: KOPI_SENJA,
  rotinusantara: ROTI_NUSANTARA,
  laundrysegar: LAUNDRY_SEGAR,
};
