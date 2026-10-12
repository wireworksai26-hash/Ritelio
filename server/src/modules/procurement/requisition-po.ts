import { BadRequestException } from '@nestjs/common';
import { roundMoney } from '../../common/utils/money';

export interface RequisitionLineSource {
  lineId: string;
  productId: string;
  sku: string;
  requestedQty: number;
  preferredSupplierId: string | null;
  costPrice: number;
}

export interface LineOverride {
  productId: string;
  supplierId?: string;
  price?: number;
}

export interface PlannedPoLine {
  lineId: string;
  productId: string;
  qty: number;
  price: number;
}

export interface PlannedPo {
  supplierId: string;
  lines: PlannedPoLine[];
  total: number;
}

/**
 * Tentukan PO mana yang lahir dari satu requisition.
 *
 * Pemasok per baris: override eksplisit → pemasok utama produk → pemasok
 * default dari form. Harga: override → harga pokok produk. Baris yang tidak
 * punya pemasok atau harga ditolak sekaligus (semua SKU bermasalah disebut
 * dalam satu pesan) — PO berharga nol akan membuat jurnal penerimaan nol.
 */
export function planRequisitionPos(
  lines: RequisitionLineSource[],
  opts: { defaultSupplierId?: string; overrides?: LineOverride[] },
): PlannedPo[] {
  const overrides = new Map((opts.overrides ?? []).map((o) => [o.productId, o]));
  const noSupplier: string[] = [];
  const noPrice: string[] = [];
  const groups = new Map<string, PlannedPoLine[]>();

  for (const line of lines) {
    const o = overrides.get(line.productId);
    const supplierId = o?.supplierId ?? line.preferredSupplierId ?? opts.defaultSupplierId;
    const price = roundMoney(o?.price ?? line.costPrice);
    if (!supplierId) {
      noSupplier.push(line.sku);
      continue;
    }
    if (!(price > 0)) {
      noPrice.push(line.sku);
      continue;
    }
    const list = groups.get(supplierId) ?? [];
    list.push({ lineId: line.lineId, productId: line.productId, qty: line.requestedQty, price });
    groups.set(supplierId, list);
  }

  const problems: string[] = [];
  if (noSupplier.length) problems.push(`belum ada pemasok untuk: ${noSupplier.join(', ')}`);
  if (noPrice.length) problems.push(`harga belum diisi untuk: ${noPrice.join(', ')}`);
  if (problems.length) {
    throw new BadRequestException(`Permintaan belum bisa dijadikan PO — ${problems.join('; ')}.`);
  }

  return [...groups].map(([supplierId, poLines]) => ({
    supplierId,
    lines: poLines,
    total: roundMoney(poLines.reduce((s, l) => s + l.qty * l.price, 0)),
  }));
}
