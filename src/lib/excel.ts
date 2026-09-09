// Helper utilitas untuk Export & Import Excel (.xlsx), Google Sheets Link, Template Generator, dan AI Column Mapping
import * as XLSX from 'xlsx';
import type { SalesTransaction } from '../types';
import { useAiConfigStore } from '../stores/aiConfigStore';

export interface ColumnMappingResult {
  header: string;
  mappedField: 'name' | 'sku' | 'category' | 'sell_price' | 'cost_price' | 'quantity' | 'unit' | 'ignore';
  confidence: number;
  reason?: string;
}

export interface ParsedSheetData {
  sourceType: 'excel' | 'google_sheet';
  sourceName: string;
  sheetNames: string[];
  activeSheet: string;
  headers: string[];
  rows: string[][];
  rawTotalRows: number;
}

/**
 * 1. Export Laporan Penjualan Riil ke Format Excel Native (.xlsx)
 */
export function exportSalesTransactionsToXLSX(
  transactions: SalesTransaction[],
  productNameGetter?: (id: string) => string,
  outletNameGetter?: (id: string) => string,
  customFilename?: string,
) {
  const getProdName = productNameGetter || ((id: string) => id);
  const getOutletName = outletNameGetter || ((id: string) => id);

  // 1. Data Transaksi Detail
  const txHeaders = [
    'ID Transaksi',
    'Tanggal & Waktu',
    'Outlet / Cabang',
    'Metode Pembayaran',
    'Total Pembayaran (Rp)',
    'Status Sinkronisasi',
    'Rincian Produk Terjual',
  ];

  const txData = transactions.map((tx) => {
    const itemsDetail = tx.items
      .map((item) => `${getProdName(item.product_id)} (${item.qty}x @Rp ${item.price.toLocaleString('id-ID')})`)
      .join(' | ');

    return [
      tx.id,
      new Date(tx.client_timestamp).toLocaleString('id-ID'),
      getOutletName(tx.outlet_id),
      tx.payment_method.toUpperCase(),
      tx.total,
      tx.sync_status === 'synced' ? 'Tersinkron' : 'Pending',
      itemsDetail,
    ];
  });

  const wsTx = XLSX.utils.aoa_to_sheet([txHeaders, ...txData]);

  // Lebar kolom rapi
  wsTx['!cols'] = [
    { wch: 18 }, // ID
    { wch: 22 }, // Tanggal
    { wch: 18 }, // Outlet
    { wch: 18 }, // Metode
    { wch: 22 }, // Total
    { wch: 18 }, // Status
    { wch: 50 }, // Rincian
  ];

  // 2. Data Ringkasan Eksekutif
  const totalOmzet = transactions.reduce((acc, tx) => acc + (tx.total || 0), 0);
  const totalItemsSold = transactions.reduce((acc, tx) => acc + tx.items.reduce((sum, i) => sum + i.qty, 0), 0);
  const qrisCount = transactions.filter((t) => t.payment_method === 'qris').length;
  const cashCount = transactions.filter((t) => t.payment_method === 'cash').length;
  const debitCount = transactions.filter((t) => t.payment_method === 'debit').length;
  const transferCount = transactions.filter((t) => t.payment_method === 'transfer').length;

  const summaryHeaders = ['Metrik Ringkasan', 'Nilai'];
  const summaryData = [
    ['Total Transaksi', transactions.length],
    ['Total Omzet Penjualan (Rp)', totalOmzet],
    ['Rata-rata Nilai Transaksi (Rp)', transactions.length ? Math.round(totalOmzet / transactions.length) : 0],
    ['Total Produk Terjual (Qty)', totalItemsSold],
    ['Transaksi QRIS', qrisCount],
    ['Transaksi Tunai (Cash)', cashCount],
    ['Transaksi Kartu Debit', debitCount],
    ['Transaksi Transfer Bank', transferCount],
    ['Tanggal Export', new Date().toLocaleString('id-ID')],
    ['Sistem', 'Retalio POS & Business Intelligence'],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryData]);
  wsSummary['!cols'] = [{ wch: 30 }, { wch: 30 }];

  // Buat Workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsTx, 'Daftar Transaksi');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan Eksekutif');

  const filename = customFilename || `Laporan_Penjualan_Retalio_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * 2. Generate Template Excel (.xlsx) Produk Sesuai Kategori Industri
 */
export function generateProductTemplateXLSX(industry: string, customFilename?: string) {
  const headers = ['SKU', 'Nama Produk / Layanan', 'Kategori', 'Harga Jual', 'Harga Modal (HPP)', 'Stok Awal', 'Satuan'];

  let sampleRows: Array<Array<string | number>> = [];
  if (industry === 'services') {
    sampleRows = [
      ['SRV-001', 'Paket Cuci Mobil + Waxing', 'Layanan Utama', 75000, 25000, 100, 'layanan'],
      ['SRV-002', 'Treatment Facial Glow', 'Paket Treatment & Jasa', 150000, 50000, 50, 'sesi'],
      ['SRV-003', 'Serum Rambut Herbal', 'Produk Pendukung', 45000, 25000, 20, 'botol'],
    ];
  } else if (industry === 'manufacturing') {
    sampleRows = [
      ['MFG-001', 'Roti Tawar Gandum (Batch)', 'Barang Jadi', 120000, 65000, 30, 'batch'],
      ['MFG-002', 'Tepung Terigu Premium 25kg', 'Bahan Baku', 250000, 210000, 15, 'karung'],
      ['MFG-003', 'Plastik Kemasan Roti (Pack)', 'Kemasan & Pendukung', 35000, 20000, 50, 'pack'],
    ];
  } else {
    sampleRows = [
      ['RET-001', 'Kopi Susu Gula Aren', 'Makanan & Minuman', 18000, 9000, 80, 'cup'],
      ['RET-002', 'Croissant Cokelat Keju', 'Snack & Tambahan', 22000, 12000, 40, 'pcs'],
      ['RET-003', 'Biji Kopi Arabika 250gr', 'Katalog Utama', 65000, 38000, 25, 'pack'],
    ];
  }

  const wsData = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  wsData['!cols'] = [
    { wch: 14 }, // SKU
    { wch: 32 }, // Nama
    { wch: 24 }, // Kategori
    { wch: 16 }, // Harga Jual
    { wch: 18 }, // HPP
    { wch: 14 }, // Stok
    { wch: 12 }, // Satuan
  ];

  // Sheet Petunjuk
  const guideHeaders = ['Kolom Template', 'Keterangan', 'Wajib / Opsional'];
  const guideData = [
    ['SKU', 'Kode unik barang atau barcode produk', 'Opsional (auto-generate jika kosong)'],
    ['Nama Produk / Layanan', 'Nama lengkap barang, menu, atau treatment', 'Wajib'],
    ['Kategori', 'Kelompok produk (mis. Minuman, Bahan Baku, Jasa)', 'Opsional'],
    ['Harga Jual', 'Harga yang dibayar customer saat transaksi POS', 'Wajib'],
    ['Harga Modal (HPP)', 'Biaya perolehan / HPP untuk kalkulasi laba bersih', 'Opsional (disarankan)'],
    ['Stok Awal', 'Kuantitas fisik stok di toko/gudang', 'Wajib (angka)'],
    ['Satuan', 'Satuan hitung (pcs, cup, porsi, kg, botol, sesi, dll)', 'Wajib'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet([guideHeaders, ...guideData]);
  wsGuide['!cols'] = [{ wch: 25 }, { wch: 45 }, { wch: 30 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsData, 'Template Produk');
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Petunjuk Pengisian');

  const filename = customFilename || `Template_Produk_Retalio_${industry.toUpperCase()}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * 3. Parser File Excel (.xlsx, .xls) atau CSV dari Komputer
 */
