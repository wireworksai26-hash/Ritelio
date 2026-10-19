import type { CrmPlan } from './crm-plan';

/**
 * Isi rencana CRM tiga usaha. Semua nama, telepon, dan email rekaan (TLD .test / example.com).
 *
 * Tiap usaha dirancang agar aging piutang punya kelima ember (belum jatuh tempo, 1-30, 31-60, 61-90, >90 hari),
 * ada faktur lunas, sebagian, dan belum dibayar, penawaran di semua status, pesanan di semua status,
 * peluang di semua tahap, dan keluhan terbuka, diproses, serta selesai.
 * Jumlah barang berstok dijaga di bawah jatah B2B stok awal (lihat crm-plan.spec.ts).
 */

const email = (slug: string, who: string) => `${who}@${slug}.example.com`;

// ───────────────────────────── Kopi Senja ─────────────────────────────
const REMOTE = 'Komunitas Kerja Remote Jakarta';
const MAJU = 'PT Maju Bersama Konsultan';
const BUDI = 'Budi Hartono (member)';
const COWORK = 'Co-working Ruang Senopati';
const NOTARIS = 'Kantor Notaris Wirawan';

const KOPI_SENJA: CrmPlan = {
  leads: [
    { tag: 'L01', name: COWORK, contact: 'Gita Anjani', phone: '0812-7700-0101', email: email('ruangsenopati', 'gita.anjani'), source: 'Referensi pelanggan', note: 'Butuh pasokan kopi untuk area kerja bersama.', ageDays: 130, end: 'converted', closedAgo: 112, customer: { term: 14, city: 'Jakarta', address: 'Jl. Senopati Raya No. 31, Jakarta Selatan' } },
    { tag: 'L02', name: NOTARIS, contact: 'Wirawan Adiputra', phone: '0812-7700-0102', email: email('notariswirawan', 'wirawan'), source: 'Kunjungan langsung', note: 'Menyajikan kopi untuk klien kantor.', ageDays: 105, end: 'converted', closedAgo: 92, customer: { term: 30, city: 'Jakarta', address: 'Jl. Wijaya I No. 7, Jakarta Selatan' } },
    { tag: 'L03', name: 'Hotel Boutique Dago Asri', contact: 'Maya Kusuma', phone: '0812-7700-0103', email: email('dagoasri', 'maya.kusuma'), source: 'Pameran kuliner', note: 'Tertarik paket kopi sarapan untuk kamar.', ageDays: 42, end: 'qualified' },
    { tag: 'L04', name: 'Event Organizer Panggung Muda', contact: 'Rangga Pratama', phone: '0812-7700-0104', email: email('panggungmuda', 'rangga'), source: 'Instagram', note: 'Mencari kopi untuk acara kampus.', ageDays: 24, end: 'contacted' },
    { tag: 'L05', name: 'Sekolah Alam Bandung', contact: 'Ibu Ratih', phone: '0812-7700-0105', email: email('sekolahalam', 'ratih'), source: 'Situs web', note: 'Menanyakan harga biji kopi untuk kantin guru.', ageDays: 6, end: 'new' },
    { tag: 'L06', name: 'Startup Teknologi Nusa', contact: 'Dion Saputra', phone: '0812-7700-0106', email: email('teknologinusa', 'dion'), source: 'LinkedIn', note: 'Langganan kopi mingguan untuk kantor.', ageDays: 3, end: 'new' },
    { tag: 'L07', name: 'Warung Kopi Pinggir Jalan', contact: 'Pak Haris', phone: '0812-7700-0107', email: email('warungpinggir', 'haris'), source: 'Kunjungan langsung', note: 'Harga dianggap terlalu tinggi.', ageDays: 72, end: 'lost', closedAgo: 55 },
    { tag: 'L08', name: 'Yayasan Peduli Lingkungan', contact: 'Sinta Maharani', phone: '0812-7700-0108', email: email('pedulilingkungan', 'sinta'), source: 'Referensi pelanggan', note: 'Kopi untuk kegiatan relawan akhir pekan.', ageDays: 31, end: 'contacted' },
    { tag: 'L09', name: 'Klub Sepeda Senopati', contact: 'Bram Setiawan', phone: '0812-7700-0109', email: email('klubsepeda', 'bram'), source: 'Instagram', note: 'Sudah memakai pemasok lain.', ageDays: 85, end: 'lost', closedAgo: 60 },
  ],
  opps: [
    { tag: 'O01', title: 'Paket kopi kantor bulanan', customer: MAJU, ageDays: 128, end: 'closed_won', closedAgo: 124, expectCloseInDays: -120, note: 'Disepakati paket kopi dan biji untuk ruang rapat.' },
    { tag: 'O02', title: 'Langganan kopi co-working', customer: COWORK, lead: 'L01', ageDays: 104, end: 'closed_won', closedAgo: 99, expectCloseInDays: -97, note: 'Pengiriman dua kali sebulan.' },
    { tag: 'O03', title: 'Pasokan biji kopi kantor notaris', customer: NOTARIS, lead: 'L02', ageDays: 82, end: 'closed_won', closedAgo: 77, expectCloseInDays: -75, note: 'Fokus pada biji kopi untuk mesin kantor.' },
    { tag: 'O04', title: 'Kopi acara komunitas remote', customer: REMOTE, ageDays: 16, end: 'closed_won', closedAgo: 12, expectCloseInDays: -10, note: 'Acara tahunan komunitas.' },
    { tag: 'O05', title: 'Coffee break seminar tahunan', customer: MAJU, ageDays: 11, end: 'proposal', expectCloseInDays: 21, note: 'Menunggu persetujuan anggaran klien.' },
    { tag: 'O06', title: 'Kerja sama hotel boutique Dago', lead: 'L03', ageDays: 38, end: 'qualification', value: 18_000_000, expectCloseInDays: 45, note: 'Survei kebutuhan sarapan kamar.' },
    { tag: 'O07', title: 'Pasokan kopi acara kampus', lead: 'L04', ageDays: 20, end: 'prospecting', value: 6_500_000, expectCloseInDays: 62, note: 'Baru kontak pertama.' },
    { tag: 'O08', title: 'Paket hadiah biji kopi akhir tahun', customer: MAJU, ageDays: 58, end: 'closed_lost', closedAgo: 40, expectCloseInDays: -38, note: 'Klien memilih paket dari kompetitor.' },
    { tag: 'O09', title: 'Kopi rapat tahunan komunitas', customer: REMOTE, ageDays: 72, end: 'closed_lost', closedAgo: 36, expectCloseInDays: -34, note: 'Penawaran kedaluwarsa tanpa jawaban.' },
    { tag: 'O10', title: 'Kopi kegiatan relawan', lead: 'L08', ageDays: 29, end: 'qualification', value: 4_200_000, expectCloseInDays: 33, note: 'Menunggu jadwal kegiatan.' },
    { tag: 'O11', title: 'Perpanjangan langganan co-working', customer: COWORK, ageDays: 22, end: 'negotiation', expectCloseInDays: 12, note: 'Negosiasi volume dan harga.' },
    { tag: 'O12', title: 'Paket kopi ulang tahun perusahaan', customer: MAJU, ageDays: 5, end: 'prospecting', value: 9_000_000, expectCloseInDays: 95, note: 'Rencana acara awal tahun depan.' },
  ],
  quotations: [
    { tag: 'Q01', customer: MAJU, opp: 'O01', ageDays: 128, validDays: 30, note: 'Paket kopi kantor bulan pertama.', end: 'converted', lines: [{ sku: 'KS-004', qty: 20, price: 22000 }, { sku: 'KS-002', qty: 10 }, { sku: 'KS-011', qty: 4 }] },
    { tag: 'Q02', customer: COWORK, opp: 'O02', ageDays: 104, validDays: 30, note: 'Pengiriman perdana co-working.', end: 'converted', lines: [{ sku: 'KS-002', qty: 8 }, { sku: 'KS-003', qty: 8 }, { sku: 'KS-005', qty: 6 }] },
    { tag: 'Q03', customer: NOTARIS, opp: 'O03', ageDays: 82, validDays: 30, note: 'Biji kopi untuk kantor.', end: 'converted', lines: [{ sku: 'KS-011', qty: 2 }, { sku: 'KS-012', qty: 4, price: 62000 }] },
    { tag: 'Q04', customer: REMOTE, opp: 'O04', ageDays: 16, validDays: 21, note: 'Kopi untuk acara komunitas.', end: 'converted', lines: [{ sku: 'KS-001', qty: 12 }, { sku: 'KS-007', qty: 10 }, { sku: 'KS-009', qty: 4 }] },
    { tag: 'Q05', customer: MAJU, opp: 'O05', ageDays: 11, validDays: 21, note: 'Coffee break seminar tahunan.', end: 'sent', lines: [{ sku: 'KS-004', qty: 40, price: 22000 }, { sku: 'KS-010', qty: 15 }, { sku: 'KS-009', qty: 15 }] },
    { tag: 'Q06', customer: MAJU, opp: 'O08', ageDays: 58, validDays: 30, note: 'Paket hadiah akhir tahun.', end: 'rejected', lines: [{ sku: 'KS-011', qty: 10 }, { sku: 'KS-012', qty: 10 }] },
    { tag: 'Q07', customer: REMOTE, opp: 'O09', ageDays: 72, validDays: 30, note: 'Kopi rapat tahunan.', end: 'expired', lines: [{ sku: 'KS-004', qty: 30 }, { sku: 'KS-003', qty: 15 }] },
    { tag: 'Q08', customer: NOTARIS, ageDays: 3, validDays: 30, note: 'Draf pesanan ulang biji kopi.', end: 'draft', lines: [{ sku: 'KS-012', qty: 8 }, { sku: 'KS-011', qty: 3 }] },
    { tag: 'Q09', customer: COWORK, opp: 'O11', ageDays: 20, validDays: 45, note: 'Perpanjangan langganan.', end: 'accepted', lines: [{ sku: 'KS-004', qty: 20, price: 22000 }, { sku: 'KS-005', qty: 10 }] },
  ],
  orders: [
    { tag: 'S01', customer: MAJU, quotation: 'Q01', ageDays: 124, outletIdx: 0, end: 'fulfilled', confirmAgo: 123, fulfilAgo: 122, note: 'Paket kopi kantor.', payments: [{ ago: 100, pct: 50, method: 'transfer' }, { ago: 88, pct: 'rest', method: 'transfer' }] },
    { tag: 'S02', customer: COWORK, quotation: 'Q02', ageDays: 100, outletIdx: 0, end: 'fulfilled', confirmAgo: 99, fulfilAgo: 96, note: 'Pengiriman co-working.', payments: [{ ago: 70, pct: 60, method: 'transfer' }] },
    { tag: 'S03', customer: NOTARIS, quotation: 'Q03', ageDays: 78, outletIdx: 0, end: 'fulfilled', confirmAgo: 77, fulfilAgo: 74, note: 'Biji kopi kantor notaris.' },
    { tag: 'S04', customer: REMOTE, quotation: 'Q04', ageDays: 12, outletIdx: 0, end: 'confirmed', confirmAgo: 11, note: 'Menunggu tanggal acara.' },
    { tag: 'S05', customer: MAJU, ageDays: 37, outletIdx: 0, end: 'fulfilled', confirmAgo: 36, fulfilAgo: 35, note: 'Pesanan ulang ruang rapat.', lines: [{ sku: 'KS-001', qty: 10 }, { sku: 'KS-003', qty: 8 }, { sku: 'KS-009', qty: 4 }], payments: [{ ago: 12, pct: 40, method: 'qris' }] },
    { tag: 'S06', customer: COWORK, ageDays: 5, outletIdx: 0, end: 'draft', note: 'Draf pesanan tambahan.', lines: [{ sku: 'KS-004', qty: 15 }] },
    { tag: 'S07', customer: MAJU, ageDays: 46, outletIdx: 0, end: 'cancelled', confirmAgo: 45, cancelAgo: 40, note: 'Dibatalkan klien karena acara diundur.', lines: [{ sku: 'KS-010', qty: 10 }, { sku: 'KS-009', qty: 10 }] },
    { tag: 'S08', customer: NOTARIS, ageDays: 62, outletIdx: 0, end: 'fulfilled', confirmAgo: 61, fulfilAgo: 60, note: 'Biji kopi dan teh tarik.', lines: [{ sku: 'KS-012', qty: 3 }, { sku: 'KS-007', qty: 10 }], payments: [{ ago: 48, pct: 'rest', method: 'cash' }] },
  ],
  creditSales: [
    { tag: 'C01', customer: REMOTE, ageDays: 140, hour: 11, outletIdx: 0, role: 'manager', lines: [{ sku: 'KS-004', qty: 4 }, { sku: 'KS-001', qty: 6 }] },
    { tag: 'C02', customer: MAJU, ageDays: 50, hour: 14, outletIdx: 0, role: 'cashier', lines: [{ sku: 'KS-004', qty: 6 }, { sku: 'KS-005', qty: 4 }] },
    { tag: 'C03', customer: REMOTE, ageDays: 8, hour: 10, outletIdx: 0, role: 'cashier', lines: [{ sku: 'KS-003', qty: 4 }, { sku: 'KS-002', qty: 4 }] },
    { tag: 'C04', customer: NOTARIS, ageDays: 25, hour: 15, outletIdx: 0, role: 'cashier', lines: [{ sku: 'KS-011', qty: 1 }, { sku: 'KS-012', qty: 2 }], payments: [{ ago: 10, pct: 'rest', method: 'transfer' }] },
  ],
  interactions: [
    { tag: 'I01', customer: MAJU, type: 'meeting', summary: 'Presentasi paket kopi kantor', detail: 'Bertemu bagian umum; contoh seduhan dan harga langganan dibahas.', ago: 129, by: 'manager' },
    { tag: 'I02', customer: MAJU, type: 'call', summary: 'Menanyakan anggaran coffee break seminar', detail: 'Menunggu persetujuan atasan klien paling lambat dua minggu.', ago: 9, by: 'manager' },
    { tag: 'I03', customer: MAJU, type: 'email', summary: 'Kirim ulang penawaran hadiah akhir tahun', detail: 'Klien meminta rincian pilihan kemasan.', ago: 56, by: 'admin' },
    { tag: 'I04', customer: REMOTE, type: 'visit', summary: 'Kunjungan ke ruang komunitas', detail: 'Mengamati kebutuhan seduhan untuk acara bulanan.', ago: 46, by: 'manager' },
    { tag: 'I05', customer: REMOTE, type: 'call', summary: 'Konfirmasi jadwal pengiriman acara', detail: 'Pengiriman dijadwalkan sehari sebelum acara.', ago: 6, by: 'cashier' },
    { tag: 'I06', customer: COWORK, type: 'email', summary: 'Rincian jadwal pengiriman dua mingguan', detail: 'Pengiriman setiap Senin dan Kamis pukul 08.00.', ago: 92, by: 'admin' },
    { tag: 'I07', customer: COWORK, type: 'meeting', summary: 'Evaluasi langganan tiga bulan', detail: 'Klien puas, minta tambah varian non-kopi.', ago: 21, by: 'manager' },
    { tag: 'I08', customer: NOTARIS, type: 'call', summary: 'Pesanan ulang biji kopi', detail: 'Stok biji di kantor tinggal dua pekan.', ago: 24, by: 'cashier' },
    { tag: 'I09', customer: BUDI, type: 'note', summary: 'Menanyakan poin member', detail: 'Poin akan diinformasikan dari struk berikutnya.', ago: 15, by: 'cashier' },
  ],
  complaints: [
    { tag: 'K01', customer: BUDI, title: 'Kopi susu terlalu manis', description: 'Pesanan Kopi Susu Senja terasa jauh lebih manis dari biasanya.', ago: 26, end: 'resolved', resolution: 'Minuman diganti dan barista diingatkan takaran gula.', resolvedAgo: 25, linkSale: true },
    { tag: 'K02', customer: REMOTE, title: 'Pengiriman terlambat sehari', description: 'Pesanan untuk acara tiba sehari setelah jadwal.', ago: 13, end: 'in_progress' },
    { tag: 'K03', customer: MAJU, title: 'Selisih jumlah pada faktur', description: 'Jumlah cangkir pada faktur berbeda dari barang yang diterima.', ago: 31, end: 'resolved', resolution: 'Faktur diperiksa ulang dan selisih dijelaskan lewat surat jalan.', resolvedAgo: 28 },
    { tag: 'K04', customer: BUDI, title: 'Struk tidak keluar', description: 'Printer struk di kasir tidak mencetak pada kunjungan terakhir.', ago: 4, end: 'open', linkSale: true },
    { tag: 'K05', customer: REMOTE, title: 'Kemasan cangkir penyok', description: 'Beberapa cangkir kemasan penyok saat tiba.', ago: 2, end: 'open' },
  ],
};

