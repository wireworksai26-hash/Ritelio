import React, { useState } from 'react';
import { formatIDR, formatDate } from '../../lib/format';
import { useBusinessStore } from '../../stores/businessStore';
import { useAuthStore } from '../../stores/authStore';
import {
  exportSalesTransactionsToXLSX,
  generateProductTemplateXLSX,
  parseExcelOrCsvFile,
  fetchAndParseGoogleSheet,
  aiSmartMapColumns,
  type ColumnMappingResult,
  type ParsedSheetData,
} from '../../lib/excel';
import { productName, outletName } from '../../lib/stats';
import { toast } from '../../stores/toastStore';
import { Icon } from '../icons/Icon';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import type { Product } from '../../types';

interface AiExcelMapperModalProps {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  defaultTab?: 'export' | 'template' | 'import';
}

const FIELD_OPTIONS = [
  { value: 'name', label: 'Nama Produk / Menu / Jasa *' },
  { value: 'sell_price', label: 'Harga Jual (Rp) *' },
  { value: 'cost_price', label: 'Harga Modal / HPP (Rp)' },
  { value: 'quantity', label: 'Jumlah Stok Fisik *' },
  { value: 'sku', label: 'Kode SKU / Barcode' },
  { value: 'category', label: 'Kategori Produk' },
  { value: 'unit', label: 'Satuan (pcs, kg, sesi, dll)' },
  { value: 'ignore', label: '— Abaikan Kolom Ini —' },
];

