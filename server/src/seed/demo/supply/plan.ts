import type { BusinessSeed } from '../../businesses.data';
import type { SupplyEvent, SupplyPlan } from './types';

/**
 * Rencana data rantai pasok per usaha. Murni data: tiap usaha punya alur sendiri yang mengikuti jenisnya
 * (retail: pengadaan dan transfer antar-outlet; manufaktur: bahan baku dan produksi; jasa: perlengkapan saja).
 *
 * Kesengajaan yang dijaga oleh plan.spec.ts:
 *  - satu atau dua produk tetap di bawah titik pesan ulang (Kopi Senja: KS-008, Roti Nusantara: BB-004,
 *    Laundry: PL-002), jadi tidak ada PO terima untuk produk itu dan opname tidak mengangkatnya;
 *  - umur utang mencakup kelima bucket aging, ada yang lunas dan ada yang dibayar sebagian;
 *  - stok tidak pernah negatif pada urutan kronologis.
 */

const tag = (code: string, text: string) => `[demo] ${code}: ${text}`;

const WINDOWS = [
  { from: 90, to: 60 },
  { from: 60, to: 30 },
  { from: 30, to: 0 },
];

type E = SupplyEvent;

// ───────────────────────────── Kopi Senja (retail) ─────────────────────────────
const KN = 'PT Kopi Nusantara Sejahtera';
const SL = 'CV Susu Segar Lembang';
const MW = 'Toko Bahan Kue Mawar';