export async function parseExcelOrCsvFile(file: File): Promise<ParsedSheetData> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const sheetNames = wb.SheetNames;
  if (!sheetNames || sheetNames.length === 0) {
    throw new Error('File spreadsheet tidak memiliki lembar kerja (worksheet).');
  }

  const activeSheet = sheetNames[0];
  const ws = wb.Sheets[activeSheet];
  const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });

  if (rawRows.length === 0) {
    throw new Error('Lembar kerja spreadsheet kosong.');
  }

  // Cari baris header pertama yang tidak kosong
  let headerIndex = 0;
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = rawRows[i];
    if (row && row.some((c) => String(c).trim().length > 0)) {
      headerIndex = i;
      break;
    }
  }

  const headers = (rawRows[headerIndex] || []).map((h) => String(h).trim()).filter((h) => h.length > 0);
  const dataRows = rawRows
    .slice(headerIndex + 1)
    .filter((row) => row && row.some((c) => String(c).trim().length > 0))
    .map((row) => row.map((cell) => String(cell).trim()));

  return {
    sourceType: 'excel',
    sourceName: file.name,
    sheetNames,
    activeSheet,
    headers,
    rows: dataRows,
    rawTotalRows: dataRows.length,
  };
}

/**
 * 4. Fetch dan Parser Link Google Spreadsheet URL
 */
