import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Pagination } from '../components/ui/Pagination';
import { Input, Select } from '../components/ui/controls';
import { PriceInputWithQuickAdd } from '../components/ui/PriceInputWithQuickAdd';
import { BusinessPricingCalculatorModal } from '../components/inventory/BusinessPricingCalculatorModal';
import { AiExcelMapperModal } from '../components/excel/AiExcelMapperModal';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { Tabs } from '../components/ui/Tabs';
import { Icon } from '../components/icons/Icon';
import { BarcodeScanner } from '../components/inventory/BarcodeScanner';
import { PoOverviewTab } from '../components/inventory/PoOverviewTab';
import { StockOpnameTab } from '../components/inventory/StockOpnameTab';
import { Reveal } from '../components/Reveal';
import { formatDate, formatIDR, formatNumber, timeAgo } from '../lib/format';
import { categoryName, stockTotal, warehouseName } from '../lib/stats';
import { useAuthStore } from '../stores/authStore';
import { useBusinessStore } from '../stores/businessStore';
import { useModuleStore } from '../stores/moduleStore';
import { toast } from '../stores/toastStore';
import type { Product, StockMovement } from '../types';

type TabKey = 'produk' | 'po' | 'opname';

const tabOptions: Array<{ value: TabKey; label: string }> = [
  { value: 'produk', label: 'Daftar Produk' },
  { value: 'po', label: 'Purchase Order' },
  { value: 'opname', label: 'Stok Opname' },
];

const movementBadge: Record<StockMovement['type'], { variant: 'neutral' | 'ink' | 'outline'; label: string }> = {
  sale: { variant: 'neutral', label: 'Terjual' },
  purchase: { variant: 'ink', label: 'Masuk' },
  adjustment: { variant: 'outline', label: 'Koreksi' },
  production: { variant: 'neutral', label: 'Produksi' },
};

const PROD_PAGE_SIZE = 8;

