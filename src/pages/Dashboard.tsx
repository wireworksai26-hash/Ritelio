import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Reveal } from '../components/Reveal';
import { BarChart } from '../components/charts/BarChart';
import { Icon } from '../components/icons/Icon';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { Pagination } from '../components/ui/Pagination';
import { Stat } from '../components/ui/Stat';
import { useModuleStore } from '../stores/moduleStore';
import { formatDate, formatIDR, formatNumber, greeting } from '../lib/format';
import {
  conflictCount,
  lowStockItems,
  outletPerformance,
  pendingSyncCount,
  salesByDay,
  salesToday,
  topProducts,
} from '../lib/stats';
import { useAssistantStore } from '../stores/assistantStore';
import { useAuthStore } from '../stores/authStore';
import { useBusinessStore } from '../stores/businessStore';
import { useOutletStore } from '../stores/outletStore';
import { useSyncStore } from '../stores/syncStore';
import { toast } from '../stores/toastStore';

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const tenant = useBusinessStore((s) => s.tenant);
  const allOutlets = useBusinessStore((s) => s.outlets);
  const allProducts = useBusinessStore((s) => s.products);
  const allStocks = useBusinessStore((s) => s.stocks);
  const allTransactions = useBusinessStore((s) => s.transactions);
  const isOnline = useSyncStore((s) => s.isOnline);
  const pendingLocal = useSyncStore((s) => s.pendingLocal);
  const selected = useOutletStore((s) => s.selected);
  const isAssistantModuleActive = useModuleStore((s) => s.isActive('assistant'));

  const outlets = useMemo(() => allOutlets.filter((o) => !o.tenant_id || o.tenant_id === tenant.id), [allOutlets, tenant.id]);
  const products = useMemo(() => allProducts.filter((p) => p.tenant_id === tenant.id || (!p.tenant_id && tenant.id === 'tenant-newsem')), [allProducts, tenant.id]);

  const [stockQuery, setStockQuery] = useState('');
  const [stockPage, setStockPage] = useState(1);
  const STOCK_PAGE_SIZE = 4;

  const [topQuery, setTopQuery] = useState('');
  const [topPage, setTopPage] = useState(1);
  const TOP_PAGE_SIZE = 5;

  const firstName = user?.name.split(' ')[0] ?? 'Pengguna';
  const outletLabel =
    selected === 'all'
      ? 'Semua Outlet'
      : `Outlet ${outlets.find((o) => o.id === selected)?.name ?? ''}`;
  const pendingTotal = pendingSyncCount() + pendingLocal.length;
  const today = useMemo(() => salesToday(), [allTransactions, selected, tenant.id]);
  const lowStock = useMemo(() => lowStockItems(), [allStocks, selected, tenant.id]);

  // Paket AI hanya aktif jika paket tenant bukan 'basic' dan modul assistant aktif
  const isAiPlan = tenant.subscription_plan === 'plus_ai' || tenant.subscription_plan === 'custom';
  const isAiActive = isAiPlan && isAssistantModuleActive;

  // Generate Digest AI Dinamis & Riil berdasarkan data aktual
  const allTopProducts = useMemo(() => topProducts(7, 10), [allTransactions, tenant.id, selected]);
  const topProdName = allTopProducts[0]?.product?.name;

  const dynamicDigestText = useMemo(() => {
    if (today.count > 0) {
      return `Hari ini: ${today.count} transaksi tercatat senilai ${formatIDR(today.total)}. ${
        topProdName ? `${topProdName} memimpin transaksi.` : ''
      } ${
        lowStock.length > 0
          ? `${lowStock.length} produk membutuhkan restock.`
          : 'Semua stok produk dalam kondisi aman.'
      }`;
    }
    return `Sistem aktif memantau ${tenant.name}. Belum ada transaksi baru hari ini. ${
      lowStock.length > 0
        ? `Perhatian: ${lowStock.length} produk berada di bawah ambang batas stok.`
        : `${products.length} produk siap dijual melalui kasir POS.`
    }`;
  }, [today, topProdName, lowStock.length, tenant.name, products.length]);

  const filteredTopProducts = useMemo(() => {
    if (!topQuery.trim()) return allTopProducts;
    const q = topQuery.toLowerCase();
    return allTopProducts.filter((t) => t.product.name.toLowerCase().includes(q));
  }, [allTopProducts, topQuery]);

  const totalTopPages = Math.max(1, Math.ceil(filteredTopProducts.length / TOP_PAGE_SIZE));
  const pagedTopProducts = filteredTopProducts.slice(
    (topPage - 1) * TOP_PAGE_SIZE,
    topPage * TOP_PAGE_SIZE,
  );

  const filteredLowStock = useMemo(() => {
    if (!stockQuery.trim()) return lowStock;
    const q = stockQuery.toLowerCase();
    return lowStock.filter(
      (s) => s.product.name.toLowerCase().includes(q) || s.warehouse.toLowerCase().includes(q),
    );
  }, [lowStock, stockQuery]);

  const totalStockPages = Math.max(1, Math.ceil(filteredLowStock.length / STOCK_PAGE_SIZE));
  const pagedLowStock = filteredLowStock.slice(
    (stockPage - 1) * STOCK_PAGE_SIZE,
    stockPage * STOCK_PAGE_SIZE,
  );

  return (
    <div className="space-y-6">
      {/* Banner status offline / antrean sinkronisasi */}
      {(!isOnline || pendingTotal > 0) && (
        <Reveal>
          <Card className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-body-sm">
            <div className="flex items-center gap-2 min-w-0">
              <Icon name={isOnline ? 'sync' : 'offline'} size={16} className="text-smoke shrink-0" />
              <span className="text-ink">
                {isOnline
                  ? `${pendingTotal} transaksi menunggu sinkronisasi.`
                  : 'Mode offline aktif — transaksi disimpan lokal dan disinkronkan otomatis.'}
              </span>
            </div>
            <Button
              variant="subtle"
              size="sm"
              className="self-end sm:self-auto shrink-0"
              onClick={() => {
                useSyncStore.getState().syncNow();
                toast({ title: 'Sinkronisasi selesai', icon: 'sync' });
              }}
            >
              Sinkronkan
            </Button>
          </Card>
        </Reveal>
      )}

      {/* Header halaman */}
      <Reveal>
        <PageHeader
          title={`${greeting()}, ${firstName}`}
          subtitle={`${tenant.name} · ${outletLabel} · ${formatDate(new Date().toISOString())}`}
          actions={
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="ghost"
                icon="scan"
                className="flex-1 sm:flex-initial"
                onClick={() =>
                  toast({
                    title: 'Pindai Barcode',
                    description: 'Kamera scanner aktif di build ini segera.',
                    icon: 'scan',
                  })
                }
              >
                Scan
              </Button>
              <Button
                variant="primary"
                icon="plus"
                className="flex-1 sm:flex-initial"
                onClick={() => navigate('/app/pos')}
              >
                Transaksi Baru
              </Button>
            </div>
          }
        />
      </Reveal>

      {/* Digest AI harian (Hanya tampil jika paket +AI/Custom aktif & modul aktif) */}
      {isAiActive && (
        <Reveal delay={0.05}>
          <Card className="p-4 sm:p-6 flex flex-col sm:flex-row gap-4 sm:gap-5 bg-sand/40 border-ash">
            <div className="hidden sm:flex w-28 shrink-0 rounded-xl bg-sand items-center justify-center border border-ash/60">
              <Icon name="assistant" size={28} className="text-ink" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="ink" icon="assistant">
                  Retalio Intelligence · Digest Harian
                </Badge>
                <Badge variant="outline" className="text-[11px]">Real-Time</Badge>
              </div>
              <p className="mt-2.5 sm:mt-3 text-[15px] sm:text-[16.5px] text-ink leading-relaxed font-normal">
                {dynamicDigestText}
              </p>
              <p className="text-caption text-fossil mt-2 sm:mt-2.5">
                Sumber data: sales_transactions · inventory_stocks · {tenant.name}
              </p>
              <div className="mt-3.5 sm:mt-4 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  icon="assistant"
                  onClick={() => useAssistantStore.getState().open()}
                >
                  Tanya Asisten AI
                </Button>
                <Button
                  variant="subtle"
                  size="sm"
                  icon="chevron-right"
                  onClick={() => navigate('/app/notifications')}
                >
                  Semua Notifikasi &amp; Insight
                </Button>
              </div>
            </div>
          </Card>
        </Reveal>
      )}

      {/* Statistik utama dengan GSAP child stagger */}
      <Reveal delay={0.08} stagger={0.07}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          <Stat
            label="Penjualan Hari Ini"
            value={formatIDR(today.total)}
            delta={today.deltaStr}
            trend={today.deltaStr.startsWith('+') && today.total > 0 ? 'up' : 'flat'}
          />
          <Stat label="Transaksi" value={formatNumber(today.count)} hint={outletLabel} />
          <Stat label="Stok Menipis" value={String(lowStock.length)} hint="perlu restock" />
          <Stat label="Perlu Review" value={String(conflictCount())} hint="konflik sinkron" />
        </div>
      </Reveal>

      {/* Grafik penjualan + produk terlaris */}
      <Reveal delay={0.15}>
        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Penjualan 14 Hari"
              subtitle="Semua outlet · termasuk transaksi offline"
            />
            <CardBody>
              <BarChart data={salesByDay(14)} height={200} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Produk Terlaris" subtitle="7 hari terakhir" />
            <CardBody>
              <div className="relative mb-3">
                <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-pebble" />
                <input
                  value={topQuery}
                  onChange={(e) => {
                    setTopQuery(e.target.value);
                    setTopPage(1);
                  }}
                  placeholder="Cari produk terlaris…"
                  className="w-full bg-bone/70 border border-ash rounded-lg pl-8 pr-7 py-1.5 text-caption placeholder:text-pebble focus:border-ink focus:bg-paper focus:outline-none transition-colors"
                />
                {topQuery && (
                  <button
                    onClick={() => {
                      setTopQuery('');
                      setTopPage(1);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fossil hover:text-ink text-[12px]"
                  >
                    ✕
                  </button>
                )}
              </div>

              {pagedTopProducts.length === 0 ? (
                <p className="py-6 text-center text-caption text-fossil">Tidak ada produk cocok.</p>
              ) : (
                <ul className="divide-y divide-sand">
                  {pagedTopProducts.map((t, i) => (
                    <li key={t.product.name} className="py-2.5 flex items-center gap-3">
                      <span className="w-5 text-caption text-fossil tnum font-medium">
                        {(topPage - 1) * TOP_PAGE_SIZE + i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] sm:text-[15px] text-ink truncate font-normal">{t.product.name}</p>
                        <p className="text-caption text-fossil">
                          {t.qty} {t.product.unit} terjual
                        </p>
                      </div>
                      <span className="tnum text-[14px] sm:text-[15px] text-ink font-medium shrink-0">
                        {formatIDR(t.revenue)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <Pagination
                compact
                currentPage={topPage}
                totalPages={totalTopPages}
                totalItems={filteredTopProducts.length}
                pageSize={TOP_PAGE_SIZE}
                onPageChange={setTopPage}
              />
            </CardBody>
          </Card>
        </div>
      </Reveal>

      {/* Stok menipis + performa outlet */}
      <Reveal delay={0.15}>
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <Card>
            <CardHeader
              title="Stok Perlu Perhatian"
              action={
                <Button variant="ghost" size="sm" onClick={() => navigate('/app/inventory')}>
                  Inventori
                </Button>
              }
            />
            <CardBody>
              <div className="relative mb-3">
                <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-pebble" />
                <input
                  value={stockQuery}
                  onChange={(e) => {
                    setStockQuery(e.target.value);
                    setStockPage(1);
                  }}
                  placeholder="Cari produk menipis / gudang…"
                  className="w-full bg-bone/70 border border-ash rounded-lg pl-8 pr-7 py-1.5 text-caption placeholder:text-pebble focus:border-ink focus:bg-paper focus:outline-none transition-colors"
                />
                {stockQuery && (
                  <button
                    onClick={() => {
                      setStockQuery('');
                      setStockPage(1);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fossil hover:text-ink text-[12px]"
                  >
                    ✕
                  </button>
                )}
              </div>

              {pagedLowStock.length === 0 ? (
                <p className="py-6 text-center text-caption text-fossil">Semua stok terpantau aman.</p>
              ) : (
                <div className="divide-y divide-sand">
                  {pagedLowStock.map((s) => (
                    <div
                      key={`${s.product.name}-${s.warehouse}`}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="text-[14px] sm:text-[15px] text-ink truncate">{s.product.name}</p>
                        <p className="text-caption text-fossil mt-0.5">{s.warehouse}</p>
                      </div>
                      <div className="shrink-0">
                        {s.quantity === 0 ? (
                          <Badge variant="ink">Habis</Badge>
                        ) : (
                          <Badge variant="accent">Sisa {s.quantity}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Pagination
                compact
                currentPage={stockPage}
                totalPages={totalStockPages}
                totalItems={filteredLowStock.length}
                pageSize={STOCK_PAGE_SIZE}
                onPageChange={setStockPage}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Performa Outlet" subtitle="14 hari terakhir" />
            <CardBody>
              {outletPerformance(14).map((o) => (
                <div
                  key={o.id}
                  className="flex items-center gap-3 py-3 border-b border-sand last:border-0"
                >
                  <span className="w-9 h-9 rounded-lg bg-sand inline-flex items-center justify-center shrink-0">
                    <Icon name="store" size={16} className="text-smoke" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] text-ink truncate">Outlet {o.name}</p>
                    <p className="text-caption text-fossil">{o.count} transaksi</p>
                  </div>
                  <span className="tnum text-[15px] text-ink">{formatIDR(o.total)}</span>
                  <Badge
                    variant="outline"
                    icon={o.growthPct >= 0 ? 'trending-up' : 'trending-down'}
                  >
                    {o.growthPct >= 0 ? '+' : ''}
                    {o.growthPct}%
                  </Badge>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </Reveal>
    </div>
  );
}