export function AiExcelMapperModal({ isOpen, open, onClose, defaultTab = 'export' }: AiExcelMapperModalProps) {
  const isModalOpen = isOpen ?? open ?? false;
  const user = useAuthStore((s) => s.user);
  const transactions = useBusinessStore((s) => s.transactions);
  const categories = useBusinessStore((s) => s.categories);
  const tenant = useBusinessStore((s) => s.tenant);

  // Akses Role: Owner, Manager, Admin, Superadmin
  const isAuthorizedRole = ['owner', 'manager', 'admin', 'superadmin'].includes(user?.role || 'owner');

  const [activeTab, setActiveTab] = useState<'export' | 'template' | 'import'>(defaultTab);

  // Export Filter
  const [exportRange, setExportRange] = useState<'today' | '7days' | '30days' | 'all'>('all');

  // Import Source & State
  const [importSource, setImportSource] = useState<'file' | 'google_sheet'>('file');
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);

  const [parsedData, setParsedData] = useState<ParsedSheetData | null>(null);
  const [columnMappings, setColumnMappings] = useState<ColumnMappingResult[]>([]);
  const [isMappingAnalyzed, setIsMappingAnalyzed] = useState(false);

  // Default Fallbacks
  const [defaultCategory, setDefaultCategory] = useState(categories[0]?.id || 'cat-default');
  const [defaultUnit, setDefaultUnit] = useState(tenant.industry_template === 'services' ? 'layanan' : 'pcs');

  if (!isModalOpen) return null;

  // Filtered transactions for export
  const filteredTx = transactions.filter((t) => {
    if (exportRange === 'all') return true;
    const txTime = new Date(t.client_timestamp).getTime();
    const now = Date.now();
    if (exportRange === 'today') return now - txTime <= 24 * 60 * 60 * 1000;
    if (exportRange === '7days') return now - txTime <= 7 * 24 * 60 * 60 * 1000;
    if (exportRange === '30days') return now - txTime <= 30 * 24 * 60 * 60 * 1000;
    return true;
  });

  const exportTotalOmzet = filteredTx.reduce((sum, t) => sum + t.total, 0);

  // 1. Handle Native XLSX Export
  const handleDownloadExportXLSX = () => {
    if (filteredTx.length === 0) {
      toast({ title: 'Belum ada transaksi penjualan untuk diekspor', icon: 'warning' });
      return;
    }
    const dateSlug = new Date().toISOString().slice(0, 10);
    const filename = `Laporan_Penjualan_${tenant.name.replace(/\s+/g, '_')}_${dateSlug}.xlsx`;
    exportSalesTransactionsToXLSX(filteredTx, productName, outletName, filename);
    toast({ title: `Berhasil mengekspor ${filteredTx.length} transaksi ke Excel (.xlsx)`, icon: 'check' });
  };

  // 2. Handle Native XLSX Template Download
  const handleDownloadTemplateXLSX = () => {
    const filename = `Template_Produk_Retalio_${tenant.industry_template.toUpperCase()}.xlsx`;
    generateProductTemplateXLSX(tenant.industry_template, filename);
    toast({ title: 'Template Excel (.xlsx) siap pakai berhasil diunduh!', icon: 'check' });
  };

  // 3. Handle File Upload (.xlsx, .xls, .csv)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsAnalyzingAi(true);
      const parsed = await parseExcelOrCsvFile(file);
      setParsedData(parsed);

      const mappings = await aiSmartMapColumns(parsed.headers, parsed.rows, true);
      setColumnMappings(mappings);
      setIsMappingAnalyzed(true);
      toast({ title: `Berhasil membaca ${parsed.rows.length} baris dari file ${file.name}`, icon: 'check' });
    } catch (err: any) {
      toast({ title: `Gagal membaca file: ${err.message}`, icon: 'warning' });
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  // 4. Handle Google Sheets URL Fetch
  const handleFetchGoogleSheet = async () => {
    if (!googleSheetUrl.trim()) {
      toast({ title: 'Masukkan tautan Google Spreadsheet terlebih dahulu', icon: 'warning' });
      return;
    }

    try {
      setIsFetchingUrl(true);
      setIsAnalyzingAi(true);
      const parsed = await fetchAndParseGoogleSheet(googleSheetUrl);
      setParsedData(parsed);

      const mappings = await aiSmartMapColumns(parsed.headers, parsed.rows, true);
      setColumnMappings(mappings);
      setIsMappingAnalyzed(true);
      toast({ title: `Berhasil mengimpor ${parsed.rows.length} produk dari Google Sheets!`, icon: 'check' });
    } catch (err: any) {
      toast({ title: err.message || 'Gagal memuat Google Sheet', icon: 'warning' });
    } finally {
      setIsFetchingUrl(false);
      setIsAnalyzingAi(false);
    }
  };

  // Manual Column Mapping change
  const handleMappingChange = (index: number, newField: any) => {
    setColumnMappings((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], mappedField: newField, confidence: 1.0, reason: 'Disesuaikan manual oleh user' };
      return next;
    });
  };

  // Execute Final Import into Business Catalogue
  const handleCommitImport = () => {
    if (!parsedData || parsedData.rows.length === 0) return;

    const nameIdx = columnMappings.findIndex((m) => m.mappedField === 'name');
    if (nameIdx === -1) {
      toast({ title: 'Wajib memilih minimal satu kolom untuk Nama Produk', icon: 'warning' });
      return;
    }

    const skuIdx = columnMappings.findIndex((m) => m.mappedField === 'sku');
    const catIdx = columnMappings.findIndex((m) => m.mappedField === 'category');
    const sellPriceIdx = columnMappings.findIndex((m) => m.mappedField === 'sell_price');
    const costPriceIdx = columnMappings.findIndex((m) => m.mappedField === 'cost_price');
    const qtyIdx = columnMappings.findIndex((m) => m.mappedField === 'quantity');
    const unitIdx = columnMappings.findIndex((m) => m.mappedField === 'unit');

    let count = 0;
    parsedData.rows.forEach((row, rIdx) => {
      const pName = row[nameIdx]?.trim();
      if (!pName) return;

      const pSku = skuIdx !== -1 && row[skuIdx] ? row[skuIdx].trim() : `IMP-${Date.now().toString().slice(-4)}-${rIdx + 1}`;
      const pCatName = catIdx !== -1 && row[catIdx] ? row[catIdx].trim() : '';
      const rawSellPrice = sellPriceIdx !== -1 ? row[sellPriceIdx]?.replace(/[^0-9]/g, '') : '0';
      const rawCostPrice = costPriceIdx !== -1 ? row[costPriceIdx]?.replace(/[^0-9]/g, '') : '0';
      const rawQty = qtyIdx !== -1 ? row[qtyIdx]?.replace(/[^0-9]/g, '') : '10';
      const pUnit = unitIdx !== -1 && row[unitIdx] ? row[unitIdx].trim() : defaultUnit;

      const pPrice = parseInt(rawSellPrice, 10) || 10000;
      const pCost = parseInt(rawCostPrice, 10) || Math.round(pPrice * 0.6);
      const pQty = parseInt(rawQty, 10) || 0;

      let foundCat = categories.find((c) => c.name.toLowerCase() === pCatName.toLowerCase());
      if (!foundCat && pCatName) {
        foundCat = {
          id: `cat-${Date.now().toString().slice(-3)}-${rIdx}`,
          tenant_id: tenant.id,
          name: pCatName,
          parent_id: null,
        };
        useBusinessStore.getState().addCategory(foundCat);
      }

      const newProd: Product = {
        id: `p-${Date.now().toString().slice(-4)}-${rIdx}`,
        tenant_id: tenant.id,
        sku: pSku,
        name: pName,
        category_id: foundCat?.id || defaultCategory,
        sell_price: pPrice,
        cost_price: pCost,
        unit: pUnit,
        custom_fields: {},
      };

      useBusinessStore.getState().addProduct(newProd, pQty);
      count++;
    });

    toast({
      title: 'Impor Excel Berhasil!',
      description: `${count} produk baru berhasil dimasukkan ke katalog & stok gudang.`,
      icon: 'check',
    });
    onClose();
  };

  return (
    <Modal open={isModalOpen} onClose={onClose} title="Kelola Data Excel & AI Smart Mapping" maxWidth="xl">
      <div className="space-y-5">
        {!isAuthorizedRole && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-[13px] text-red-700 dark:text-red-300 flex items-center gap-2">
            <Icon name="warning" size={16} />
            <span>Akses terbatas: Hanya Owner, Manager, dan Admin yang dapat mengimpor atau mengekspor data spreadsheet.</span>
          </div>
        )}

        <div className="flex border-b border-ash">
          {[
            { id: 'export', label: 'Export Penjualan (.xlsx)', icon: 'download' as const },
            { id: 'template', label: 'Template Excel (.xlsx)', icon: 'sparkles' as const },
            { id: 'import', label: 'AI Smart Import & Google Sheet', icon: 'assistant' as const },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 text-[13.5px] font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-ink text-ink font-semibold'
                  : 'border-transparent text-fossil hover:text-ink'
              }`}
            >
              <Icon name={t.icon} size={15} />
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'export' && (
          <div className="space-y-4">
            <p className="text-[13px] text-fossil">
              Unduh riwayat transaksi penjualan format <strong>Microsoft Excel (.xlsx) asli</strong> lengkap dengan lembar rekapitulasi eksekutif, rincian produk, kasir, cabang, dan metode pembayaran.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[12px] text-fossil mr-1">Rentang:</span>
              {[
                { id: 'all', label: 'Semua Waktu' },
                { id: 'today', label: 'Hari Ini' },
                { id: '7days', label: '7 Hari Terakhir' },
                { id: '30days', label: '30 Hari Terakhir' },
              ].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setExportRange(filter.id as any)}
                  className={`px-3 py-1 text-[12px] font-medium rounded-lg transition-colors ${
                    exportRange === filter.id
                      ? 'bg-ink text-white shadow-xs'
                      : 'border border-ash bg-paper text-fossil hover:text-ink'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="p-4 rounded-xl bg-bone border border-ash grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-[11px] text-fossil uppercase font-medium">Total Transaksi</p>
                <p className="text-heading-sm font-semibold text-ink mt-0.5">{filteredTx.length} struk</p>
              </div>
              <div>
                <p className="text-[11px] text-fossil uppercase font-medium">Total Omzet Penjualan</p>
                <p className="text-heading-sm font-semibold text-olive mt-0.5">{formatIDR(exportTotalOmzet)}</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-[11px] text-fossil uppercase font-medium">Format Output</p>
                <Badge variant="accent" icon="download" className="mt-1">
                  Excel Workbook (.xlsx)
                </Badge>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                variant="primary"
                icon="download"
                disabled={!isAuthorizedRole}
                onClick={handleDownloadExportXLSX}
              >
                Unduh File Excel Penjualan (.xlsx)
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'template' && (
          <div className="space-y-4">
            <p className="text-[13px] text-fossil">
              Gunakan template spreadsheet <strong>Microsoft Excel (.xlsx)</strong> resmi ini untuk memasukkan ratusan produk secara offline.
            </p>

            <div className="p-4 rounded-xl bg-sand/40 border border-ash space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-chartreuse/80 text-ink flex items-center justify-center">
                    <Icon name="sparkles" size={16} />
                  </span>
                  <div>
                    <p className="text-[13.5px] font-semibold text-ink">
                      Template Khusus Industri: {tenant.industry_template.toUpperCase()}
                    </p>
                    <p className="text-[11.5px] text-fossil">
                      Tersedia sheet Data Produk dan sheet Petunjuk Pengisian kolom.
                    </p>
                  </div>
                </div>
                <Badge variant="ink">{tenant.industry_template}</Badge>
              </div>

              <div className="text-[12px] bg-paper p-3 rounded-lg border border-ash/60 font-mono text-fossil overflow-x-auto">
                SKU, Nama Produk, Kategori, Harga Jual, Harga Modal (HPP), Stok Awal, Satuan
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                variant="primary"
                icon="sparkles"
                disabled={!isAuthorizedRole}
                onClick={handleDownloadTemplateXLSX}
              >
                Unduh Template Excel (.xlsx)
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'import' && (
          <div className="space-y-4">
            {!isMappingAnalyzed ? (
              <div className="space-y-4">
                <div className="flex gap-2 p-1 bg-sand/50 rounded-lg w-fit">
                  <button
                    onClick={() => setImportSource('file')}
                    className={`px-3 py-1.5 rounded-md text-[12.5px] font-medium transition-colors ${
                      importSource === 'file' ? 'bg-paper text-ink shadow-xs' : 'text-fossil hover:text-ink'
                    }`}
                  >
                    Unggah File (.xlsx / .csv)
                  </button>
                  <button
                    onClick={() => setImportSource('google_sheet')}
                    className={`px-3 py-1.5 rounded-md text-[12.5px] font-medium transition-colors ${
                      importSource === 'google_sheet' ? 'bg-paper text-ink shadow-xs' : 'text-fossil hover:text-ink'
                    }`}
                  >
                    Tautkan Google Spreadsheet
                  </button>
                </div>

                {importSource === 'file' && (
                  <div className="border-2 border-dashed border-ash rounded-xl p-6 text-center bg-sand/20 hover:bg-sand/40 transition-colors">
                    <Icon name="document" size={32} className="mx-auto text-pebble mb-2" />
                    <p className="text-[14px] font-medium text-ink">Unggah File Spreadsheet (.xlsx, .xls, .csv)</p>
                    <p className="text-[12px] text-fossil mt-0.5">AI akan otomatis menganalisis dan memetakan nama kolom Anda.</p>
                    <label className="mt-4 inline-block">
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleFileUpload}
                        className="hidden"
                        disabled={!isAuthorizedRole}
                      />
                      <span className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ink text-white text-[13px] font-medium hover:bg-smoke shadow-xs">
                        <Icon name="plus" size={14} />
                        Pilih File Excel / CSV
                      </span>
                    </label>
                  </div>
                )}

                {importSource === 'google_sheet' && (
                  <div className="p-5 rounded-xl border border-ash bg-bone space-y-3">
                    <label className="text-[13.5px] font-semibold text-ink flex items-center gap-2">
                      <Icon name="globe" size={16} />
                      Tautan Google Spreadsheet Publik
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={googleSheetUrl}
                        onChange={(e) => setGoogleSheetUrl(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5.../edit"
                        className="flex-1 bg-paper border border-pebble/70 rounded-lg px-3 py-2 text-[13.5px] placeholder:text-pebble focus:border-ink focus:outline-none"
                      />
                      <Button
                        variant="primary"
                        icon="sync"
                        disabled={isFetchingUrl || !isAuthorizedRole}
                        onClick={handleFetchGoogleSheet}
                      >
                        {isFetchingUrl ? 'Memuat...' : 'Baca Data'}
                      </Button>
                    </div>
                    <p className="text-caption text-fossil leading-relaxed">
                      💡 <strong>Tips:</strong> Buka Google Sheet Anda → Klik tombol <em>Share / Bagikan</em> di kanan atas → Ubah akses umum ke <em>"Siapa saja yang memiliki link (Anyone with the link)"</em>.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3.5 bg-sand/40 border border-ash rounded-xl">
                  <div>
                    <span className="text-[13.5px] font-semibold text-ink flex items-center gap-1.5">
                      <Icon name="assistant" size={16} />
                      AI Smart Column Mapping ({parsedData?.headers.length} Kolom Terdeteksi)
                    </span>
                    <p className="text-caption text-fossil">
                      Sumber: {parsedData?.sourceName} · {parsedData?.rows.length} total baris produk
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsMappingAnalyzed(false);
                      setParsedData(null);
                    }}
                  >
                    Ganti File / Link
                  </Button>
                </div>

                <div className="border border-ash rounded-xl p-4 bg-paper space-y-3 max-h-64 overflow-y-auto">
                  <p className="text-[12px] font-medium text-fossil uppercase tracking-wide">
                    Sesuaikan Pemetaan Kolom File ke Retalio:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {columnMappings.map((mapping, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-sand/30 border border-ash/70 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-mono font-medium text-ink truncate">
                            "{mapping.header}"
                          </span>
                          <Badge variant={mapping.confidence >= 0.9 ? 'neutral' : 'accent'}>
                            {Math.round(mapping.confidence * 100)}% AI Match
                          </Badge>
                        </div>
                        <select
                          value={mapping.mappedField}
                          onChange={(e) => handleMappingChange(idx, e.target.value)}
                          className="w-full bg-paper border border-pebble/60 rounded px-2.5 py-1 text-[12.5px] focus:border-ink focus:outline-none"
                        >
                          {FIELD_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live Preview Table */}
                <div className="border border-ash rounded-xl overflow-hidden">
                  <div className="px-4 py-2 bg-bone border-b border-ash text-[12px] font-medium text-fossil">
                    Preview Data Awal (5 Baris Pertama):
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[12px]">
                      <thead>
                        <tr className="bg-sand/30 border-b border-ash text-fossil">
                          {columnMappings.map((m, i) => (
                            <th key={i} className="px-3 py-2 font-medium">
                              {m.header} <span className="text-ink">({m.mappedField})</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sand">
                        {parsedData?.rows.slice(0, 5).map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-sand/20">
                            {columnMappings.map((_, cIdx) => (
                              <td key={cIdx} className="px-3 py-2 text-ink truncate max-w-[150px]">
                                {row[cIdx] || '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setIsMappingAnalyzed(false);
                      setParsedData(null);
                    }}
                  >
                    Batal
                  </Button>
                  <Button
                    variant="primary"
                    icon="check"
                    disabled={!isAuthorizedRole}
                    onClick={handleCommitImport}
                  >
                    Impor ({parsedData?.rows.length}) Produk ke Katalog
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