// ───────────────────────────── Roti Nusantara ─────────────────────────────
const TITIK = 'Kafe Titik Temu';
const RATNA = 'Toko Kue Bu Ratna';
const MELATI = 'Hotel Melati Indah';
const SINAR = 'Koperasi Karyawan Sinar';
const KATERING = 'Katering Nasi Box Berkah';
const PADANG = 'Resto Padang Sederhana';

const ROTI_NUSANTARA: CrmPlan = {
  leads: [
    { tag: 'L01', name: PADANG, contact: 'Uda Zulkifli', phone: '0812-7800-0101', email: email('padangsederhana', 'zulkifli'), source: 'Kunjungan langsung', note: 'Mencari pemasok roti untuk menu sarapan.', ageDays: 118, end: 'converted', closedAgo: 98, customer: { term: 14, city: 'Depok', address: 'Jl. Raya Sawangan No. 55, Depok' } },
    { tag: 'L02', name: KATERING, contact: 'Ibu Berkah', phone: '0812-7800-0102', email: email('nasiboxberkah', 'berkah'), source: 'Referensi pelanggan', note: 'Butuh roti dan bahan kue dalam jumlah rutin.', ageDays: 70, end: 'converted', closedAgo: 52, customer: { term: 30, city: 'Depok', address: 'Jl. Kelapa Dua No. 12, Depok' } },
    { tag: 'L03', name: 'Hotel Griya Margonda', contact: 'Hendri Gunawan', phone: '0812-7800-0103', email: email('griyamargonda', 'hendri'), source: 'Pameran kuliner', note: 'Roti tawar dan croissant untuk sarapan.', ageDays: 36, end: 'qualified' },
    { tag: 'L04', name: 'Sekolah Islam Terpadu Al-Falah', contact: 'Ustazah Rina', phone: '0812-7800-0104', email: email('alfalah', 'rina'), source: 'Situs web', note: 'Pesanan roti untuk kegiatan sekolah.', ageDays: 19, end: 'contacted' },
    { tag: 'L05', name: 'Toko Oleh-oleh Depok Manis', contact: 'Pak Dedi', phone: '0812-7800-0105', email: email('olehdepok', 'dedi'), source: 'Instagram', note: 'Tertarik bolu gulung untuk dititip.', ageDays: 7, end: 'new' },
    { tag: 'L06', name: 'Kafe Dessert Manis Rasa', contact: 'Citra Ayu', phone: '0812-7800-0106', email: email('dessertmanis', 'citra'), source: 'Instagram', note: 'Menanyakan croissant untuk kafe.', ageDays: 2, end: 'new' },
    { tag: 'L07', name: 'Warung Sarapan Pagi', contact: 'Bu Wati', phone: '0812-7800-0107', email: email('sarapanpagi', 'wati'), source: 'Kunjungan langsung', note: 'Volume terlalu kecil untuk pengiriman.', ageDays: 80, end: 'lost', closedAgo: 66 },
    { tag: 'L08', name: 'Klinik Bersalin Sehat', contact: 'Bidan Sari', phone: '0812-7800-0108', email: email('bersalinsehat', 'sari'), source: 'Referensi pelanggan', note: 'Roti untuk konsumsi pasien.', ageDays: 27, end: 'contacted' },
    { tag: 'L09', name: 'Kantin Pabrik Garmen Sinar Jaya', contact: 'Pak Agus', phone: '0812-7800-0109', email: email('garmensinarjaya', 'agus'), source: 'Pameran kuliner', note: 'Donat untuk kantin karyawan.', ageDays: 44, end: 'qualified' },
  ],
  opps: [
    { tag: 'O01', title: 'Pasokan roti sarapan hotel', customer: MELATI, ageDays: 135, end: 'closed_won', closedAgo: 131, expectCloseInDays: -128, note: 'Kontrak sarapan bulanan.' },
    { tag: 'O02', title: 'Bahan baku untuk toko kue', customer: RATNA, ageDays: 109, end: 'closed_won', closedAgo: 104, expectCloseInDays: -102, note: 'Pasokan tepung, gula, dan telur.' },
    { tag: 'O03', title: 'Roti dan kemasan untuk kafe', customer: TITIK, ageDays: 79, end: 'closed_won', closedAgo: 74, expectCloseInDays: -72, note: 'Pengiriman dua kali seminggu.' },
    { tag: 'O04', title: 'Bahan dan roti katering nasi box', customer: KATERING, lead: 'L02', ageDays: 34, end: 'closed_won', closedAgo: 29, expectCloseInDays: -27, note: 'Pengiriman bulanan.' },
    { tag: 'O05', title: 'Donat dan roti koperasi karyawan', customer: SINAR, ageDays: 10, end: 'proposal', expectCloseInDays: 18, note: 'Menunggu persetujuan pengurus koperasi.' },
    { tag: 'O06', title: 'Roti sarapan hotel Griya Margonda', lead: 'L03', ageDays: 33, end: 'qualification', value: 24_000_000, expectCloseInDays: 40, note: 'Uji coba sampel roti.' },
    { tag: 'O07', title: 'Donat kantin pabrik garmen', lead: 'L09', ageDays: 21, end: 'prospecting', value: 15_000_000, expectCloseInDays: 70, note: 'Menunggu kuota kantin.' },
    { tag: 'O08', title: 'Roti dan bolu untuk acara kafe', customer: TITIK, ageDays: 61, end: 'closed_lost', closedAgo: 44, expectCloseInDays: -42, note: 'Anggaran kafe dipangkas.' },
    { tag: 'O09', title: 'Pasokan bahan toko kue musiman', customer: RATNA, ageDays: 69, end: 'closed_lost', closedAgo: 33, expectCloseInDays: -31, note: 'Penawaran tidak dijawab sampai kedaluwarsa.' },
    { tag: 'O10', title: 'Roti konsumsi klinik bersalin', lead: 'L08', ageDays: 26, end: 'qualification', value: 5_400_000, expectCloseInDays: 28, note: 'Menunggu jadwal pasien rawat inap.' },
    { tag: 'O11', title: 'Perpanjangan kontrak sarapan hotel', customer: MELATI, ageDays: 19, end: 'negotiation', expectCloseInDays: 10, note: 'Negosiasi harga baru.' },
    { tag: 'O12', title: 'Kue pesanan akhir tahun', customer: RATNA, ageDays: 4, end: 'prospecting', value: 12_000_000, expectCloseInDays: 100, note: 'Perkiraan pesanan Desember.' },
  ],
  quotations: [
    { tag: 'Q01', customer: MELATI, opp: 'O01', ageDays: 135, validDays: 30, note: 'Roti sarapan hotel bulan pertama.', end: 'converted', lines: [{ sku: 'RN-001', qty: 3, price: 17000 }, { sku: 'RN-003', qty: 8, price: 5500 }, { sku: 'RN-005', qty: 2 }] },
    { tag: 'Q02', customer: RATNA, opp: 'O02', ageDays: 109, validDays: 30, note: 'Bahan baku toko kue.', end: 'converted', lines: [{ sku: 'BB-001', qty: 30, price: 12500 }, { sku: 'BB-002', qty: 10, price: 16500 }, { sku: 'BB-005', qty: 8, price: 29000 }] },
    { tag: 'Q03', customer: TITIK, opp: 'O03', ageDays: 79, validDays: 21, note: 'Roti dan kotak kue untuk kafe.', end: 'converted', lines: [{ sku: 'RN-002', qty: 2 }, { sku: 'RN-005', qty: 2, price: 14000 }, { sku: 'KM-002', qty: 40, price: 2300 }] },
    { tag: 'Q04', customer: KATERING, opp: 'O04', ageDays: 34, validDays: 21, note: 'Bahan baku katering nasi box.', end: 'converted', lines: [{ sku: 'BB-001', qty: 20, price: 12500 }, { sku: 'BB-002', qty: 8, price: 16500 }, { sku: 'BB-006', qty: 4, price: 82000 }] },
    { tag: 'Q05', customer: SINAR, opp: 'O05', ageDays: 10, validDays: 21, note: 'Donat dan roti tawar untuk koperasi.', end: 'sent', lines: [{ sku: 'RN-003', qty: 40, price: 5500 }, { sku: 'RN-001', qty: 10, price: 17000 }] },
    { tag: 'Q06', customer: TITIK, opp: 'O08', ageDays: 61, validDays: 30, note: 'Roti dan bolu acara kafe.', end: 'rejected', lines: [{ sku: 'RN-004', qty: 4 }, { sku: 'RN-002', qty: 10 }] },
    { tag: 'Q07', customer: RATNA, opp: 'O09', ageDays: 69, validDays: 30, note: 'Bahan musiman.', end: 'expired', lines: [{ sku: 'BB-001', qty: 40, price: 12500 }, { sku: 'BB-007', qty: 8 }] },
    { tag: 'Q08', customer: PADANG, ageDays: 3, validDays: 30, note: 'Draf pasokan roti sarapan.', end: 'draft', lines: [{ sku: 'RN-001', qty: 10, price: 17000 }, { sku: 'RN-005', qty: 10 }] },
    { tag: 'Q09', customer: MELATI, opp: 'O11', ageDays: 17, validDays: 45, note: 'Perpanjangan sarapan hotel.', end: 'accepted', lines: [{ sku: 'RN-003', qty: 30, price: 5500 }, { sku: 'RN-005', qty: 10, price: 14000 }] },
  ],
  orders: [
    { tag: 'S01', customer: MELATI, quotation: 'Q01', ageDays: 131, outletIdx: 0, end: 'fulfilled', confirmAgo: 130, fulfilAgo: 128, note: 'Roti sarapan hotel.', payments: [{ ago: 105, pct: 50, method: 'transfer' }, { ago: 92, pct: 'rest', method: 'transfer' }] },
    { tag: 'S02', customer: RATNA, quotation: 'Q02', ageDays: 105, outletIdx: 0, end: 'fulfilled', confirmAgo: 104, fulfilAgo: 100, note: 'Bahan baku toko kue.', payments: [{ ago: 72, pct: 55, method: 'transfer' }] },
    { tag: 'S03', customer: TITIK, quotation: 'Q03', ageDays: 75, outletIdx: 0, end: 'fulfilled', confirmAgo: 74, fulfilAgo: 70, note: 'Roti dan kotak kue.' },
    { tag: 'S04', customer: KATERING, quotation: 'Q04', ageDays: 30, outletIdx: 0, end: 'fulfilled', confirmAgo: 29, fulfilAgo: 25, note: 'Bahan baku katering.' },
    { tag: 'S05', customer: SINAR, ageDays: 41, outletIdx: 0, end: 'fulfilled', confirmAgo: 41, fulfilAgo: 40, note: 'Donat untuk acara karyawan.', lines: [{ sku: 'RN-001', qty: 1, price: 17000 }, { sku: 'RN-003', qty: 4, price: 5500 }, { sku: 'KM-001', qty: 200, price: 700 }], payments: [{ ago: 20, pct: 50, method: 'cash' }] },
    { tag: 'S06', customer: PADANG, ageDays: 62, outletIdx: 0, end: 'fulfilled', confirmAgo: 61, fulfilAgo: 60, note: 'Tepung dan telur.', lines: [{ sku: 'BB-001', qty: 10, price: 12500 }, { sku: 'BB-005', qty: 4, price: 29000 }], payments: [{ ago: 46, pct: 'rest', method: 'qris' }] },
    { tag: 'S07', customer: TITIK, ageDays: 4, outletIdx: 0, end: 'draft', note: 'Draf pesanan donat.', lines: [{ sku: 'RN-003', qty: 12 }] },
    { tag: 'S08', customer: SINAR, ageDays: 51, outletIdx: 0, end: 'cancelled', confirmAgo: 50, cancelAgo: 47, note: 'Dibatalkan karena acara ditunda.', lines: [{ sku: 'RN-001', qty: 6 }] },
    { tag: 'S09', customer: RATNA, ageDays: 6, outletIdx: 0, end: 'confirmed', confirmAgo: 5, note: 'Menunggu pengambilan barang.', lines: [{ sku: 'BB-001', qty: 15, price: 12500 }] },
  ],
  creditSales: [
    { tag: 'C01', customer: MELATI, ageDays: 150, hour: 9, outletIdx: 0, role: 'manager', lines: [{ sku: 'RN-001', qty: 2 }, { sku: 'RN-003', qty: 3 }, { sku: 'KM-002', qty: 30 }] },
    { tag: 'C02', customer: TITIK, ageDays: 10, hour: 8, outletIdx: 0, role: 'cashier', lines: [{ sku: 'RN-005', qty: 1 }, { sku: 'RN-003', qty: 3 }, { sku: 'BB-003', qty: 2 }] },
    { tag: 'C03', customer: RATNA, ageDays: 55, hour: 10, outletIdx: 0, role: 'cashier', lines: [{ sku: 'RN-002', qty: 1 }, { sku: 'RN-003', qty: 3 }, { sku: 'BB-007', qty: 3 }], payments: [{ ago: 30, pct: 100, method: 'transfer' }] },
  ],
  interactions: [
    { tag: 'I01', customer: MELATI, type: 'meeting', summary: 'Kontrak sarapan hotel', detail: 'Pembahasan volume harian dan jam pengiriman pukul 05.30.', ago: 136, by: 'manager' },
    { tag: 'I02', customer: MELATI, type: 'call', summary: 'Negosiasi perpanjangan kontrak', detail: 'Hotel meminta harga tetap dengan tambahan croissant.', ago: 17, by: 'manager' },
    { tag: 'I03', customer: RATNA, type: 'visit', summary: 'Kunjungan ke toko kue', detail: 'Memeriksa kebutuhan bahan musim liburan.', ago: 108, by: 'manager' },
    { tag: 'I04', customer: RATNA, type: 'email', summary: 'Pengingat faktur belum lunas', detail: 'Sisa tagihan diingatkan lewat surel ke bagian keuangan.', ago: 35, by: 'admin' },
    { tag: 'I05', customer: TITIK, type: 'call', summary: 'Konfirmasi jadwal pengiriman kafe', detail: 'Pengiriman Selasa dan Jumat pagi.', ago: 77, by: 'cashier' },
    { tag: 'I06', customer: TITIK, type: 'note', summary: 'Permintaan rasa baru', detail: 'Kafe menanyakan donat rasa matcha.', ago: 12, by: 'cashier' },
    { tag: 'I07', customer: SINAR, type: 'meeting', summary: 'Rapat pengurus koperasi', detail: 'Menyerahkan penawaran donat dan roti tawar.', ago: 9, by: 'manager' },
    { tag: 'I08', customer: KATERING, type: 'call', summary: 'Pesanan ulang bahan baku', detail: 'Meminta jadwal tetap setiap tanggal 25.', ago: 24, by: 'admin' },
    { tag: 'I09', customer: PADANG, type: 'email', summary: 'Kirim katalog roti sarapan', detail: 'Katalog dan daftar harga dikirim lewat surel.', ago: 4, by: 'admin' },
  ],
  complaints: [
    { tag: 'K01', customer: MELATI, title: 'Roti tawar cepat berjamur', description: 'Dua bungkus roti tawar berjamur sebelum tanggal kedaluwarsa.', ago: 40, end: 'resolved', resolution: 'Roti diganti baru dan proses pendinginan di dapur diperiksa.', resolvedAgo: 38 },
    { tag: 'K02', customer: TITIK, title: 'Pengiriman terlambat', description: 'Roti tiba pukul 09.30, setelah kafe buka.', ago: 15, end: 'in_progress' },
    { tag: 'K03', customer: RATNA, title: 'Kemasan telur retak', description: 'Beberapa telur retak saat diterima.', ago: 44, end: 'resolved', resolution: 'Telur retak diganti pada pengiriman berikutnya.', resolvedAgo: 41 },
    { tag: 'K04', customer: SINAR, title: 'Jumlah donat kurang', description: 'Pesanan 10 donat hanya tiba delapan.', ago: 5, end: 'open' },
    { tag: 'K05', customer: KATERING, title: 'Kotak kue penyok', description: 'Kotak mika kemasan penyok saat tiba di dapur katering.', ago: 3, end: 'open' },
  ],
};

