import type { DemoRole } from '../context';

/**
 * Rencana data domain "supply" dalam bentuk daftar peristiwa (murni data, tanpa akses database).
 * `day` = berapa hari lalu. Peristiwa dijalankan dari yang paling lama ke yang terbaru, jadi stok dan urutan
 * dokumen terbentuk seperti pemakaian sungguhan (PO dibuat, dikirim, diterima, lalu dibayar).
 *
 * `key` identik untuk satu dokumen di semua langkahnya (mis. 'P1' untuk po.create, po.send, po.receive).
 */

export type Qc = 'incoming' | 'in_process' | 'final';

interface Base {
  /** Berapa hari lalu. */
  day: number;
}

export type SupplyEvent = Base &
  (
    | { kind: 'req.create'; key: string; requester: DemoRole; reason: string; lines: Array<{ sku: string; qty: number }> }
    | { kind: 'req.submit'; key: string }
    | { kind: 'req.decide'; key: string; approver: DemoRole; approve: boolean }
    /** Requisition disetujui menjadi PO draf berkunci `poKey`. Harga baris = harga pokok produk. */
    | { kind: 'req.convert'; key: string; warehouse: number; poKey: string }
    | { kind: 'po.create'; key: string; supplier: string; warehouse: number; lines: Array<{ sku: string; qty: number; price: number }> }
    | { kind: 'po.send'; key: string }
    /** `rejections`: sku -> jumlah ditolak saat penerimaan (tidak masuk stok dan tidak ditagih). */
    | { kind: 'po.receive'; key: string; rejections?: Record<string, number> }
    | { kind: 'po.cancel'; key: string }
    /** Tagihan pemasok manual (tanpa PO), untuk biaya non-persediaan. `dueDay` = jatuh tempo, hari lalu. */
    | { kind: 'bill.manual'; key: string; supplier: string; invoiceNo: string; dueDay: number; amount: number; description: string }
    /** Bayar tagihan milik PO (`target` = kunci PO) atau tagihan manual (`target` = kunci tagihan). */
    | { kind: 'bill.pay'; key: string; target: string; fraction: number | 'full'; method: 'cash' | 'transfer' | 'qris' | 'debit' }
    | { kind: 'trf.create'; key: string; from: number; to: number; note: string; lines: Array<{ sku: string; qty: number }> }
    | { kind: 'trf.ship'; key: string }
    | { kind: 'trf.receive'; key: string }
    | { kind: 'adj'; key: string; sku: string; warehouse: number; qty: number; note: string }
    | { kind: 'sop.open'; key: string; warehouse: number; note: string }
    /**
     * `variances`: sku -> selisih fisik terhadap stok sistem (bisa negatif). Produk lain dihitung sama dengan sistem.
     * `fraction` < 1 = hanya sebagian baris yang dihitung (sesi dibiarkan terbuka).
     */
    | { kind: 'sop.count'; key: string; variances: Record<string, number>; fraction?: number }
    | { kind: 'sop.close'; key: string; note: string }
    | { kind: 'qc.config'; sku: string; stages: Array<{ stage: Qc; minPassPct: number }> }
    | { kind: 'mo.create'; key: string; sku: string; qty: number; warehouse: number; priority: number; scheduledDay?: number; note: string }
    /** `onDay`: hari lalu jadwal dipasang (0 = hari ini). `status` kosmetik: tampilan jadwal yang sudah berjalan. */
    | { kind: 'mo.schedule'; key: string; scheduleKey: string; workCenter: string; onDay: number; startMinutes: number; minutes: number; status?: 'started' | 'done' }
    | { kind: 'mo.release'; key: string }
    | { kind: 'mo.qc'; key: string; stage: Qc; checked: number; defect: number; note: string }
    | { kind: 'mo.complete'; key: string; qty?: number }
    | { kind: 'mo.cancel'; key: string }
    | { kind: 'reorder.generate'; key: string }
  );

export interface SupplyPlan {
  events: SupplyEvent[];
  /** Rentang hari lalu (awal, akhir) tiap periode skor kinerja pemasok. Dihitung sekali. */
  performanceWindows: Array<{ from: number; to: number }>;
}

/** Stok yang diharapkan tetap di/bawah titik pesan ulang setelah semua peristiwa: "sku@indeksGudang". */
export type ExpectedLow = string[];
