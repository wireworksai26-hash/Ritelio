import { useMemo, useState } from 'react';
import { AddAssetModal, AssetDetailModal, DepreciationModal, DisposeModal, StatusBadge } from '../components/assets/AssetModals';
import { methodLabel, num, type FiscalPeriod, type FixedAsset } from '../components/assets/assetTypes';
import { Icon } from '../components/icons/Icon';
import { Button } from '../components/ui/Button';
import { DataTable, StatRow, type Column } from '../components/ui/DataTable';
import { PageHeader } from '../components/ui/PageHeader';
import { cn, formatDate, formatIDR } from '../lib/format';
import { listOf, usePagedList, useResource } from '../lib/useResource';

type StatusFilter = 'active' | 'fully_depreciated' | 'disposed' | 'all';

const filterOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: 'active', label: 'Aktif' },
  { value: 'fully_depreciated', label: 'Habis disusutkan' },
  { value: 'disposed', label: 'Dihapus buku' },
  { value: 'all', label: 'Semua' },
];

export default function Assets() {
  const assets = useResource<FixedAsset[]>('/v1/assets');
  const periodsRes = useResource<FiscalPeriod[]>('/v1/finance/fiscal-periods');

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [addOpen, setAddOpen] = useState(false);
  const [depreciationOpen, setDepreciationOpen] = useState(false);
  const [detail, setDetail] = useState<FixedAsset | null>(null);
  const [disposeTarget, setDisposeTarget] = useState<FixedAsset | null>(null);

  const allAssets = useMemo(() => listOf<FixedAsset>(assets.data), [assets.data]);
  const periods = useMemo(() => listOf<FiscalPeriod>(periodsRes.data), [periodsRes.data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allAssets.filter((a) => {
      if (filter !== 'all' && a.status !== filter) return false;
      return !q || `${a.code} ${a.name} ${a.category} ${a.location}`.toLowerCase().includes(q);
    });
  }, [allAssets, query, filter]);

  const { page, setPage, totalPages, paged } = usePagedList(rows, 15);

  // Total hanya untuk aset yang masih tercatat di neraca (belum dihapus buku)
  const held = allAssets.filter((a) => a.status !== 'disposed');
  const totalCost = held.reduce((sum, a) => sum + num(a.acquisitionCost), 0);
  const totalAccum = held.reduce((sum, a) => sum + num(a.accumulatedDepreciation), 0);
  const activeCount = allAssets.filter((a) => a.status === 'active').length;

  const columns: Column<FixedAsset>[] = [
    {
      key: 'asset',
      header: 'Aset',
      render: (a) => (
        <>
          <p className="text-[15px] text-ink font-medium break-words">{a.name}</p>
          <p className="text-caption text-fossil">
            <span className="tnum">{a.code}</span>
            {a.category ? ` · ${a.category}` : ''}
          </p>
        </>
      ),
    },
    {
      key: 'location',
      header: 'Lokasi',
      render: (a) => <span className="text-[14px] text-ink break-words">{a.location || '-'}</span>,
    },
    {
      key: 'cost',
      header: 'Perolehan',
      align: 'right',
      render: (a) => (
        <>
          <span className="tnum text-[14px] text-ink">{formatIDR(num(a.acquisitionCost))}</span>
          <span className="block text-caption text-fossil">{formatDate(a.acquisitionDate)}</span>
        </>
      ),
    },
    {
      key: 'book',
      header: 'Nilai buku',
      align: 'right',
      render: (a) => <span className="tnum text-[14px] text-ink font-medium">{formatIDR(num(a.bookValue))}</span>,
    },
    {
      key: 'method',
      header: 'Metode',
      hideOnMobile: true,
      render: (a) => <span className="text-caption text-fossil">{methodLabel(a)}</span>,
    },
    { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Aset Tetap"
        subtitle="Daftar aset, nilai buku, dan penyusutan bulanan."
        actions={
          <>
            <Button
              variant="ghost"
              icon="calendar"
              className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0"
              onClick={() => setDepreciationOpen(true)}
              disabled={allAssets.length === 0}
            >
              Jalankan penyusutan
            </Button>
            <Button icon="plus" className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0" onClick={() => setAddOpen(true)}>
              Tambah aset
            </Button>
          </>
        }
      />

      <StatRow
        items={[
          { label: 'Aset aktif', value: `${activeCount} unit` },
          { label: 'Nilai perolehan', value: formatIDR(totalCost) },
          { label: 'Akumulasi penyusutan', value: formatIDR(totalAccum) },
          { label: 'Nilai buku', value: formatIDR(totalCost - totalAccum), tone: 'accent' },
        ]}
      />

      <div className="space-y-3">
        <div className="relative">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pebble pointer-events-none" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Cari kode, nama, kategori, atau lokasi"
            aria-label="Cari aset"
            className="w-full bg-paper border border-pebble/70 rounded-lg pl-9 pr-3 py-2.5 text-[16px] sm:text-[15px] placeholder:text-pebble focus:border-ink focus:outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0" role="tablist" aria-label="Filter status aset">
          {filterOptions.map((o) => (
            <button
              key={o.value}
              role="tab"
              aria-selected={filter === o.value}
              onClick={() => {
                setFilter(o.value);
                setPage(1);
              }}
              className={cn(
                'rounded-lg px-3.5 py-2 min-h-[40px] text-body-sm whitespace-nowrap transition-colors',
                filter === o.value ? 'bg-sand text-ink font-medium' : 'text-fossil hover:text-ink',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        rows={paged}
        columns={columns}
        rowKey={(a) => a.id}
        loading={assets.loading}
        error={assets.error}
        onRetry={assets.reload}
        emptyIcon="building"
        emptyTitle={allAssets.length === 0 ? 'Belum ada aset tetap' : 'Tidak ada aset yang cocok'}
        emptyBody={
          allAssets.length === 0
            ? 'Catat mesin, kendaraan, atau perangkat bernilai besar agar nilainya turun secara wajar tiap bulan.'
            : 'Ubah kata kunci atau filter status.'
        }
        emptyAction={
          allAssets.length === 0 ? (
            <Button icon="plus" onClick={() => setAddOpen(true)}>
              Tambah aset
            </Button>
          ) : undefined
        }
        onRowClick={setDetail}
        page={page}
        totalPages={totalPages}
        totalItems={rows.length}
        pageSize={15}
        onPageChange={setPage}
      />

      <AddAssetModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          assets.reload();
        }}
      />
      <DepreciationModal
        open={depreciationOpen}
        periods={periods}
        activeCount={activeCount}
        onClose={() => setDepreciationOpen(false)}
        onDone={() => {
          setDepreciationOpen(false);
          assets.reload();
        }}
      />
      <AssetDetailModal
        asset={detail}
        periods={periods}
        onClose={() => setDetail(null)}
        onDispose={(a) => {
          setDetail(null);
          setDisposeTarget(a);
        }}
      />
      <DisposeModal
        asset={disposeTarget}
        onClose={() => setDisposeTarget(null)}
        onDone={() => {
          setDisposeTarget(null);
          assets.reload();
        }}
      />
    </div>
  );
}
