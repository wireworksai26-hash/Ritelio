import { useMemo, useState } from 'react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Pagination } from '../components/ui/Pagination';
import { Select } from '../components/ui/controls';
import { Modal } from '../components/ui/Modal';
import { Icon } from '../components/icons/Icon';
import { Reveal } from '../components/Reveal';
import { cn, formatDateTime, formatIDR, uid } from '../lib/format';
import { ReceiptPrintSheet, type ReceiptData } from '../components/pos/ReceiptPrint';
import { categoryName, productName, stockTotal } from '../lib/stats';
import { useAuthStore } from '../stores/authStore';
import { useBusinessStore } from '../stores/businessStore';
import { cartCount, cartTotal, useCartStore } from '../stores/cartStore';
import { useSyncStore } from '../stores/syncStore';
import { toast } from '../stores/toastStore';
import type { PaymentMethod, SalesTransaction } from '../types';

const paymentOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'Tunai' },
  { value: 'qris', label: 'QRIS' },
  { value: 'debit', label: 'Debit' },
  { value: 'transfer', label: 'Transfer' },
];

const PAGE_SIZE = 6; // 6 item per page di POS agar pas di HP & Desktop

export default function POS() {
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState('semua');
  const [page, setPage] = useState(1);
  const [lastTx, setLastTx] = useState<SalesTransaction | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const allProducts = useBusinessStore((s) => s.products);
  const allCategories = useBusinessStore((s) => s.categories);
  const allStocks = useBusinessStore((s) => s.stocks);
  const tenant = useBusinessStore((s) => s.tenant);
  const allCustomers = useBusinessStore((s) => s.customers);

  const products = useMemo(() => {
    return allProducts.filter((p) => p.tenant_id === tenant.id || (!p.tenant_id && tenant.id === 'tenant-newsem'));
  }, [allProducts, tenant.id]);

  const categories = useMemo(() => {
    return allCategories.filter((c) => c.tenant_id === tenant.id || (!c.tenant_id && tenant.id === 'tenant-newsem'));
  }, [allCategories, tenant.id]);

  const customers = useMemo(() => {
    return allCustomers.filter((c) => c.tenant_id === tenant.id || (!c.tenant_id && tenant.id === 'tenant-newsem'));
  }, [allCustomers, tenant.id]);

  const stocks = useMemo(() => {
    const pIds = new Set(products.map((p) => p.id));
    return allStocks.filter((s) => pIds.has(s.product_id));
  }, [allStocks, products]);

  const { items, customerId, paymentMethod, add, setQty, setCustomer, setPaymentMethod, clear } =
    useCartStore();
  const isOnline = useSyncStore((s) => s.isOnline);
  const pendingLocal = useSyncStore((s) => s.pendingLocal);
  const user = useAuthStore((s) => s.user);

  const total = cartTotal(items);

  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of allStocks) {
      map.set(s.product_id, (map.get(s.product_id) || 0) + Number(s.quantity));
    }
    return map;
  }, [allStocks]);

  const getProductStock = (productId: string) => stockMap.get(productId) ?? 0;

  const thresholdFor = (productId: string): number => {
    return stocks
      .filter((s) => s.product_id === productId)
      .reduce((max, s) => Math.max(max, Number(s.min_threshold)), 0);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const matchQuery = !q || p.name.toLowerCase().includes(q);
      const matchCat = catFilter === 'semua' || p.category_id === catFilter;
      return matchQuery && matchCat;
    });
  }, [products, query, catFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedProducts = useMemo(() => {
    return filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }, [filtered, page, stockMap]);

  function onPay() {
    const now = new Date().toISOString();
    const invoiceNum = `INV-${Date.now().toString().slice(-6)}`;
    const tx: SalesTransaction = {
      id: uid('txn'),
      tenant_id: tenant.id,
      outlet_id: user?.outlet_id || 'outlet-1',
      cashier_id: user?.id ?? 'u-3',
      customer_id: customerId,
      client_generated_id: uid('cgid'),
      sync_status: isOnline ? 'synced' : 'pending',
      client_timestamp: now,
      server_timestamp: isOnline ? now : null,
      total: cartTotal(items),
      payment_method: paymentMethod,
      items: items.map((i) => ({ product_id: i.product_id, qty: i.qty, price: i.price })),
    };

    useBusinessStore.getState().addTransaction(tx);

    if (!isOnline) {
      useSyncStore.getState().queueTransaction(tx);
    }
    clear();
    setCartOpen(false);
    setLastTx(tx);
    toast({
      title: 'Pembayaran Berhasil!',
      description: `Transaksi #${invoiceNum} sebesar ${formatIDR(tx.total)} tercatat.`,
      icon: 'check',
    });
  }

  const paymentLabel = paymentOptions.find((p) => p.value === lastTx?.payment_method)?.label ?? '-';
  const lastCustomer = lastTx?.customer_id
    ? customers.find((c) => c.id === lastTx.customer_id)
    : null;
  const outletName = (id: string): string =>
    useBusinessStore.getState().outlets.find((o) => o.id === id)?.name ?? 'Outlet';

  // Isi keranjang — dipakai ulang: panel desktop (Card) & bottom sheet mobile (Modal)
  const cartBody = (
    <>
      <div className="max-h-[320px] overflow-y-auto divide-y divide-sand px-5">
        {items.length === 0 ? (
          <div className="py-8">
            <EmptyState icon="pos" title="Keranjang kosong" body="Ketuk produk untuk menambahkan." />
          </div>
        ) : (
          items.map((i) => (
            <div key={i.product_id} className="py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[15px] text-ink truncate">{productName(i.product_id)}</p>
                <p className="text-caption text-fossil tnum">{formatIDR(i.price)}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  aria-label="Kurangi"
                  onClick={() => setQty(i.product_id, i.qty - 1)}
                  className="w-7 h-7 rounded-md border border-ash hover:bg-sand inline-flex items-center justify-center text-ink transition-colors"
                >
                  <Icon name="minus" size={14} />
                </button>
                <span className="tnum w-7 text-center text-[15px] text-ink">{i.qty}</span>
                <button
                  aria-label="Tambah"
                  onClick={() => setQty(i.product_id, i.qty + 1)}
                  className="w-7 h-7 rounded-md border border-ash hover:bg-sand inline-flex items-center justify-center text-ink transition-colors"
                >
                  <Icon name="plus" size={14} />
                </button>
              </div>
              <span className="tnum text-[15px] text-ink w-16 text-right">
                {formatIDR(i.qty * i.price)}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="px-5 py-3 border-t border-ash">
        <Select
          label="Pelanggan (opsional)"
          value={customerId ?? ''}
          onChange={(e) => setCustomer(e.target.value || null)}
        >
          <option value="">Tamu / Walk-in</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.loyalty_points} poin
            </option>
          ))}
        </Select>
      </div>

      <div className="px-5 py-3 border-t border-ash">
        <p className="text-caption text-fossil mb-2">Metode pembayaran</p>
        <div className="grid grid-cols-4 gap-1.5">
          {paymentOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPaymentMethod(opt.value)}
              className={cn(
                'rounded-lg border px-2 py-2 text-caption text-center transition-colors',
                paymentMethod === opt.value
                  ? 'bg-ink text-paper border-ink'
                  : 'bg-paper text-fossil border-ash hover:border-pebble',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-4 border-t border-ash space-y-1.5">
        <div className="flex justify-between text-body-sm">
          <span className="text-fossil">Subtotal</span>
          <span className="tnum text-ink">{formatIDR(total)}</span>
        </div>
        <div className="flex justify-between text-body-sm">
          <span className="text-fossil">Pajak &amp; diskon</span>
          <span className="text-caption text-fossil">—</span>
        </div>
        <div className="flex justify-between items-baseline pt-2 border-t border-sand">
          <span className="text-[15px] text-ink">Total</span>
          <span className="tnum text-heading-sm font-light text-ink">{formatIDR(total)}</span>
        </div>
      </div>

      <div className="p-5 pt-2">
        <Button full size="lg" icon="check" disabled={items.length === 0} onClick={onPay}>
          Bayar
        </Button>
        {items.length > 0 && (
          <button
            onClick={clear}
            className="lg:hidden mt-2 w-full text-center text-caption text-fossil hover:text-ink transition-colors py-1.5"
          >
            Kosongkan keranjang
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className="w-full min-w-0 max-w-full grid lg:grid-cols-[1fr_380px] gap-6 items-start">
      {!isOnline && (
        <Card className="bg-sand border-transparent p-3 lg:col-span-2 flex items-center gap-2 text-body-sm text-ink w-full min-w-0">
          <Icon name="offline" size={16} className="shrink-0" />
          <span className="flex-1 min-w-0 text-[13.5px] sm:text-body-sm">
            Mode Offline — transaksi disimpan lokal, struk tetap bisa dicetak, sinkron otomatis saat online.
          </span>
          {pendingLocal.length > 0 && (
            <Badge variant="accent" className="shrink-0">
              {pendingLocal.length} antre
            </Badge>
          )}
        </Card>
      )}

      {/* Kolom kiri: katalog produk */}
      <div className="w-full min-w-0 max-w-full">
        <div className="relative w-full">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pebble" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Cari menu produk…"
            className="w-full bg-paper border border-pebble/70 rounded-lg pl-9 pr-8 py-2.5 text-[15px] placeholder:text-pebble focus:border-ink focus:outline-none transition-colors"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-fossil hover:text-ink text-body-sm"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 mt-3 no-scrollbar touch-pan-x w-full">
          {[{ id: 'semua', name: 'Semua' }, ...categories].map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setCatFilter(c.id);
                setPage(1);
              }}
              className={cn(
                'rounded-lg border px-3 py-1.5 sm:px-3.5 sm:py-2 text-caption sm:text-body-sm whitespace-nowrap transition-colors shrink-0',
                catFilter === c.id
                  ? 'bg-ink text-paper border-ink font-medium'
                  : 'bg-paper text-fossil border-ash hover:border-pebble',
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        <Reveal className="mt-4 w-full min-w-0" stagger={0.03} key={`${catFilter}-${query}-${page}`}>
          {filtered.length === 0 ? (
            <Card className="w-full">
              <EmptyState icon="search" title="Menu tidak ditemukan" body="Coba kata kunci atau kategori lain." />
            </Card>
          ) : (
            <div className="space-y-4 w-full min-w-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5 w-full min-w-0">
                {pagedProducts.map((p) => {
                  const stock = getProductStock(p.id);
                  const low = stock > 0 && stock <= thresholdFor(p.id);
                  return (
                    <button
                      key={p.id}
                      disabled={stock === 0}
                      onClick={() => add(p)}
                      className={cn(
                        'w-full min-w-0 text-left disabled:cursor-not-allowed group focus:outline-none flex flex-col',
                        stock === 0 && 'opacity-50',
                      )}
                    >
                      <Card className="w-full min-w-0 p-0 overflow-hidden h-full hover:border-ink active:scale-[0.98] transition-all flex flex-col justify-between bg-paper group-hover:shadow-sm">
                        {p.image_url ? (
                          <div className="w-full h-24 sm:h-28 bg-sand overflow-hidden relative">
                            <img
                              src={p.image_url}
                              alt={p.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                              {low && <Badge variant="accent" className="text-[10px] px-1.5 py-0.5 shadow-sm">Sisa {stock}</Badge>}
                              {stock === 0 && <Badge variant="ink" className="text-[10px] px-1.5 py-0.5 shadow-sm">Habis</Badge>}
                            </div>
                          </div>
                        ) : null}

                        <div className="p-3 sm:p-3.5 flex flex-col justify-between flex-1 w-full min-w-0 gap-2">
                          <div className="w-full min-w-0">
                            <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 w-full min-w-0">
                              <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 max-w-[90px] sm:max-w-none truncate">
                                {categoryName(p.category_id)}
                              </Badge>
                              {!p.image_url && low && <Badge variant="accent" className="text-[11px] px-1.5 py-0.5 shrink-0">Sisa {stock}</Badge>}
                              {!p.image_url && stock === 0 && <Badge variant="ink" className="text-[11px] px-1.5 py-0.5 shrink-0">Habis</Badge>}
                            </div>
                            <p className="text-[13.5px] sm:text-[14.5px] text-ink font-medium leading-snug line-clamp-2 mt-1.5 min-h-[36px] sm:min-h-[40px] break-words">
                              {p.name}
                            </p>
                          </div>
                          <span className="tnum text-caption sm:text-body-sm text-smoke font-semibold pt-1 border-t border-sand">
                            {formatIDR(p.sell_price)}
                          </span>
                        </div>
                      </Card>
                    </button>
                  );
                })}
              </div>

              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={filtered.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </div>
          )}
        </Reveal>
      </div>

      {/* Kolom kanan: pesanan (desktop, sticky) */}
      <div className="hidden lg:block lg:sticky lg:top-24">
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-ash flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <p className="text-[15px] text-ink">Pesanan</p>
              <Badge variant="neutral" className="tnum">
                {cartCount(items)} item
              </Badge>
            </div>
            {items.length > 0 && (
              <Button variant="subtle" size="sm" icon="trash" onClick={clear}>
                Kosongkan
              </Button>
            )}
          </div>
          {cartBody}
        </Card>
      </div>

      {/* Bar keranjang mengambang (mobile) — di atas bottom nav */}
      {items.length > 0 && !cartOpen && (
        <div
          className="lg:hidden fixed inset-x-3 sm:inset-x-4 z-30 animate-fade-in"
          style={{ bottom: 'calc(62px + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            onClick={() => setCartOpen(true)}
            className="w-full rounded-xl bg-ink text-paper px-4 py-3 sm:py-3.5 flex items-center gap-3 shadow-[0_8px_24px_rgba(0,0,0,0.18)] active:scale-[0.99] transition-transform"
          >
            <Icon name="pos" size={18} />
            <span className="text-[14px] sm:text-[15px] font-medium">Pesanan · {cartCount(items)} item</span>
            <span className="ml-auto tnum text-[14px] sm:text-[15px] font-medium">{formatIDR(total)}</span>
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
      )}

      {/* Keranjang sebagai bottom sheet (mobile) */}
      <Modal open={cartOpen} onClose={() => setCartOpen(false)} title="Pesanan" maxWidth="lg">
        <div className="-mx-6 -mb-6">{cartBody}</div>
      </Modal>

      {/* Modal struk */}
      <Modal
        open={lastTx !== null}
        onClose={() => setLastTx(null)}
        title="Transaksi Berhasil"
        maxWidth="sm"
      >
        {lastTx && (
          <div>
            <div className="rounded-xl bg-bone border border-ash p-5">
              <p className="text-center text-[15px] text-ink">
                {tenant.name} — {outletName(lastTx.outlet_id)}
              </p>
              <p className="text-caption text-fossil text-center mt-1">
                {formatDateTime(lastTx.client_timestamp)}
              </p>
              <div className="border-t border-dashed border-ash my-3" />
              <div className="space-y-1.5">
                {lastTx.items.map((i) => (
                  <div key={i.product_id} className="flex justify-between text-body-sm">
                    <span className="text-ink">
                      {i.qty}× {productName(i.product_id)}
                    </span>
                    <span className="tnum text-ink">{formatIDR(i.qty * i.price)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-dashed border-ash my-3" />
              <div className="flex justify-between">
                <span className="text-[15px] text-ink">Total</span>
                <span className="tnum text-[15px] text-ink">{formatIDR(lastTx.total)}</span>
              </div>
              <p className="text-caption text-fossil mt-1.5">
                {paymentLabel}
                {lastCustomer ? ` · ${lastCustomer.name}` : ''}
              </p>
              <div className="flex justify-center mt-2">
                {isOnline ? (
                  <Badge variant="neutral" icon="check">
                    Tersinkron
                  </Badge>
                ) : (
                  <Badge variant="accent" icon="offline">
                    Tersimpan lokal — menunggu sinkron
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                variant="ghost"
                full
                icon="printer"
                onClick={() =>
                  setReceipt({
                    businessName: tenant.name,
                    outletName: outletName(lastTx.outlet_id),
                    timestamp: lastTx.client_timestamp,
                    items: lastTx.items.map((i) => ({ name: productName(i.product_id), qty: i.qty, price: i.price })),
                    total: lastTx.total,
                    paymentLabel,
                    customerName: lastCustomer?.name,
                    reference: lastTx.client_generated_id || lastTx.id,
                  })
                }
              >
                Cetak Struk
              </Button>
              <Button
                full
                icon="plus"
                onClick={() => {
                  clear();
                  setLastTx(null);
                }}
              >
                Transaksi Baru
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ReceiptPrintSheet data={receipt} onDone={() => setReceipt(null)} />
    </div>
  );
}