function kopiSenja(): E[] {
  return [
    // Tagihan manual lama: bucket "telat > 90 hari".
    { day: 105, kind: 'bill.manual', key: 'M1', supplier: KN, invoiceNo: 'DEMO-INV-K01', dueDay: 97, amount: 2_500_000, description: 'Sewa mesin espresso (Juni)' },

    // P1: diterima, dibayar sebagian, masih telat 61-90 hari.
    { day: 90, kind: 'po.create', key: 'P1', supplier: KN, warehouse: 0, lines: [{ sku: 'KS-011', qty: 40, price: 58_000 }, { sku: 'KS-012', qty: 50, price: 38_000 }] },
    { day: 89, kind: 'po.send', key: 'P1' },
    { day: 85, kind: 'po.receive', key: 'P1' },

    // R1 -> P2: requisition lengkap sampai PO diterima dan lunas.
    { day: 82, kind: 'req.create', key: 'R1', requester: 'staff', reason: tag('DEMO-REQ-01', 'Roti bakar cokelat untuk dua outlet'), lines: [{ sku: 'KS-009', qty: 60 }] },
    { day: 81, kind: 'req.submit', key: 'R1' },
    { day: 80, kind: 'req.decide', key: 'R1', approver: 'manager', approve: true },
    { day: 79, kind: 'req.convert', key: 'R1', warehouse: 0, poKey: 'P2' },
    { day: 79, kind: 'po.send', key: 'P2' },
    { day: 76, kind: 'po.receive', key: 'P2' },
    { day: 70, kind: 'bill.pay', key: 'PAY-P2', target: 'P2', fraction: 'full', method: 'transfer' },

    { day: 62, kind: 'po.create', key: 'P3', supplier: SL, warehouse: 0, lines: [{ sku: 'KS-003', qty: 60, price: 10_000 }, { sku: 'KS-004', qty: 80, price: 8_500 }, { sku: 'KS-005', qty: 50, price: 10_000 }] },
    { day: 61, kind: 'po.send', key: 'P3' },
    { day: 60, kind: 'bill.pay', key: 'PAY-P1', target: 'P1', fraction: 0.5, method: 'transfer' },
    { day: 59, kind: 'po.receive', key: 'P3' },

    // Transfer ke Outlet Dago.
    { day: 55, kind: 'trf.create', key: 'T1', from: 0, to: 1, note: tag('DEMO-TRF-01', 'Stok awal Outlet Dago'), lines: [{ sku: 'KS-001', qty: 40 }, { sku: 'KS-002', qty: 40 }, { sku: 'KS-004', qty: 60 }, { sku: 'KS-005', qty: 40 }, { sku: 'KS-006', qty: 30 }, { sku: 'KS-009', qty: 15 }] },
    { day: 54, kind: 'trf.ship', key: 'T1' },
    { day: 52, kind: 'trf.receive', key: 'T1' },

    { day: 50, kind: 'adj', key: 'A1', sku: 'KS-006', warehouse: 0, qty: -3, note: tag('DEMO-ADJ-01', 'Rusak: kaleng matcha penyok') },
    { day: 49, kind: 'adj', key: 'A2', sku: 'KS-004', warehouse: 0, qty: -4, note: tag('DEMO-ADJ-02', 'Kadaluarsa: susu segar lewat masa simpan') },

    // Opname Outlet Senopati: dihitung lalu ditutup dengan selisih.
    { day: 45, kind: 'sop.open', key: 'S1', warehouse: 0, note: tag('DEMO-SOP-01', 'Opname bulanan Outlet Senopati') },
    { day: 45, kind: 'sop.count', key: 'S1', variances: { 'KS-001': -2, 'KS-007': 1, 'KS-010': -3, 'KS-012': -1 } },
    { day: 44, kind: 'sop.close', key: 'S1', note: tag('DEMO-SOP-01', 'Opname bulanan Outlet Senopati, selisih disetujui') },

    // R2 -> P4: PO sudah dikirim ke pemasok, belum diterima.
    { day: 42, kind: 'req.create', key: 'R2', requester: 'staff', reason: tag('DEMO-REQ-02', 'Biji kopi menipis menjelang akhir bulan'), lines: [{ sku: 'KS-011', qty: 30 }, { sku: 'KS-012', qty: 40 }] },
    { day: 41, kind: 'req.submit', key: 'R2' },
    { day: 40, kind: 'req.decide', key: 'R2', approver: 'manager', approve: true },
    { day: 39, kind: 'req.convert', key: 'R2', warehouse: 0, poKey: 'P4' },
    { day: 38, kind: 'po.send', key: 'P4' },

    // P5 masuk ke gudang Dago, telat 1-30 hari, dibayar sebagian.
    { day: 36, kind: 'po.create', key: 'P5', supplier: KN, warehouse: 1, lines: [{ sku: 'KS-012', qty: 60, price: 38_000 }, { sku: 'KS-011', qty: 30, price: 58_000 }] },
    { day: 35, kind: 'po.send', key: 'P5' },
    { day: 32, kind: 'po.receive', key: 'P5' },

    // Requisition dengan status lain.
    { day: 34, kind: 'req.create', key: 'R3', requester: 'staff', reason: tag('DEMO-REQ-03', 'Croissant mentega habis cepat'), lines: [{ sku: 'KS-008', qty: 40 }] },
    { day: 30, kind: 'req.create', key: 'R4', requester: 'staff', reason: tag('DEMO-REQ-04', 'Isi ulang biji kopi Dago'), lines: [{ sku: 'KS-011', qty: 25 }, { sku: 'KS-012', qty: 30 }] },
    { day: 30, kind: 'req.submit', key: 'R4' },
    { day: 28, kind: 'req.create', key: 'R5', requester: 'staff', reason: tag('DEMO-REQ-05', 'Roti bakar cokelat promo akhir pekan'), lines: [{ sku: 'KS-009', qty: 20 }] },
    { day: 28, kind: 'req.submit', key: 'R5' },
    { day: 27, kind: 'req.decide', key: 'R5', approver: 'manager', approve: true },
    { day: 26, kind: 'req.create', key: 'R6', requester: 'staff', reason: tag('DEMO-REQ-06', 'Stok matcha masih banyak, ajuan ini ditolak'), lines: [{ sku: 'KS-006', qty: 60 }] },
    { day: 26, kind: 'req.submit', key: 'R6' },
    { day: 25, kind: 'req.decide', key: 'R6', approver: 'owner', approve: false },

    { day: 24, kind: 'po.create', key: 'P6', supplier: MW, warehouse: 0, lines: [{ sku: 'KS-009', qty: 30, price: 9_000 }] },
    { day: 23, kind: 'po.cancel', key: 'P6' },

    { day: 20, kind: 'bill.pay', key: 'PAY-P5', target: 'P5', fraction: 0.4, method: 'transfer' },
    { day: 20, kind: 'trf.create', key: 'T2', from: 1, to: 0, note: tag('DEMO-TRF-02', 'Kembalikan kelebihan espresso ke Senopati'), lines: [{ sku: 'KS-001', qty: 5 }] },
    { day: 19, kind: 'trf.ship', key: 'T2' },
    { day: 18, kind: 'trf.receive', key: 'T2' },

    { day: 16, kind: 'adj', key: 'A3', sku: 'KS-002', warehouse: 0, qty: -2, note: tag('DEMO-ADJ-03', 'Hilang: selisih serah terima shift') },
    { day: 16, kind: 'adj', key: 'A4', sku: 'KS-001', warehouse: 1, qty: -1, note: tag('DEMO-ADJ-04', 'Rusak: tumpah saat penataan') },

    // P7: diterima dengan sebagian ditolak, belum jatuh tempo.
    { day: 15, kind: 'po.create', key: 'P7', supplier: KN, warehouse: 0, lines: [{ sku: 'KS-012', qty: 40, price: 38_000 }] },
    { day: 14, kind: 'po.send', key: 'P7' },
    { day: 10, kind: 'po.receive', key: 'P7', rejections: { 'KS-012': 2 } },

    { day: 12, kind: 'trf.create', key: 'T3', from: 0, to: 1, note: tag('DEMO-TRF-03', 'Tambahan biji kopi untuk Dago'), lines: [{ sku: 'KS-011', qty: 10 }, { sku: 'KS-012', qty: 15 }, { sku: 'KS-009', qty: 8 }] },
    { day: 9, kind: 'trf.ship', key: 'T3' },
    { day: 8, kind: 'trf.create', key: 'T4', from: 0, to: 1, note: tag('DEMO-TRF-04', 'Nasi goreng kampung untuk Dago (belum dikirim)'), lines: [{ sku: 'KS-010', qty: 10 }] },

    // Opname Dago dibiarkan terbuka, baru separuh dihitung.
    { day: 7, kind: 'sop.open', key: 'S2', warehouse: 1, note: tag('DEMO-SOP-02', 'Opname Outlet Dago, sedang berjalan') },
    { day: 7, kind: 'sop.count', key: 'S2', variances: {}, fraction: 0.5 },

    { day: 5, kind: 'reorder.generate', key: 'G1' },
    { day: 3, kind: 'po.create', key: 'P8', supplier: SL, warehouse: 1, lines: [{ sku: 'KS-004', qty: 40, price: 8_500 }] },
  ];
}