// ───────────────────────────── Laundry Segar Jaya ─────────────────────────────
const KOS = 'Kos Putri Melati';
const KLINIK = 'Klinik Sehat Sentosa';
const SERUNI = 'Hotel Seruni Asri';
const DEWI = 'Dewi Kartika (member)';
const BINTANG = 'Hotel Bintang Sawangan';
const ASRAMA = 'Asrama Putri Wisma Kukusan';

const LAUNDRY_SEGAR: CrmPlan = {
  leads: [
    { tag: 'L01', name: BINTANG, contact: 'Yuliana Prasetyo', phone: '0812-7900-0101', email: email('bintangsawangan', 'yuliana'), source: 'Referensi pelanggan', note: 'Cuci seprai dan handuk kamar setiap hari.', ageDays: 52, end: 'converted', closedAgo: 36, customer: { term: 30, city: 'Depok', address: 'Jl. Raya Sawangan Km 5, Depok' } },
    { tag: 'L02', name: ASRAMA, contact: 'Ibu Kartini', phone: '0812-7900-0102', email: email('wismakukusan', 'kartini'), source: 'Kunjungan langsung', note: 'Cuci kiloan penghuni asrama setiap pekan.', ageDays: 100, end: 'converted', closedAgo: 84, customer: { term: 14, city: 'Depok', address: 'Jl. Kukusan Teknik No. 40, Depok' } },
    { tag: 'L03', name: 'Salon Cantik Mandiri', contact: 'Mbak Rita', phone: '0812-7900-0103', email: email('saloncantik', 'rita'), source: 'Instagram', note: 'Handuk dan jubah salon setiap hari.', ageDays: 33, end: 'qualified' },
    { tag: 'L04', name: 'Restoran Warung Sunda', contact: 'Kang Asep', phone: '0812-7900-0104', email: email('warungsunda', 'asep'), source: 'Kunjungan langsung', note: 'Taplak meja dan seragam pelayan.', ageDays: 18, end: 'contacted' },
    { tag: 'L05', name: 'Homestay Kukusan Asri', contact: 'Pak Teguh', phone: '0812-7900-0105', email: email('homestaykukusan', 'teguh'), source: 'Situs web', note: 'Menanyakan paket cuci seprai.', ageDays: 6, end: 'new' },
    { tag: 'L06', name: 'Gym Fit Depok', contact: 'Coach Bayu', phone: '0812-7900-0106', email: email('gymfit', 'bayu'), source: 'Instagram', note: 'Handuk anggota dan lap alat.', ageDays: 2, end: 'new' },
    { tag: 'L07', name: 'Barbershop Rapi Selalu', contact: 'Mas Dika', phone: '0812-7900-0107', email: email('barbershoprapi', 'dika'), source: 'Kunjungan langsung', note: 'Memilih mencuci sendiri.', ageDays: 75, end: 'lost', closedAgo: 62 },
    { tag: 'L08', name: 'Panti Jompo Kasih Ibu', contact: 'Ibu Suster', phone: '0812-7900-0108', email: email('kasihibu', 'suster'), source: 'Referensi pelanggan', note: 'Cuci seprai dan pakaian penghuni.', ageDays: 29, end: 'contacted' },
    { tag: 'L09', name: 'Villa Puncak Kenanga', contact: 'Bu Lisa', phone: '0812-7900-0109', email: email('villakenanga', 'lisa'), source: 'Pameran kuliner', note: 'Perlu antar-jemput dari Puncak.', ageDays: 88, end: 'lost', closedAgo: 70 },
  ],
  opps: [
    { tag: 'O01', title: 'Kontrak cuci linen hotel', customer: SERUNI, ageDays: 143, end: 'closed_won', closedAgo: 139, expectCloseInDays: -137, note: 'Linen kamar dan handuk setiap pekan.' },
    { tag: 'O02', title: 'Cuci seragam dan linen klinik', customer: KLINIK, ageDays: 113, end: 'closed_won', closedAgo: 108, expectCloseInDays: -106, note: 'Seragam perawat dan sprei ranjang.' },
    { tag: 'O03', title: 'Cuci kiloan asrama putri', customer: ASRAMA, lead: 'L02', ageDays: 83, end: 'closed_won', closedAgo: 79, expectCloseInDays: -77, note: 'Cuci kiloan mingguan.' },
    { tag: 'O04', title: 'Linen hotel Bintang Sawangan', customer: BINTANG, lead: 'L01', ageDays: 31, end: 'closed_won', closedAgo: 27, expectCloseInDays: -25, note: 'Antar-jemput harian.' },
    { tag: 'O05', title: 'Perpanjangan kontrak klinik', customer: KLINIK, ageDays: 9, end: 'proposal', expectCloseInDays: 20, note: 'Menunggu persetujuan manajemen klinik.' },
    { tag: 'O06', title: 'Paket linen salon', lead: 'L03', ageDays: 30, end: 'qualification', value: 7_500_000, expectCloseInDays: 38, note: 'Mengukur volume handuk harian.' },
    { tag: 'O07', title: 'Cuci taplak restoran', lead: 'L04', ageDays: 16, end: 'prospecting', value: 3_600_000, expectCloseInDays: 60, note: 'Kontak awal.' },
    { tag: 'O08', title: 'Cuci karpet hotel', customer: SERUNI, ageDays: 62, end: 'closed_lost', closedAgo: 46, expectCloseInDays: -44, note: 'Hotel memakai pihak lain untuk karpet.' },
    { tag: 'O09', title: 'Cuci kiloan kos putri', customer: KOS, ageDays: 72, end: 'closed_lost', closedAgo: 34, expectCloseInDays: -32, note: 'Penawaran kedaluwarsa tanpa jawaban.' },
    { tag: 'O10', title: 'Cuci seprai panti jompo', lead: 'L08', ageDays: 27, end: 'qualification', value: 9_600_000, expectCloseInDays: 30, note: 'Survei kebutuhan seprai.' },
    { tag: 'O11', title: 'Perpanjangan kontrak asrama', customer: ASRAMA, ageDays: 18, end: 'negotiation', expectCloseInDays: 9, note: 'Negosiasi tarif per kilo.' },
    { tag: 'O12', title: 'Paket linen akhir tahun', customer: SERUNI, ageDays: 4, end: 'prospecting', value: 14_000_000, expectCloseInDays: 90, note: 'Perkiraan lonjakan tamu akhir tahun.' },
  ],
  quotations: [
    { tag: 'Q01', customer: SERUNI, opp: 'O01', ageDays: 143, validDays: 30, note: 'Cuci linen hotel bulan pertama.', end: 'converted', lines: [{ sku: 'LS-006', qty: 40, price: 35000 }, { sku: 'LS-001', qty: 150, price: 8000 }, { sku: 'LS-009', qty: 12, price: 8000 }] },
    { tag: 'Q02', customer: KLINIK, opp: 'O02', ageDays: 113, validDays: 30, note: 'Seragam dan linen klinik.', end: 'converted', lines: [{ sku: 'LS-001', qty: 120, price: 8000 }, { sku: 'LS-005', qty: 20, price: 40000 }] },
    { tag: 'Q03', customer: ASRAMA, opp: 'O03', ageDays: 83, validDays: 21, note: 'Cuci kiloan asrama.', end: 'converted', lines: [{ sku: 'LS-002', qty: 200, price: 5800 }, { sku: 'LS-009', qty: 20, price: 8000 }] },
    { tag: 'Q04', customer: BINTANG, opp: 'O04', ageDays: 31, validDays: 21, note: 'Linen hotel dan antar-jemput.', end: 'converted', lines: [{ sku: 'LS-006', qty: 30, price: 35000 }, { sku: 'LS-001', qty: 100, price: 8000 }] },
    { tag: 'Q05', customer: KLINIK, opp: 'O05', ageDays: 9, validDays: 21, note: 'Perpanjangan kontrak klinik.', end: 'sent', lines: [{ sku: 'LS-001', qty: 200, price: 7800 }, { sku: 'LS-004', qty: 30, price: 13000 }] },
    { tag: 'Q06', customer: SERUNI, opp: 'O08', ageDays: 62, validDays: 30, note: 'Cuci karpet hotel.', end: 'rejected', lines: [{ sku: 'LS-007', qty: 80, price: 13000 }] },
    { tag: 'Q07', customer: KOS, opp: 'O09', ageDays: 72, validDays: 30, note: 'Cuci kiloan kos putri.', end: 'expired', lines: [{ sku: 'LS-002', qty: 120, price: 5800 }] },
    { tag: 'Q08', customer: ASRAMA, ageDays: 2, validDays: 30, note: 'Draf paket cuci tambahan.', end: 'draft', lines: [{ sku: 'LS-003', qty: 60 }, { sku: 'LS-009', qty: 8, price: 8000 }] },
    { tag: 'Q09', customer: ASRAMA, opp: 'O11', ageDays: 16, validDays: 45, note: 'Perpanjangan kontrak asrama.', end: 'accepted', lines: [{ sku: 'LS-002', qty: 220, price: 5600 }] },
  ],
  orders: [
    { tag: 'S01', customer: SERUNI, quotation: 'Q01', ageDays: 139, outletIdx: 0, end: 'fulfilled', confirmAgo: 138, fulfilAgo: 135, note: 'Cuci linen hotel.', payments: [{ ago: 110, pct: 50, method: 'transfer' }, { ago: 98, pct: 'rest', method: 'transfer' }] },
    { tag: 'S02', customer: KLINIK, quotation: 'Q02', ageDays: 108, outletIdx: 0, end: 'fulfilled', confirmAgo: 107, fulfilAgo: 105, note: 'Seragam dan linen klinik.', payments: [{ ago: 75, pct: 55, method: 'transfer' }] },
    { tag: 'S03', customer: ASRAMA, quotation: 'Q03', ageDays: 79, outletIdx: 1, end: 'fulfilled', confirmAgo: 78, fulfilAgo: 65, note: 'Cuci kiloan asrama.' },
    { tag: 'S04', customer: BINTANG, quotation: 'Q04', ageDays: 27, outletIdx: 0, end: 'fulfilled', confirmAgo: 26, fulfilAgo: 20, note: 'Linen hotel Bintang.' },
    { tag: 'S05', customer: KOS, ageDays: 35, outletIdx: 1, end: 'fulfilled', confirmAgo: 35, fulfilAgo: 33, note: 'Cuci kiloan kos bulan lalu.', lines: [{ sku: 'LS-001', qty: 60, price: 8500 }, { sku: 'LS-009', qty: 6, price: 8000 }] },
    { tag: 'S06', customer: SERUNI, ageDays: 52, outletIdx: 0, end: 'fulfilled', confirmAgo: 51, fulfilAgo: 50, note: 'Cuci karpet dan linen tambahan.', lines: [{ sku: 'LS-001', qty: 80, price: 8000 }, { sku: 'LS-009', qty: 10, price: 8000 }], payments: [{ ago: 30, pct: 'rest', method: 'transfer' }] },
    { tag: 'S07', customer: KLINIK, ageDays: 3, outletIdx: 0, end: 'draft', note: 'Draf pesanan tambahan.', lines: [{ sku: 'LS-005', qty: 10, price: 40000 }] },
    { tag: 'S08', customer: KOS, ageDays: 48, outletIdx: 1, end: 'cancelled', confirmAgo: 47, cancelAgo: 44, note: 'Dibatalkan karena penghuni pindah.', lines: [{ sku: 'LS-002', qty: 40 }] },
    { tag: 'S09', customer: KLINIK, ageDays: 7, outletIdx: 0, end: 'confirmed', confirmAgo: 6, note: 'Menunggu jadwal jemput.', lines: [{ sku: 'LS-001', qty: 70, price: 8000 }] },
  ],
  creditSales: [
    { tag: 'C01', customer: SERUNI, ageDays: 145, hour: 16, outletIdx: 0, role: 'manager', lines: [{ sku: 'LS-001', qty: 60, price: 8500 }] },
    { tag: 'C02', customer: KOS, ageDays: 4, hour: 17, outletIdx: 1, role: 'cashier', lines: [{ sku: 'LS-001', qty: 15 }, { sku: 'LS-009', qty: 2 }] },
    { tag: 'C03', customer: KLINIK, ageDays: 20, hour: 10, outletIdx: 0, role: 'cashier', lines: [{ sku: 'LS-005', qty: 6, price: 42000 }], payments: [{ ago: 6, pct: 50, method: 'qris' }] },
    { tag: 'C04', customer: BINTANG, ageDays: 40, hour: 15, outletIdx: 0, role: 'cashier', lines: [{ sku: 'LS-004', qty: 8, price: 13000 }, { sku: 'PL-004', qty: 2 }], payments: [{ ago: 22, pct: 'rest', method: 'transfer' }] },
  ],
  interactions: [
    { tag: 'I01', customer: SERUNI, type: 'meeting', summary: 'Kontrak cuci linen hotel', detail: 'Pembahasan jadwal jemput dan standar kebersihan linen.', ago: 144, by: 'manager' },
    { tag: 'I02', customer: SERUNI, type: 'call', summary: 'Pengingat faktur lama', detail: 'Bagian keuangan hotel berjanji memproses pembayaran.', ago: 60, by: 'admin' },
    { tag: 'I03', customer: KLINIK, type: 'visit', summary: 'Kunjungan ke klinik', detail: 'Mengambil contoh seragam untuk uji cuci.', ago: 118, by: 'manager' },
    { tag: 'I04', customer: KLINIK, type: 'email', summary: 'Kirim penawaran perpanjangan', detail: 'Penawaran perpanjangan kontrak dikirim ke manajemen.', ago: 9, by: 'admin' },
    { tag: 'I05', customer: KOS, type: 'call', summary: 'Konfirmasi jadwal jemput cucian', detail: 'Penjemputan setiap Selasa sore.', ago: 33, by: 'cashier' },
    { tag: 'I06', customer: ASRAMA, type: 'meeting', summary: 'Evaluasi layanan asrama', detail: 'Pengelola puas; meminta tarif lebih rendah untuk volume naik.', ago: 18, by: 'manager' },
    { tag: 'I07', customer: BINTANG, type: 'call', summary: 'Penjadwalan antar-jemput harian', detail: 'Jemput pukul 07.00 dan antar sebelum pukul 17.00.', ago: 34, by: 'cashier' },
    { tag: 'I08', customer: DEWI, type: 'note', summary: 'Menanyakan poin member', detail: 'Poin ditukar potongan harga pada cuci berikutnya.', ago: 11, by: 'cashier' },
    { tag: 'I09', customer: SERUNI, type: 'email', summary: 'Penawaran paket akhir tahun', detail: 'Draf paket linen untuk musim liburan dikirim.', ago: 4, by: 'manager' },
  ],
  complaints: [
    { tag: 'K01', customer: DEWI, title: 'Pakaian luntur', description: 'Satu kemeja putih bernoda warna setelah dicuci bersama pakaian berwarna.', ago: 30, end: 'resolved', resolution: 'Kemeja dicuci ulang dan diberi potongan harga pada cucian berikutnya.', resolvedAgo: 28, linkSale: true },
    { tag: 'K02', customer: KLINIK, title: 'Seragam kurang satu potong', description: 'Satu seragam perawat tidak ada dalam pengantaran.', ago: 14, end: 'in_progress' },
    { tag: 'K03', customer: SERUNI, title: 'Antar-jemput terlambat', description: 'Linen tiba terlambat dua jam dari jadwal.', ago: 45, end: 'resolved', resolution: 'Rute kurir disesuaikan agar tiba sebelum pukul 10.00.', resolvedAgo: 42 },
    { tag: 'K04', customer: DEWI, title: 'Kancing baju hilang', description: 'Dua kancing blus hilang setelah dicuci.', ago: 5, end: 'open', linkSale: true },
    { tag: 'K05', customer: KOS, title: 'Selisih berat cucian', description: 'Berat di struk berbeda dari timbangan penghuni.', ago: 2, end: 'open' },
  ],
};

export const CRM_PLANS: Record<string, CrmPlan> = {
  kopisenja: KOPI_SENJA,
  rotinusantara: ROTI_NUSANTARA,
  laundrysegar: LAUNDRY_SEGAR,
};