export default function Inventory() {
  const tenant = useBusinessStore((s) => s.tenant);
  const allProducts = useBusinessStore((s) => s.products);
  const allCategories = useBusinessStore((s) => s.categories);
  const allStocks = useBusinessStore((s) => s.stocks);
  const allStockMovements = useBusinessStore((s) => s.stockMovements);
  const allWarehouses = useBusinessStore((s) => s.warehouses);

  const products = useMemo(() => {
    return allProducts.filter((p) => p.tenant_id === tenant.id || (!p.tenant_id && tenant.id === 'tenant-newsem'));
  }, [allProducts, tenant.id]);

  const categories = useMemo(() => {
    return allCategories.filter((c) => c.tenant_id === tenant.id || (!c.tenant_id && tenant.id === 'tenant-newsem'));
  }, [allCategories, tenant.id]);

  const warehouses = useMemo(() => {
    return allWarehouses.filter((w) => w.tenant_id === tenant.id || (!w.tenant_id && tenant.id === 'tenant-newsem'));
  }, [allWarehouses, tenant.id]);

  const tenantWhIds = useMemo(() => new Set(warehouses.map((w) => w.id)), [warehouses]);
  const productIds = useMemo(() => new Set(products.map((p) => p.id)), [products]);

  const stocks = useMemo(() => {
    return allStocks.filter((s) => tenantWhIds.has(s.warehouse_id) || productIds.has(s.product_id));
  }, [allStocks, tenantWhIds, productIds]);

  const stockMovements = useMemo(() => {
    return allStockMovements.filter((m) => tenantWhIds.has(m.warehouse_id) || productIds.has(m.product_id));
  }, [allStockMovements, tenantWhIds, productIds]);

  const deleteProduct = useBusinessStore((s) => s.deleteProduct);
  const updateProduct = useBusinessStore((s) => s.updateProduct);
  const isAssistantActive = useModuleStore((s) => s.isActive('assistant'));
  const user = useAuthStore((s) => s.user);
  const canManageExcel = ['owner', 'manager', 'admin', 'superadmin'].includes(user?.role || 'owner');
  // Staff gudang tidak punya izin purchasing:read, jadi tab PO disembunyikan.
  const canManagePo = ['owner', 'manager', 'admin', 'superadmin'].includes(user?.role || '');
  const visibleTabs = canManagePo ? tabOptions : tabOptions.filter((t) => t.value !== 'po');

  const [tab, setTab] = useState<TabKey>('produk');
  const [dismissed, setDismissed] = useState(false);
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState('semua');
  const [prodPage, setProdPage] = useState(1);
  const [scanOpen, setScanOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [scanCode, setScanCode] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);

  // Form tambah produk
  const [newName, setNewName] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newCategory, setNewCategory] = useState(categories[0]?.id || '');
  const [newSellPrice, setNewSellPrice] = useState('');
  const [newCostPrice, setNewCostPrice] = useState('');
  const [newInitialStock, setNewInitialStock] = useState('');
  const [newUnit, setNewUnit] = useState('pcs');
  const [newImage, setNewImage] = useState('');

  // Form edit produk
  const [editOpen, setEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editName, setEditName] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSellPrice, setEditSellPrice] = useState('');
  const [editCostPrice, setEditCostPrice] = useState('');
  const [editStockQty, setEditStockQty] = useState('');
  const [editUnit, setEditUnit] = useState('pcs');
  const [editImage, setEditImage] = useState('');

  // Kalkulator Bisnis AI
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcTarget, setCalcTarget] = useState<'new' | 'edit'>('new');
  const [excelModalOpen, setExcelModalOpen] = useState(false);

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Ukuran foto maksimal 2MB', icon: 'warning' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setNewImage(dataUrl);
        toast({ title: 'Foto produk siap diunggah!', icon: 'check' });
      }
    };
    reader.readAsDataURL(file);
  }

  function handleEditImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Ukuran foto maksimal 2MB', icon: 'warning' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setEditImage(dataUrl);
        toast({ title: 'Foto produk diperbarui!', icon: 'check' });
      }
    };
    reader.readAsDataURL(file);
  }

  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of allStocks) {
      map.set(s.product_id, (map.get(s.product_id) || 0) + Number(s.quantity));
    }
    return map;
  }, [allStocks]);

  const getProductStock = (productId: string) => stockMap.get(productId) ?? 0;

  function handleStartEdit(p: Product, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setEditingProduct(p);
    setEditName(p.name);
    setEditSku(p.sku);
    setEditCategory(p.category_id);
    setEditSellPrice(p.sell_price.toString());
    setEditCostPrice((p.cost_price ?? Math.round(p.sell_price * 0.6)).toString());
    setEditStockQty(getProductStock(p.id).toString());
    setEditUnit(p.unit);
    setEditImage(p.image_url ?? '');
    setEditOpen(true);
  }

  function handleSaveEdit() {
    if (!editingProduct) return;
    if (!editName.trim()) {
      toast({ title: 'Nama produk wajib diisi', icon: 'warning' });
      return;
    }
    const sellP = Math.max(0, Number(editSellPrice) || 0);
    const costP = Math.max(0, Number(editCostPrice) || Math.round(sellP * 0.6));
    const stockQ = Math.max(0, Number(editStockQty) || 0);

    updateProduct(
      editingProduct.id,
      {
        name: editName.trim(),
        sku: editSku.trim() || editingProduct.sku,
        category_id: editCategory || editingProduct.category_id,
        sell_price: sellP,
        cost_price: costP,
        unit: editUnit,
        image_url: editImage.trim() || undefined,
      },
      stockQ,
    );
    toast({ title: `Produk "${editName}" berhasil diperbarui!`, icon: 'check' });
    setEditOpen(false);
    setEditingProduct(null);
    if (selected?.id === editingProduct.id) {
      setSelected(null);
    }
  }

  function handleDeleteProduct(p: Product, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (confirm(`Hapus produk "${p.name}" beserta seluruh stoknya?`)) {
      deleteProduct(p.id);
      toast({ title: `Produk "${p.name}" dihapus`, icon: 'trash' });
      if (selected?.id === p.id) {
        setSelected(null);
      }
    }
  }

  function thresholdFor(productId: string): number {
    return stocks
      .filter((s) => s.product_id === productId)
      .reduce((max, s) => Math.max(max, Number(s.min_threshold)), 0);
  }

  const customFields = useModuleStore((s) => s.customFields).filter((f) => f.module_key === 'inventory');

  // Paket AI & kondisi restock aktual
  const isAiPlan = tenant.subscription_plan === 'plus_ai' || tenant.subscription_plan === 'custom';
  const isAiActive = isAiPlan && isAssistantActive;
  const lowStockProducts = useMemo(() => {
    return products.filter((p) => getProductStock(p.id) <= thresholdFor(p.id));
  }, [products, stockMap]);
  const primaryLowStock = lowStockProducts[0];

  // Reaktif realtime: re-compute saat array products / query berubah
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const matchQuery = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      const matchCat = catFilter === 'semua' || p.category_id === catFilter;
      return matchQuery && matchCat;
    });
  }, [products, query, catFilter]);

  const totalProdPages = Math.max(1, Math.ceil(filtered.length / PROD_PAGE_SIZE));
  const pagedProducts = useMemo(() => {
    return filtered.slice((prodPage - 1) * PROD_PAGE_SIZE, prodPage * PROD_PAGE_SIZE);
  }, [filtered, prodPage, stockMap]);

  // Pintasan dari Dashboard: /app/inventory?scan=1 langsung membuka pemindai
  useEffect(() => {
    if (searchParams.get('scan') === '1') {
      setScanOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  function findByScan(raw: string = scanCode) {
    const trimmed = raw.trim();
    const code = trimmed.toLowerCase();
    const found = products.find((p) => p.barcode === trimmed || p.sku.toLowerCase() === code);
    if (found) {
      toast({ title: `Ditemukan: ${found.name}`, icon: 'check' });
      setTab('produk');
      setSelected(found);
    } else {
      toast({ title: 'Produk tidak ditemukan', icon: 'warning' });
    }
    setScanOpen(false);
    setScanCode('');
  }

  const selectedStocks = selected ? stocks.filter((s) => s.product_id === selected.id) : [];
  const selectedMovements = selected
    ? stockMovements.filter((m) => m.product_id === selected.id).slice(0, 5)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={tenant.industry_template === 'services' ? 'Daftar Layanan & Jasa' : 'Inventori'}
        subtitle="Stok real-time semua gudang"
        actions={
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {canManageExcel && (
              <Button
                variant="ghost"
                icon="assistant"
                className="flex-1 sm:flex-initial"
                onClick={() => setExcelModalOpen(true)}
              >
                Excel & Impor AI
              </Button>
            )}
            <Button
              variant="ghost"
              icon="scan"
              className="flex-1 sm:flex-initial"
              onClick={() => setScanOpen(true)}
            >
              Scan
            </Button>
            <Button
              variant="primary"
              icon="plus"
              className="flex-1 sm:flex-initial"
              onClick={() => setAddOpen(true)}
            >
              {tenant.industry_template === 'services' ? 'Tambah Layanan' : 'Tambah Produk'}
            </Button>
          </div>
        }
      />

      {isAiActive && primaryLowStock && !dismissed && (
        <Reveal>
          <Card className="p-4 sm:p-5 flex flex-col sm:flex-row gap-3.5 sm:gap-4 bg-sand/40 border-ash">
            <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-sand border border-ash/80 inline-flex items-center justify-center shrink-0">
              <Icon name="assistant" size={18} className="text-ink" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="ink" icon="assistant">
                  Prediksi Restock AI
                </Badge>
                <Badge variant="accent" className="text-[11px]">Perhatian</Badge>
              </div>
              <p className="mt-2 text-[14px] sm:text-[15px] text-ink leading-relaxed">
                Stok <strong>{primaryLowStock.name}</strong> tersisa{' '}
                <strong>{stockTotal(primaryLowStock.id)} {primaryLowStock.unit}</strong> (ambang batas: {thresholdFor(primaryLowStock.id)}).
                Disarankan melakukan restock segera.
              </p>
              <p className="text-caption text-fossil mt-1.5">
                Berdasarkan: inventory_stock · {warehouseName(stocks.find((s) => s.product_id === primaryLowStock.id)?.warehouse_id || '')}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  icon="document"
                  onClick={() => {
                    toast({
                      title: `Draft Restock untuk ${primaryLowStock.name} dibuat`,
                      icon: 'check',
                    });
                    setDismissed(true);
                  }}
                >
                  Buat PO Restock
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
                  Abaikan
                </Button>
              </div>
            </div>
          </Card>
        </Reveal>
      )}

      <Tabs options={visibleTabs} value={tab} onChange={setTab} />

      {tab === 'produk' && (
        <div className="space-y-4">
          <Reveal>
            <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
              <div className="relative flex-1">
                <Icon
                  name="search"
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-pebble"
                />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setProdPage(1);
                  }}
                  placeholder="Cari produk atau SKU…"
                  className="w-full bg-paper border border-pebble/70 rounded-lg pl-9 pr-8 py-2.5 text-[15px] placeholder:text-pebble focus:border-ink focus:outline-none transition-colors"
                />
                {query && (
                  <button
                    onClick={() => {
                      setQuery('');
                      setProdPage(1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-fossil hover:text-ink text-body-sm"
                  >
                    ✕
                  </button>
                )}
              </div>
              <Select
                value={catFilter}
                onChange={(e) => {
                  setCatFilter(e.target.value);
                  setProdPage(1);
                }}
                className="sm:w-56"
              >
                <option value="semua">Semua Kategori</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </Reveal>

          {/* Daftar produk — card list di mobile */}
          {filtered.length === 0 && (
            <Card className="lg:hidden w-full">
              <EmptyState
                icon="search"
                title="Tidak ada produk ditemukan"
                body="Coba kata kunci atau kategori lain."
              />
            </Card>
          )}
          <Reveal stagger={0.03} key={`${catFilter}-${query}-${prodPage}`} className="lg:hidden w-full min-w-0">
            <div className="space-y-2.5 sm:space-y-3 w-full min-w-0">
              {pagedProducts.map((p) => {
                const total = getProductStock(p.id);
                const threshold = thresholdFor(p.id);
                return (
                  <div key={p.id} className="w-full min-w-0 text-left">
                    <Card
                      className="w-full min-w-0 p-3.5 sm:p-4 hover:border-pebble cursor-pointer transition-colors"
                      onClick={() => setSelected(p)}
                    >
                      <div className="flex items-start gap-3 w-full min-w-0">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.name}
                            className="w-12 h-12 rounded-xl object-cover border border-ash shrink-0 bg-sand"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl border border-ash/80 bg-sand inline-flex items-center justify-center text-pebble shrink-0">
                            <Icon name="inventory" size={18} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] sm:text-[15px] text-ink leading-snug break-words font-medium">{p.name}</p>
                          <p className="text-caption text-fossil mt-0.5 truncate">
                            <span className="tnum">{p.sku}</span> · {categoryName(p.category_id)} · {p.unit}
                          </p>
                        </div>
                        <div className="shrink-0">
                          {total === 0 ? (
                            <Badge variant="ink">Habis</Badge>
                          ) : total <= threshold ? (
                            <Badge variant="accent">Menipis</Badge>
                          ) : (
                            <Badge variant="neutral">Aman</Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-2.5 sm:mt-3 flex items-center justify-between border-t border-sand pt-2.5 w-full min-w-0">
                        <span className="text-caption text-fossil truncate">
                          Stok <span className="tnum text-ink font-medium">{formatNumber(total)}</span>
                          <span className="text-pebble"> / {formatNumber(threshold)}</span>
                        </span>
                        <span className="tnum text-body-sm font-semibold text-ink shrink-0 ml-2">
                          {formatIDR(p.sell_price)}
                        </span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-sand/50 flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="edit"
                          onClick={(e) => handleStartEdit(p, e)}
                        >
                          Ubah
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="trash"
                          className="text-rose-700 hover:text-rose-800"
                          onClick={(e) => handleDeleteProduct(p, e)}
                        >
                          Hapus
                        </Button>
                      </div>
                    </Card>
                  </div>
                );
              })}

              <Pagination
                currentPage={prodPage}
                totalPages={totalProdPages}
                totalItems={filtered.length}
                pageSize={PROD_PAGE_SIZE}
                onPageChange={setProdPage}
              />
            </div>
          </Reveal>

          {/* Tabel produk — desktop */}
          <Card className="overflow-hidden hidden lg:block">
            {filtered.length === 0 ? (
              <EmptyState
                icon="search"
                title="Tidak ada produk ditemukan"
                body="Coba kata kunci atau kategori lain."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-ash">
                      <th className="text-caption text-fossil font-normal px-6 py-3">Produk</th>
                      <th className="text-caption text-fossil font-normal px-6 py-3">SKU</th>
                      <th className="text-caption text-fossil font-normal px-6 py-3">Kategori</th>
                      <th className="text-caption text-fossil font-normal px-6 py-3">Stok</th>
                      <th className="text-caption text-fossil font-normal px-6 py-3">Ambang</th>
                      <th className="text-caption text-fossil font-normal px-6 py-3">Status</th>
                      <th className="text-caption text-fossil font-normal px-6 py-3">Harga</th>
                      <th className="text-caption text-fossil font-normal px-6 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedProducts.map((p) => {
                      const total = getProductStock(p.id);
                      const threshold = thresholdFor(p.id);
                      return (
                        <tr
                          key={p.id}
                          onClick={() => setSelected(p)}
                          className="border-b border-sand last:border-0 hover:bg-sand/40 cursor-pointer"
                        >
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-3">
                              {p.image_url ? (
                                <img
                                  src={p.image_url}
                                  alt={p.name}
                                  className="w-10 h-10 rounded-lg object-cover border border-ash shrink-0 bg-sand"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-lg border border-ash/80 bg-sand inline-flex items-center justify-center text-pebble shrink-0">
                                  <Icon name="inventory" size={16} />
                                </div>
                              )}
                              <div>
                                <p className="text-[15px] text-ink font-medium">{p.name}</p>
                                <p className="text-caption text-fossil">{p.unit}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3.5">
                            <span className="text-caption text-fossil tnum">{p.sku}</span>
                          </td>
                          <td className="px-6 py-3.5">
                            <Badge variant="outline">{categoryName(p.category_id)}</Badge>
                          </td>
                          <td className="px-6 py-3.5">
                            <span className="tnum text-[15px] text-ink">{formatNumber(total)}</span>
                          </td>
                          <td className="px-6 py-3.5">
                            <span className="text-caption text-fossil tnum">{formatNumber(threshold)}</span>
                          </td>
                          <td className="px-6 py-3.5">
                            {total === 0 ? (
                              <Badge variant="ink">Habis</Badge>
                            ) : total <= threshold ? (
                              <Badge variant="accent">Menipis</Badge>
                            ) : (
                              <Badge variant="neutral">Aman</Badge>
                            )}
                          </td>
                          <td className="px-6 py-3.5">
                            <span className="tnum text-[15px] text-ink">{formatIDR(p.sell_price)}</span>
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                title={`Ubah ${p.name}`}
                                aria-label={`Ubah ${p.name}`}
                                className="p-1.5 text-pebble hover:text-ink hover:bg-sand rounded-lg transition-colors"
                                onClick={(e) => handleStartEdit(p, e)}
                              >
                                <Icon name="edit" size={16} />
                              </button>
                              <button
                                type="button"
                                title={`Hapus ${p.name}`}
                                aria-label={`Hapus ${p.name}`}
                                className="p-1.5 text-pebble hover:text-rose-700 hover:bg-sand rounded-lg transition-colors"
                                onClick={(e) => handleDeleteProduct(p, e)}
                              >
                                <Icon name="trash" size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-6 pb-4">
              <Pagination
                currentPage={prodPage}
                totalPages={totalProdPages}
                totalItems={filtered.length}
                pageSize={PROD_PAGE_SIZE}
                onPageChange={setProdPage}
              />
            </div>
          </Card>
        </div>
      )}

      {tab === 'opname' && <StockOpnameTab />}

      {tab === 'po' && <PoOverviewTab canManage={canManagePo} />}

      {/* Modal pindai barcode */}
      <Modal open={scanOpen} onClose={() => setScanOpen(false)} title="Pindai Barcode" maxWidth="md">
        <BarcodeScanner onDetect={(code) => findByScan(code)} />
        <p className="text-caption text-fossil mt-2">Arahkan kamera ke barcode produk.</p>
        <div className="flex items-center gap-3 my-4">
          <span className="flex-1 border-t border-ash" />
          <span className="text-caption text-pebble">atau</span>
          <span className="flex-1 border-t border-ash" />
        </div>
        <div className="space-y-4">
          <Input
            label="Ketik SKU / barcode"
            value={scanCode}
            onChange={(e) => setScanCode(e.target.value)}
            onKeyDown={(e) => {
              // Alat scan USB mengetik kode lalu menekan Enter
              if (e.key === 'Enter') findByScan();
            }}
            inputMode="text"
            placeholder="mis. KOP-001 atau 8990001"
          />
          <Button full onClick={() => findByScan()}>
            Cari Produk
          </Button>
        </div>
      </Modal>

      {/* Modal tambah produk */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Tambah Produk" maxWidth="xl">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Input
              label="Nama produk"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="mis. Kopi Susu Aren"
            />
          </div>

          {/* Input Gambar Produk */}
          <div className="sm:col-span-2 p-3.5 rounded-xl border border-ash bg-bone/30 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-caption text-ink font-semibold flex items-center gap-1.5">
                <Icon name="camera" size={15} />
                Foto / Gambar Produk
              </label>
              {newImage && (
                <button
                  type="button"
                  onClick={() => setNewImage('')}
                  className="text-caption text-pebble hover:text-ink transition-colors"
                >
                  Hapus Foto
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {newImage ? (
                <div className="w-16 h-16 rounded-xl border border-ash overflow-hidden bg-sand shrink-0 shadow-sm">
                  <img src={newImage} alt="Preview" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl border border-dashed border-pebble flex flex-col items-center justify-center text-pebble bg-paper shrink-0">
                  <Icon name="camera" size={20} />
                  <span className="text-[10px] mt-0.5">No Img</span>
                </div>
              )}

              <div className="flex-1 min-w-0 space-y-2 w-full">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ash bg-paper hover:border-pebble text-[13px] font-medium text-ink transition-colors">
                    <Icon name="attach" size={14} />
                    <span>Upload Foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                  <span className="text-caption text-pebble">atau paste URL gambar</span>
                </div>
                <Input
                  placeholder="https://contoh.com/gambar-produk.jpg"
                  value={newImage.startsWith('data:') ? '(Foto dari perangkat terpilih)' : newImage}
                  onChange={(e) => setNewImage(e.target.value)}
                  disabled={newImage.startsWith('data:')}
                />
              </div>
            </div>

            {/* Pilihan Cepat Preset Gambar */}
            <div>
              <p className="text-[11px] text-fossil mb-1.5 font-medium">Pilihan Cepat Gambar:</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { name: '☕ Kopi', url: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=300&auto=format&fit=crop&q=80' },
                  { name: '🥐 Bakery', url: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=300&auto=format&fit=crop&q=80' },
                  { name: '🍵 Matcha', url: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=300&auto=format&fit=crop&q=80' },
                  { name: '🍛 Makanan', url: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=300&auto=format&fit=crop&q=80' },
                  { name: '🍿 Snack', url: 'https://images.unsplash.com/photo-1582293041079-7814c2f12063?w=300&auto=format&fit=crop&q=80' },
                  { name: '👕 Retail', url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=300&auto=format&fit=crop&q=80' },
                ].map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setNewImage(preset.url);
                      toast({ title: `Preset ${preset.name} dipilih`, icon: 'camera' });
                    }}
                    className="text-[11.5px] px-2.5 py-1 rounded-lg border border-ash bg-paper hover:border-ink transition-colors text-ink"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Input
            label="SKU"
            value={newSku}
            onChange={(e) => setNewSku(e.target.value)}
            hint="Kosongkan untuk auto-generate"
            placeholder="mis. KOP-004"
          />
          <Select
            label="Kategori"
            value={newCategory || (categories[0]?.id ?? '')}
            onChange={(e) => setNewCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <div className="sm:col-span-2">
            <PriceInputWithQuickAdd
              label="Harga Jual"
              value={Number(newSellPrice) || 0}
              onChange={(val) => setNewSellPrice(String(val))}
              costPrice={Number(newCostPrice) || 0}
              onOpenCalculator={() => {
                setCalcTarget('new');
                setCalcOpen(true);
              }}
              required
            />
          </div>

          <div className="sm:col-span-2">
            <PriceInputWithQuickAdd
              label="Harga Modal (HPP)"
              value={Number(newCostPrice) || 0}
              onChange={(val) => setNewCostPrice(String(val))}
              hint="Harga modal digunakan untuk menghitung margin laba kotor & laporan keuangan."
            />
          </div>

          <Input
            label={tenant.industry_template === 'services' ? 'Kapasitas awal (sesi)' : 'Stok awal fisik'}
            type="number"
            min={0}
            value={newInitialStock}
            onChange={(e) => setNewInitialStock(e.target.value)}
            placeholder="50"
          />
          <Select
            label="Satuan Unit"
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
          >
            {tenant.industry_template === 'services' ? (
              <>
                <option value="layanan">layanan</option>
                <option value="sesi">sesi</option>
                <option value="jam">jam</option>
                <option value="paket">paket</option>
                <option value="orang">orang</option>
                <option value="kendaraan">kendaraan</option>
              </>
            ) : tenant.industry_template === 'manufacturing' ? (
              <>
                <option value="unit">unit</option>
                <option value="batch">batch</option>
                <option value="lusin">lusin</option>
                <option value="kg">kg</option>
                <option value="meter">meter</option>
                <option value="lembar">lembar</option>
                <option value="roll">roll</option>
              </>
            ) : (
              <>
                <option value="pcs">pcs</option>
                <option value="porsi">porsi</option>
                <option value="cup">cup</option>
                <option value="botol">botol</option>
                <option value="box">box</option>
                <option value="pack">pack</option>
                <option value="kg">kg</option>
              </>
            )}
          </Select>
          {customFields.map((f) =>
            f.type === 'dropdown' ? (
              <Select key={f.id} label={f.label} defaultValue="">
                <option value="">Pilih…</option>
                {(f.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </Select>
            ) : f.type === 'number' ? (
              <Input key={f.id} label={f.label} type="number" />
            ) : f.type === 'date' ? (
              <Input key={f.id} label={f.label} type="date" />
            ) : (
              <Input key={f.id} label={f.label} />
            ),
          )}
          {customFields.length > 0 && (
            <p className="sm:col-span-2 text-caption text-fossil mt-1">Field kustom dari Form Builder</p>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={() => setAddOpen(false)}>
            Batal
          </Button>
          <Button
            onClick={() => {
              if (!newName.trim()) {
                toast({ title: 'Masukkan nama produk', icon: 'warning' });
                return;
              }
              const sellP = Math.max(0, Number(newSellPrice) || 0);
              const costP = Math.max(0, Number(newCostPrice) || Math.round(sellP * 0.6));
              const stockQty = Math.max(0, Number(newInitialStock) || 0);
              const skuVal = newSku.trim() || `SKU-${Date.now().toString().slice(-4)}`;
              const catVal = newCategory || categories[0]?.id || `cat-${Date.now()}`;

              const newProduct: Product = {
                id: `prod-${Date.now()}`,
                tenant_id: tenant.id,
                category_id: catVal,
                sku: skuVal,
                barcode: `899${Date.now().toString().slice(-9)}`,
                name: newName.trim(),
                sell_price: sellP,
                cost_price: costP,
                unit: newUnit,
                image_url: newImage.trim() || undefined,
                custom_fields: {},
              };

              useBusinessStore.getState().addProduct(newProduct, stockQty);
              toast({ title: `${newName} berhasil ditambahkan!`, icon: 'check' });
              setAddOpen(false);
              setNewName('');
              setNewSku('');
              setNewSellPrice('');
              setNewCostPrice('');
              setNewInitialStock('');
              setNewImage('');
            }}
          >
            Simpan Produk
          </Button>
        </div>
      </Modal>

      {/* Modal detail produk */}
      <Modal open={selected !== null} onClose={() => setSelected(null)} title={selected?.name} maxWidth="lg">
        {selected && (
          <div className="space-y-5">
            {selected.image_url && (
              <div className="w-full h-48 rounded-xl overflow-hidden border border-ash bg-sand shadow-inner">
                <img src={selected.image_url} alt={selected.name} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="text-caption text-fossil tnum">{selected.sku}</span>
              <Badge variant="outline">{categoryName(selected.category_id)}</Badge>
              <span className="text-[15px] text-ink tnum">{formatIDR(selected.sell_price)}</span>
              <span className="text-caption text-fossil">
                Total stok <span className="tnum text-ink">{formatNumber(stockTotal(selected.id))}</span>{' '}
                {selected.unit}
              </span>
            </div>

            <div>
              <p className="text-caption text-fossil mb-2">Stok per gudang</p>
              <div className="divide-y divide-sand border border-ash rounded-xl overflow-hidden">
                {selectedStocks.length === 0 && (
                  <p className="px-4 py-3 text-body-sm text-fossil">Belum ada stok tercatat.</p>
                )}
                {selectedStocks.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-[15px] text-ink">{warehouseName(s.warehouse_id)}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <span className="tnum text-[15px] text-ink">{formatNumber(s.quantity)}</span>
                      {s.quantity <= s.min_threshold && <Badge variant="accent">Menipis</Badge>}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-caption text-fossil mb-2">Pergerakan terakhir</p>
              {selectedMovements.length === 0 ? (
                <p className="text-body-sm text-fossil">Belum ada pergerakan stok.</p>
              ) : (
                <div className="space-y-2">
                  {selectedMovements.map((m) => {
                    const badge = movementBadge[m.type];
                    return (
                      <div key={m.id} className="flex items-center gap-3">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        <span className="tnum text-[15px] text-ink">
                          {m.quantity > 0 ? `+${formatNumber(m.quantity)}` : formatNumber(m.quantity)}
                        </span>
                        <span className="text-caption text-fossil truncate">{m.note}</span>
                        <span className="ml-auto text-caption text-pebble whitespace-nowrap">
                          {timeAgo(m.created_at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-caption text-pebble">
              Tersimpan di {warehouses.length} gudang · diperbarui {timeAgo(new Date().toISOString())}
            </p>

            <div className="flex items-center justify-between pt-4 border-t border-sand">
              <Button
                variant="ghost"
                icon="trash"
                className="text-rose-700 hover:text-rose-800"
                onClick={() => handleDeleteProduct(selected)}
              >
                Hapus Produk
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setSelected(null)}>
                  Tutup
                </Button>
                <Button
                  variant="primary"
                  icon="edit"
                  onClick={() => {
                    const prod = selected;
                    setSelected(null);
                    handleStartEdit(prod);
                  }}
                >
                  Ubah Produk
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Ubah Data Produk (CRUD Edit) */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Ubah Data Produk" maxWidth="lg">
        <div className="grid sm:grid-cols-2 gap-4">
          <Input
            label="Nama produk"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="mis. Kopi Susu Aren"
            required
          />

          {/* Upload foto produk saat edit */}
          <div className="space-y-1 sm:col-span-2">
            <label className="block text-caption text-ink font-medium">Foto Produk</label>
            <div className="flex items-center gap-3">
              {editImage ? (
                <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-ash shrink-0 bg-sand">
                  <img src={editImage} alt="Preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setEditImage('')}
                    className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity text-caption"
                  >
                    Hapus
                  </button>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl border border-dashed border-ash bg-sand/40 flex items-center justify-center text-pebble shrink-0">
                  <Icon name="camera" size={20} />
                </div>
              )}
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleEditImageUpload}
                  className="text-caption text-fossil file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-caption file:font-medium file:bg-sand file:text-ink hover:file:bg-sand/80 cursor-pointer"
                />
                <p className="text-[11.5px] text-fossil mt-0.5">Format JPG/PNG/WebP, maksimal 2MB.</p>
              </div>
            </div>
          </div>

          <Input
            label="SKU"
            value={editSku}
            onChange={(e) => setEditSku(e.target.value)}
            placeholder="mis. KOP-001"
          />
          <Select
            label="Kategori"
            value={editCategory || (categories[0]?.id ?? '')}
            onChange={(e) => setEditCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <div className="sm:col-span-2">
            <PriceInputWithQuickAdd
              label="Harga Jual"
              value={Number(editSellPrice) || 0}
              onChange={(val) => setEditSellPrice(String(val))}
              costPrice={Number(editCostPrice) || 0}
              onOpenCalculator={() => {
                setCalcTarget('edit');
                setCalcOpen(true);
              }}
              required
            />
          </div>

          <div className="sm:col-span-2">
            <PriceInputWithQuickAdd
              label="Harga Modal (HPP)"
              value={Number(editCostPrice) || 0}
              onChange={(val) => setEditCostPrice(String(val))}
              hint="Harga modal digunakan untuk menghitung margin laba kotor & laporan keuangan."
            />
          </div>

          <Input
            label={tenant.industry_template === 'services' ? 'Kapasitas awal (sesi)' : 'Total Stok Fisik'}
            type="number"
            min={0}
            value={editStockQty}
            onChange={(e) => setEditStockQty(e.target.value)}
            placeholder="50"
            required
          />
          <Select
            label="Satuan Unit"
            value={editUnit}
            onChange={(e) => setEditUnit(e.target.value)}
          >
            {tenant.industry_template === 'services' ? (
              <>
                <option value="layanan">layanan</option>
                <option value="sesi">sesi</option>
                <option value="jam">jam</option>
                <option value="paket">paket</option>
                <option value="orang">orang</option>
                <option value="kendaraan">kendaraan</option>
              </>
            ) : tenant.industry_template === 'manufacturing' ? (
              <>
                <option value="unit">unit</option>
                <option value="batch">batch</option>
                <option value="lusin">lusin</option>
                <option value="kg">kg</option>
                <option value="meter">meter</option>
                <option value="lembar">lembar</option>
                <option value="roll">roll</option>
              </>
            ) : (
              <>
                <option value="pcs">pcs</option>
                <option value="porsi">porsi</option>
                <option value="cup">cup</option>
                <option value="botol">botol</option>
                <option value="box">box</option>
                <option value="pack">pack</option>
                <option value="kg">kg</option>
              </>
            )}
          </Select>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={() => setEditOpen(false)}>
            Batal
          </Button>
          <Button variant="primary" onClick={handleSaveEdit}>
            Simpan Perubahan
          </Button>
        </div>
      </Modal>

      {/* Kalkulator Bisnis & Penetapan Harga Cerdas AI */}
      <BusinessPricingCalculatorModal
        isOpen={calcOpen}
        onClose={() => setCalcOpen(false)}
        productName={calcTarget === 'new' ? newName : editName}
        initialCost={Number(calcTarget === 'new' ? newCostPrice : editCostPrice) || 0}
        initialSellPrice={Number(calcTarget === 'new' ? newSellPrice : editSellPrice) || 0}
        unit={calcTarget === 'new' ? newUnit : editUnit}
        onApply={(calculatedSell, calculatedCost) => {
          if (calcTarget === 'new') {
            setNewSellPrice(String(calculatedSell));
            setNewCostPrice(String(calculatedCost));
          } else {
            setEditSellPrice(String(calculatedSell));
            setEditCostPrice(String(calculatedCost));
          }
          toast({
            title: 'Harga & HPP berhasil diterapkan!',
            description: `Harga jual: ${formatIDR(calculatedSell)} · Modal: ${formatIDR(calculatedCost)}`,
            icon: 'check',
          });
        }}
      />

      {/* Modal Excel & AI Smart Mapping */}
      <AiExcelMapperModal
        isOpen={excelModalOpen}
        onClose={() => setExcelModalOpen(false)}
      />
    </div>
  );
}