export async function fetchAndParseGoogleSheet(sheetUrl: string): Promise<ParsedSheetData> {
  const cleanUrl = sheetUrl.trim();

  // Ekstrak Google Sheet ID
  const idMatch = cleanUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch || !idMatch[1]) {
    throw new Error(
      'Format URL Google Sheets tidak valid. Pastikan URL berbentuk: https://docs.google.com/spreadsheets/d/ID_SPREADSHEET/...',
    );
  }

  const spreadsheetId = idMatch[1];
  // Ambil gid jika ada
  const gidMatch = cleanUrl.match(/gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : '0';

  // Format link ekspor CSV publik Google Sheets
  const csvExportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;

  try {
    const response = await fetch(csvExportUrl);
    if (!response.ok) {
      throw new Error(
        `Gagal mengakses Google Spreadsheet (HTTP ${response.status}). Pastikan izin tautan diubah ke "Siapa saja yang memiliki link (Anyone with the link can view)".`,
      );
    }

    const csvText = await response.text();
    if (!csvText || csvText.trim().length === 0) {
      throw new Error('Data Google Spreadsheet kosong.');
    }

    const wb = XLSX.read(csvText, { type: 'string' });
    const activeSheet = wb.SheetNames[0] || 'Sheet1';
    const ws = wb.Sheets[activeSheet];
    const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });

    let headerIndex = 0;
    for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
      const row = rawRows[i];
      if (row && row.some((c) => String(c).trim().length > 0)) {
        headerIndex = i;
        break;
      }
    }

    const headers = (rawRows[headerIndex] || []).map((h) => String(h).trim()).filter((h) => h.length > 0);
    const dataRows = rawRows
      .slice(headerIndex + 1)
      .filter((row) => row && row.some((c) => String(c).trim().length > 0))
      .map((row) => row.map((cell) => String(cell).trim()));

    return {
      sourceType: 'google_sheet',
      sourceName: `Google Sheet (${spreadsheetId.slice(0, 8)}...)`,
      sheetNames: [activeSheet],
      activeSheet,
      headers,
      rows: dataRows,
      rawTotalRows: dataRows.length,
    };
  } catch (err: any) {
    if (err.message && err.message.includes('Gagal mengakses')) {
      throw err;
    }
    throw new Error(
      `Tidak dapat memuat Google Spreadsheet: ${err.message || 'Pastikan link berstatus publik / dapat dilihat siapapun'}.`,
    );
  }
}

/**
 * 5. AI Smart Column Mapper:
 * Menganalisis nama-nama kolom spreadsheet customer dan memetakannya secara cerdas ke field Retalio
 */
