/**
 * Moving average HPP. Dipakai saat PO diterima: rata-rata tertimbang antara
 * stok berjalan dan pembelian baru. Pure function supaya bisa diuji tanpa DB.
 */
export function computeMovingAverage(params: {
  currentQty: number;
  currentAvgCost: number;
  incomingQty: number;
  incomingCost: number;
}): number {
  const { currentQty, currentAvgCost, incomingQty, incomingCost } = params;
  const newQty = currentQty + incomingQty;
  if (newQty <= 0) return round4(currentAvgCost);
  return round4((currentQty * currentAvgCost + incomingQty * incomingCost) / newQty);
}

function round4(n: number): number {
  return Number(n.toFixed(4));
}