// ───────────────────────────── Roti Nusantara (manufaktur) ─────────────────────────────
const ST = 'PT Sumber Tepung Makmur';
const TS = 'CV Telur Sehat Farm';
const MP = 'UD Mentega Prima';
const KR = 'PT Kemasan Rapi Indonesia';

function rotiNusantara(): E[] {
  return [
    { day: 104, kind: 'bill.manual', key: 'M1', supplier: ST, invoiceNo: 'DEMO-INV-R01', dueDay: 97, amount: 1_800_000, description: 'Ongkos angkut bahan baku (Juni)' },

    { day: 92, kind: 'po.create', key: 'P1', supplier: ST, warehouse: 0, lines: [{ sku: 'BB-001', qty: 200, price: 11_500 }, { sku: 'BB-002', qty: 100, price: 15_500 }] },
    { day: 91, kind: 'po.send', key: 'P1' },
    { day: 88, kind: 'po.receive', key: 'P1' },
    { day: 84, kind: 'po.create', key: 'P2', supplier: TS, warehouse: 0, lines: [{ sku: 'BB-005', qty: 50, price: 27_000 }] },
    { day: 83, kind: 'po.send', key: 'P2' },
    { day: 80, kind: 'po.receive', key: 'P2' },

    // Tahap QC bertingkat per produk jadi.
    { day: 66, kind: 'qc.config', sku: 'RN-001', stages: [{ stage: 'incoming', minPassPct: 100 }, { stage: 'in_process', minPassPct: 95 }, { stage: 'final', minPassPct: 95 }] },
    { day: 66, kind: 'qc.config', sku: 'RN-002', stages: [{ stage: 'incoming', minPassPct: 100 }, { stage: 'final', minPassPct: 95 }] },
    { day: 66, kind: 'qc.config', sku: 'RN-003', stages: [{ stage: 'in_process', minPassPct: 95 }, { stage: 'final', minPassPct: 98 }] },

    // Produksi baru dimulai setelah stok awal (komersial memundurkan stok awal sampai sekitar hari ke-75): bahan
    // baku tidak boleh keluar sebelum stok awalnya tercatat.
    // M1: roti tawar, selesai.
    { day: 64, kind: 'mo.create', key: 'M1', sku: 'RN-001', qty: 100, warehouse: 0, priority: 3, scheduledDay: 63, note: tag('DEMO-MO-01', 'Roti tawar premium, produksi rutin') },
    { day: 64, kind: 'mo.schedule', key: 'M1', scheduleKey: 'M1-mixer', workCenter: 'WC-MIXER', onDay: 63, startMinutes: 0, minutes: 90, status: 'done' },
    { day: 64, kind: 'mo.schedule', key: 'M1', scheduleKey: 'M1-oven', workCenter: 'WC-OVEN', onDay: 63, startMinutes: 0, minutes: 150, status: 'done' },
    { day: 63, kind: 'mo.release', key: 'M1' },
    { day: 63, kind: 'mo.qc', key: 'M1', stage: 'incoming', checked: 100, defect: 0, note: 'Bahan sesuai spesifikasi' },
    { day: 63, kind: 'mo.qc', key: 'M1', stage: 'in_process', checked: 100, defect: 1, note: 'Satu adonan kurang mengembang' },
    { day: 62, kind: 'mo.qc', key: 'M1', stage: 'final', checked: 100, defect: 2, note: 'Dua roti gosong di tepi' },
    { day: 62, kind: 'mo.complete', key: 'M1' },

    // M2: donat, selesai (jumlah besar).
    { day: 58, kind: 'mo.create', key: 'M2', sku: 'RN-003', qty: 500, warehouse: 0, priority: 5, scheduledDay: 57, note: tag('DEMO-MO-02', 'Donat gula pesanan Kafe Titik Temu') },
    { day: 58, kind: 'mo.schedule', key: 'M2', scheduleKey: 'M2-mixer', workCenter: 'WC-MIXER', onDay: 57, startMinutes: 0, minutes: 120, status: 'done' },
    { day: 58, kind: 'mo.schedule', key: 'M2', scheduleKey: 'M2-oven', workCenter: 'WC-OVEN', onDay: 57, startMinutes: 0, minutes: 180, status: 'done' },
    { day: 57, kind: 'mo.release', key: 'M2' },
    { day: 57, kind: 'mo.qc', key: 'M2', stage: 'in_process', checked: 500, defect: 6, note: 'Adonan seragam' },
    { day: 56, kind: 'mo.qc', key: 'M2', stage: 'final', checked: 500, defect: 8, note: 'Delapan donat penyok, dipisahkan' },
    { day: 56, kind: 'mo.complete', key: 'M2' },

    // M3: roti sobek cokelat, selesai.
    { day: 53, kind: 'mo.create', key: 'M3', sku: 'RN-002', qty: 50, warehouse: 0, priority: 4, scheduledDay: 52, note: tag('DEMO-MO-03', 'Roti sobek cokelat untuk gerai') },
    { day: 53, kind: 'mo.schedule', key: 'M3', scheduleKey: 'M3-mixer', workCenter: 'WC-MIXER', onDay: 52, startMinutes: 0, minutes: 60, status: 'done' },
    { day: 53, kind: 'mo.schedule', key: 'M3', scheduleKey: 'M3-oven', workCenter: 'WC-OVEN', onDay: 52, startMinutes: 0, minutes: 90, status: 'done' },
    { day: 52, kind: 'mo.release', key: 'M3' },
    { day: 52, kind: 'mo.qc', key: 'M3', stage: 'incoming', checked: 50, defect: 0, note: 'Cokelat meses sesuai' },
    { day: 51, kind: 'mo.qc', key: 'M3', stage: 'final', checked: 50, defect: 1, note: 'Satu roti kurang isian' },
    { day: 51, kind: 'mo.complete', key: 'M3' },

    { day: 50, kind: 'bill.pay', key: 'PAY-P1', target: 'P1', fraction: 0.5, method: 'transfer' },
    { day: 48, kind: 'po.create', key: 'P3', supplier: KR, warehouse: 0, lines: [{ sku: 'KM-001', qty: 2000, price: 600 }, { sku: 'KM-002', qty: 500, price: 1_800 }] },
    { day: 47, kind: 'po.send', key: 'P3' },
    { day: 45, kind: 'po.receive', key: 'P3' },

    // Opname dapur pusat.
    { day: 44, kind: 'sop.open', key: 'S1', warehouse: 0, note: tag('DEMO-SOP-01', 'Opname bahan dan barang jadi dapur pusat') },
    { day: 44, kind: 'sop.count', key: 'S1', variances: { 'BB-001': -2.5, 'BB-002': 1, 'KM-001': -20, 'RN-002': -1, 'BB-007': 0.5 } },
    { day: 43, kind: 'sop.close', key: 'S1', note: tag('DEMO-SOP-01', 'Opname dapur pusat, selisih disetujui') },

    { day: 40, kind: 'trf.create', key: 'T1', from: 0, to: 1, note: tag('DEMO-TRF-01', 'Isi etalase Gerai Margonda'), lines: [{ sku: 'RN-001', qty: 20 }, { sku: 'RN-002', qty: 15 }, { sku: 'RN-003', qty: 60 }, { sku: 'RN-004', qty: 6 }, { sku: 'RN-005', qty: 20 }] },
    { day: 39, kind: 'trf.ship', key: 'T1' },
    { day: 37, kind: 'trf.receive', key: 'T1' },

    { day: 36, kind: 'po.create', key: 'P4', supplier: MP, warehouse: 0, lines: [{ sku: 'BB-006', qty: 20, price: 78_000 }] },
    { day: 35, kind: 'po.send', key: 'P4' },
    { day: 33, kind: 'po.receive', key: 'P4' },

    // M4: roti tawar ditahan di tahap proses karena QC gagal; bahan sudah ditarik.
    { day: 30, kind: 'mo.create', key: 'M4', sku: 'RN-001', qty: 60, warehouse: 0, priority: 2, scheduledDay: 29, note: tag('DEMO-MO-04', 'Roti tawar susulan, QC proses gagal') },
    { day: 30, kind: 'mo.schedule', key: 'M4', scheduleKey: 'M4-pack', workCenter: 'WC-PACK', onDay: 0, startMinutes: 0, minutes: 90, status: 'started' },
    { day: 29, kind: 'mo.release', key: 'M4' },
    { day: 29, kind: 'mo.qc', key: 'M4', stage: 'incoming', checked: 60, defect: 0, note: 'Bahan masuk baik' },
    { day: 28, kind: 'mo.qc', key: 'M4', stage: 'in_process', checked: 60, defect: 12, note: 'Adonan terlalu lembek, 12 loyang gagal' },

    { day: 26, kind: 'req.create', key: 'R1', requester: 'staff', reason: tag('DEMO-REQ-01', 'Terigu dan gula untuk produksi bulan depan'), lines: [{ sku: 'BB-001', qty: 300 }, { sku: 'BB-002', qty: 150 }] },
    { day: 26, kind: 'req.submit', key: 'R1' },
    { day: 25, kind: 'req.create', key: 'R2', requester: 'staff', reason: tag('DEMO-REQ-02', 'Kantong kertas roti'), lines: [{ sku: 'KM-001', qty: 1500 }] },
    { day: 25, kind: 'req.submit', key: 'R2' },
    { day: 24, kind: 'req.decide', key: 'R2', approver: 'manager', approve: true },
    { day: 24, kind: 'po.create', key: 'P6', supplier: TS, warehouse: 0, lines: [{ sku: 'BB-005', qty: 80, price: 27_000 }] },
    { day: 23, kind: 'po.cancel', key: 'P6' },

    { day: 22, kind: 'req.create', key: 'R3', requester: 'staff', reason: tag('DEMO-REQ-03', 'Ragi dan cokelat meses'), lines: [{ sku: 'BB-003', qty: 30 }, { sku: 'BB-007', qty: 30 }] },
    { day: 22, kind: 'req.submit', key: 'R3' },
    { day: 21, kind: 'req.decide', key: 'R3', approver: 'manager', approve: true },
    { day: 20, kind: 'req.convert', key: 'R3', warehouse: 0, poKey: 'P5' },
    { day: 19, kind: 'po.send', key: 'P5' },

    { day: 20, kind: 'mo.create', key: 'M8', sku: 'RN-001', qty: 20, warehouse: 0, priority: 7, note: tag('DEMO-MO-08', 'Roti tawar tambahan, dibatalkan karena pesanan batal') },
    { day: 19, kind: 'mo.cancel', key: 'M8' },

    { day: 18, kind: 'req.create', key: 'R4', requester: 'staff', reason: tag('DEMO-REQ-04', 'Susu bubuk, stok dirasa cukup'), lines: [{ sku: 'BB-006', qty: 80 }] },
    { day: 18, kind: 'req.submit', key: 'R4' },
    { day: 17, kind: 'req.decide', key: 'R4', approver: 'owner', approve: false },
    { day: 17, kind: 'req.create', key: 'R5', requester: 'staff', reason: tag('DEMO-REQ-05', 'Mentega, menunggu persetujuan anggaran'), lines: [{ sku: 'BB-004', qty: 40 }] },

    { day: 16, kind: 'po.create', key: 'P7', supplier: TS, warehouse: 0, lines: [{ sku: 'BB-005', qty: 40, price: 27_000 }] },
    { day: 16, kind: 'adj', key: 'A1', sku: 'BB-005', warehouse: 0, qty: -3, note: tag('DEMO-ADJ-01', 'Rusak: telur pecah saat bongkar muat') },
    { day: 15, kind: 'po.send', key: 'P7' },
    { day: 14, kind: 'adj', key: 'A2', sku: 'RN-003', warehouse: 0, qty: -12, note: tag('DEMO-ADJ-02', 'Kadaluarsa: donat tidak layak jual') },
    { day: 14, kind: 'po.create', key: 'P8', supplier: ST, warehouse: 0, lines: [{ sku: 'BB-002', qty: 60, price: 15_500 }] },
    { day: 13, kind: 'po.send', key: 'P8' },
    { day: 13, kind: 'adj', key: 'A3', sku: 'BB-006', warehouse: 0, qty: -1, note: tag('DEMO-ADJ-03', 'Kadaluarsa: kemasan susu bubuk menggumpal') },
    { day: 12, kind: 'adj', key: 'A4', sku: 'KM-001', warehouse: 0, qty: -30, note: tag('DEMO-ADJ-04', 'Rusak: kantong kertas terkena air') },
    { day: 11, kind: 'po.receive', key: 'P7', rejections: { 'BB-005': 4 } },

    // Order produksi yang masih direncanakan: dua dijadwalkan hari ini, satu belum (untuk usulan jadwal).
    { day: 12, kind: 'mo.create', key: 'M5', sku: 'RN-002', qty: 30, warehouse: 0, priority: 4, scheduledDay: 0, note: tag('DEMO-MO-05', 'Roti sobek cokelat pesanan hotel') },
    { day: 12, kind: 'mo.schedule', key: 'M5', scheduleKey: 'M5-mixer', workCenter: 'WC-MIXER', onDay: 0, startMinutes: 0, minutes: 120 },
    { day: 12, kind: 'mo.create', key: 'M6', sku: 'RN-003', qty: 200, warehouse: 0, priority: 3, scheduledDay: 0, note: tag('DEMO-MO-06', 'Donat gula stok etalase') },
    { day: 12, kind: 'mo.schedule', key: 'M6', scheduleKey: 'M6-mixer', workCenter: 'WC-MIXER', onDay: 0, startMinutes: 120, minutes: 180 },
    { day: 12, kind: 'mo.schedule', key: 'M6', scheduleKey: 'M6-oven', workCenter: 'WC-OVEN', onDay: 0, startMinutes: 0, minutes: 240 },
    { day: 12, kind: 'mo.create', key: 'M7', sku: 'RN-003', qty: 100, warehouse: 0, priority: 6, note: tag('DEMO-MO-07', 'Donat gula, belum dijadwalkan') },

    { day: 10, kind: 'sop.open', key: 'S2', warehouse: 1, note: tag('DEMO-SOP-02', 'Opname Gerai Margonda, sedang berjalan') },
    { day: 10, kind: 'sop.count', key: 'S2', variances: {}, fraction: 0.5 },

    { day: 9, kind: 'po.receive', key: 'P8' },
    { day: 9, kind: 'trf.create', key: 'T2', from: 0, to: 1, note: tag('DEMO-TRF-02', 'Croissant untuk Gerai Margonda'), lines: [{ sku: 'RN-005', qty: 5 }] },
    { day: 8, kind: 'trf.ship', key: 'T2' },
    { day: 7, kind: 'trf.create', key: 'T3', from: 0, to: 1, note: tag('DEMO-TRF-03', 'Roti tawar tambahan (belum dikirim)'), lines: [{ sku: 'RN-001', qty: 5 }] },

    { day: 6, kind: 'reorder.generate', key: 'G1' },
    { day: 5, kind: 'po.create', key: 'P9', supplier: KR, warehouse: 0, lines: [{ sku: 'KM-002', qty: 400, price: 1_800 }] },
    { day: 3, kind: 'bill.pay', key: 'PAY-P7', target: 'P7', fraction: 'full', method: 'cash' },
  ];
}