export async function aiSmartMapColumns(
  headers: string[],
  sampleRows: string[][] = [],
  useAiInference = false,
): Promise<ColumnMappingResult[]> {
  // 1. Heuristic First (Pattern Matching berbasis bahasa Indonesia & Inggris bisnis)
  const initialMappings = headers.map((header) => {
    const clean = header.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

    // Nama Produk
    if (/^(nama|name|item|produk|barang|layanan|menu|deskripsi|productname|namaproduk|namabarang|itemname)$/.test(clean)) {
      return { header, mappedField: 'name' as const, confidence: 0.98, reason: 'Pencocokan nama produk standar' };
    }
    // SKU / Barcode
    if (/^(sku|kode|code|barcode|plu|idproduk|kodebarang|nosku|itemcode)$/.test(clean)) {
      return { header, mappedField: 'sku' as const, confidence: 0.95, reason: 'Pencocokan kode SKU / Barcode' };
    }
    // Kategori
    if (/^(kategori|category|kelompok|tipe|jenis|group|kat|dept|departemen)$/.test(clean)) {
      return { header, mappedField: 'category' as const, confidence: 0.92, reason: 'Pencocokan kategori produk' };
    }
    // Harga Jual
    if (/^(harga|hargajual|sellprice|price|hargasatuan|hrgjual|tarif|nilaijual|sellingprice)$/.test(clean)) {
      return { header, mappedField: 'sell_price' as const, confidence: 0.96, reason: 'Pencocokan harga jual transaksi' };
    }
    // Harga Modal / HPP
    if (/^(hpp|modal|hargamodal|costprice|cost|hargabeli|pokok|biayapokok|hrgbeli|basecost)$/.test(clean)) {
      return { header, mappedField: 'cost_price' as const, confidence: 0.95, reason: 'Pencocokan modal / HPP produk' };
    }
    // Stok / Jumlah
    if (/^(stok|stock|qty|kuantitas|jumlah|saldo|quantity|stokawal|sisa|count|volume)$/.test(clean)) {
      return { header, mappedField: 'quantity' as const, confidence: 0.95, reason: 'Pencocokan jumlah stok' };
    }
    // Satuan
    if (/^(satuan|unit|uom|kemasan|sat|packaging|tipeunit)$/.test(clean)) {
      return { header, mappedField: 'unit' as const, confidence: 0.9, reason: 'Pencocokan satuan hitung' };
    }

    return { header, mappedField: 'ignore' as const, confidence: 0.4, reason: 'Kolom tidak dipetakan otomatis' };
  });

  // 2. Jika AI Aktif dan ada kolom ambiguous, panggil AI Engine NVIDIA NIM
  if (useAiInference) {
    const aiStore = useAiConfigStore.getState();
    if (aiStore.isEnabled && aiStore.apiKey) {
      try {
        const samplePreview = sampleRows.slice(0, 3).map((r, i) => `Baris ${i + 1}: ${headers.map((h, idx) => `${h}="${r[idx] || ''}"`).join(', ')}`).join('\n');
        const prompt = `Analisis nama kolom spreadsheet produk toko ini dan petakan masing-masing ke salah satu field Retalio:
Field Retalio yang tersedia:
- "name" (Nama produk / menu / layanan)
- "sku" (Kode SKU / barcode)
- "category" (Kategori produk)
- "sell_price" (Harga jual customer)
- "cost_price" (Harga modal / HPP)
- "quantity" (Jumlah stok)
- "unit" (Satuan seperti pcs, porsi, kg, botol, sesi)
- "ignore" (Abaikan kolom ini)

Daftar Kolom Header: ${headers.join(', ')}
Contoh data baris:
${samplePreview}

Balas HANYA dalam format JSON array murni tanpa markdown fence seperti ini:
[{"header": "Nama Kolom", "mappedField": "name", "confidence": 0.95, "reason": "Alasan singkat"}]`;

        const aiRes = await aiStore.invokeNim(prompt, 'Kamu adalah AI Spreadsheet Data Integration Specialist.');
        const rawJson = aiRes.answer.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedAi = JSON.parse(rawJson);

        if (Array.isArray(parsedAi)) {
          return headers.map((h) => {
            const found = parsedAi.find((item: any) => item.header?.toLowerCase() === h.toLowerCase());
            if (found && found.mappedField) {
              return {
                header: h,
                mappedField: found.mappedField,
                confidence: typeof found.confidence === 'number' ? found.confidence : 0.95,
                reason: found.reason || 'Dianalisis cerdas oleh AI',
              };
            }
            return initialMappings.find((m) => m.header === h) || { header: h, mappedField: 'ignore', confidence: 0.5 };
          });
        }
      } catch (aiErr) {
        // Fallback ke heuristic tanpa crash
      }
    }
  }

  return initialMappings;
}