// ───────────────────────────── Laundry Segar Jaya (jasa) ─────────────────────────────
const KB = 'PT Kimia Bersih Abadi';
const PK = 'CV Plastik Kemasan Jaya';

function laundrySegar(): E[] {
  return [
    { day: 100, kind: 'bill.manual', key: 'M1', supplier: KB, invoiceNo: 'DEMO-INV-L01', dueDay: 96, amount: 1_350_000, description: 'Sewa dispenser bahan kimia (Juni)' },

    { day: 85, kind: 'po.create', key: 'P1', supplier: KB, warehouse: 0, lines: [{ sku: 'PL-001', qty: 24, price: 68_000 }] },
    { day: 84, kind: 'po.send', key: 'P1' },
    { day: 84, kind: 'bill.manual', key: 'M2', supplier: PK, invoiceNo: 'DEMO-INV-L02', dueDay: 72, amount: 780_000, description: 'Ongkos kirim kemasan' },
    { day: 82, kind: 'po.receive', key: 'P1' },

    { day: 75, kind: 'bill.manual', key: 'M3', supplier: PK, invoiceNo: 'DEMO-INV-L03', dueDay: 61, amount: 450_000, description: 'Perbaikan rak penyimpanan' },
    { day: 58, kind: 'bill.pay', key: 'PAY-M3', target: 'M3', fraction: 'full', method: 'cash' },

    { day: 45, kind: 'trf.create', key: 'T1', from: 0, to: 1, note: tag('DEMO-TRF-01', 'Perlengkapan awal Cabang Kukusan'), lines: [{ sku: 'PL-001', qty: 12 }, { sku: 'PL-003', qty: 12 }, { sku: 'PL-004', qty: 20 }] },
    { day: 44, kind: 'trf.ship', key: 'T1' },
    { day: 42, kind: 'trf.receive', key: 'T1' },

    { day: 40, kind: 'bill.pay', key: 'PAY-P1', target: 'P1', fraction: 0.5, method: 'transfer' },
    { day: 40, kind: 'adj', key: 'A1', sku: 'PL-004', warehouse: 0, qty: -3, note: tag('DEMO-ADJ-01', 'Rusak: hanger patah') },
    { day: 39, kind: 'adj', key: 'A2', sku: 'PL-003', warehouse: 0, qty: -1, note: tag('DEMO-ADJ-02', 'Rusak: roll plastik basah') },
    { day: 38, kind: 'adj', key: 'A3', sku: 'PL-001', warehouse: 0, qty: -2, note: tag('DEMO-ADJ-03', 'Hilang: jerigen bocor saat dipindah') },
    { day: 37, kind: 'adj', key: 'A4', sku: 'PL-004', warehouse: 1, qty: -2, note: tag('DEMO-ADJ-04', 'Hilang: hanger tidak kembali dari pelanggan') },

    { day: 37, kind: 'po.create', key: 'P2', supplier: PK, warehouse: 0, lines: [{ sku: 'PL-003', qty: 30, price: 36_000 }, { sku: 'PL-004', qty: 50, price: 13_000 }] },
    { day: 36, kind: 'po.send', key: 'P2' },
    { day: 36, kind: 'sop.open', key: 'S1', warehouse: 0, note: tag('DEMO-SOP-01', 'Opname perlengkapan Cabang Margonda') },
    { day: 36, kind: 'sop.count', key: 'S1', variances: { 'PL-001': -1, 'PL-002': 1, 'PL-004': -2 } },
    { day: 35, kind: 'sop.close', key: 'S1', note: tag('DEMO-SOP-01', 'Opname Cabang Margonda, selisih disetujui') },
    { day: 34, kind: 'po.receive', key: 'P2' },

    { day: 30, kind: 'req.create', key: 'L2', requester: 'staff', reason: tag('DEMO-REQ-02', 'Plastik kemasan cadangan'), lines: [{ sku: 'PL-003', qty: 30 }] },
    { day: 28, kind: 'req.create', key: 'L3', requester: 'staff', reason: tag('DEMO-REQ-03', 'Hanger untuk Kukusan'), lines: [{ sku: 'PL-004', qty: 40 }] },
    { day: 28, kind: 'req.submit', key: 'L3' },
    { day: 27, kind: 'req.create', key: 'L4', requester: 'staff', reason: tag('DEMO-REQ-04', 'Deterjen cair bulan depan'), lines: [{ sku: 'PL-001', qty: 30 }] },
    { day: 27, kind: 'req.submit', key: 'L4' },
    { day: 26, kind: 'req.decide', key: 'L4', approver: 'manager', approve: true },
    { day: 25, kind: 'po.create', key: 'P4', supplier: KB, warehouse: 0, lines: [{ sku: 'PL-001', qty: 12, price: 68_000 }] },
    { day: 24, kind: 'po.cancel', key: 'P4' },
    { day: 24, kind: 'req.create', key: 'L5', requester: 'staff', reason: tag('DEMO-REQ-05', 'Hanger 100 pack, jumlah terlalu besar'), lines: [{ sku: 'PL-004', qty: 100 }] },
    { day: 24, kind: 'req.submit', key: 'L5' },
    { day: 23, kind: 'req.decide', key: 'L5', approver: 'owner', approve: false },

    { day: 22, kind: 'req.create', key: 'L1', requester: 'staff', reason: tag('DEMO-REQ-01', 'Deterjen cair untuk dua cabang'), lines: [{ sku: 'PL-001', qty: 24 }] },
    { day: 21, kind: 'req.submit', key: 'L1' },
    { day: 20, kind: 'req.decide', key: 'L1', approver: 'manager', approve: true },
    { day: 20, kind: 'trf.create', key: 'T2', from: 0, to: 1, note: tag('DEMO-TRF-02', 'Hanger susulan Cabang Kukusan'), lines: [{ sku: 'PL-004', qty: 10 }] },
    { day: 19, kind: 'req.convert', key: 'L1', warehouse: 0, poKey: 'P3' },
    { day: 18, kind: 'po.send', key: 'P3' },
    { day: 17, kind: 'trf.ship', key: 'T2' },
    { day: 16, kind: 'trf.create', key: 'T3', from: 0, to: 1, note: tag('DEMO-TRF-03', 'Plastik kemasan untuk Kukusan (belum dikirim)'), lines: [{ sku: 'PL-003', qty: 5 }] },

    { day: 13, kind: 'po.create', key: 'P6', supplier: PK, warehouse: 0, lines: [{ sku: 'PL-004', qty: 30, price: 13_000 }] },
    { day: 12, kind: 'po.cancel', key: 'P6' },
    { day: 10, kind: 'po.receive', key: 'P3' },

    { day: 15, kind: 'sop.open', key: 'S2', warehouse: 1, note: tag('DEMO-SOP-02', 'Opname Cabang Kukusan, sedang berjalan') },
    { day: 15, kind: 'sop.count', key: 'S2', variances: {}, fraction: 0.5 },

    { day: 9, kind: 'reorder.generate', key: 'G1' },
    { day: 6, kind: 'po.create', key: 'P5', supplier: PK, warehouse: 1, lines: [{ sku: 'PL-003', qty: 20, price: 36_000 }] },
  ];
}

const BUILDERS: Record<string, () => E[]> = {
  kopisenja: kopiSenja,
  rotinusantara: rotiNusantara,
  laundrysegar: laundrySegar,
};

/** Urut dari yang paling lama; urutan tulisan dipertahankan untuk peristiwa di hari yang sama. */
export function sortChronologically(events: E[]): E[] {
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.day - a.e.day || a.i - b.i)
    .map((x) => x.e);
}

/** Usaha di luar tiga contoh tidak punya rencana (kosong), bukan error. */
export function buildSupplyPlan(biz: Pick<BusinessSeed, 'key'>): SupplyPlan {
  const build = BUILDERS[biz.key];
  return { events: build ? sortChronologically(build()) : [], performanceWindows: WINDOWS };
}

/** Stok yang diharapkan tetap di/bawah titik pesan ulang di akhir rencana, per usaha. */
export const EXPECTED_LOW: Record<string, string[]> = {
  kopisenja: ['KS-008@0'],
  rotinusantara: ['BB-004@0'],
  laundrysegar: ['PL-002@0'],
};
