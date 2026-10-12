import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, formatIDR } from '../../lib/format';
import { listOf, useResource } from '../../lib/useResource';
import { Icon } from '../icons/Icon';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { Pagination } from '../ui/Pagination';

interface PurchaseOrderRow {
  id: string;
  code: string;
  status: string;
  createdAt: string;
  totalValue: number | string;
  supplier: { name: string };
  warehouse: { name: string };
  items: unknown[];
}

interface OrdersResponse {
  data: PurchaseOrderRow[];
  meta: { page: number; limit: number; total: number };
}

const STATUS: Record<string, { variant: 'outline' | 'neutral' | 'ink'; label: string }> = {
  draft: { variant: 'outline', label: 'Draf' },
  ordered: { variant: 'neutral', label: 'Dipesan' },
  received: { variant: 'ink', label: 'Diterima' },
  cancelled: { variant: 'outline', label: 'Dibatalkan' },
};

const PAGE_SIZE = 5;

/**
 * Ringkasan PO dari backend untuk tim gudang. Kirim ke pemasok, penerimaan barang,
 * dan pembuatan PO dilakukan di modul Pengadaan supaya hanya ada satu jalur
 * yang mencatat stok dan jurnal.
 */
export function PoOverviewTab({ canManage }: { canManage: boolean }) {
  const [page, setPage] = useState(1);
  const list = useResource<OrdersResponse>(`/v1/purchasing/orders?page=${page}&limit=${PAGE_SIZE}`);
  const rows = listOf<PurchaseOrderRow>(list.data);
  const total = list.data?.meta?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 bg-sand/50 border-transparent">
        <p className="text-body-sm text-ink flex-1 min-w-0">
          Daftar ini dibaca langsung dari modul Pengadaan. Pembuatan PO, pengiriman ke pemasok, dan penerimaan barang
          dikerjakan di sana.
        </p>
        {canManage && (
          <Link
            to="/app/procurement"
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg border border-ink text-ink text-body-sm hover:bg-sand"
          >
            Buka Pengadaan
            <Icon name="arrow-right" size={14} />
          </Link>
        )}
      </Card>

      {list.error ? (
        <Card className="p-6">
          <EmptyState
            icon="warning"
            title="Purchase Order belum bisa dimuat"
            body={list.error}
            action={
              <Button variant="ghost" icon="sync" className="min-h-[44px]" onClick={list.reload}>
                Coba lagi
              </Button>
            }
          />
        </Card>
      ) : list.loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-sand/60 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon="document" title="Belum ada Purchase Order" body="PO yang dibuat di Pengadaan akan tampil di sini." />
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((po) => {
            const badge = STATUS[po.status] ?? { variant: 'neutral' as const, label: po.status };
            return (
              <Card key={po.id} className="p-4 sm:p-5 flex flex-wrap items-center gap-3 sm:gap-4">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-[15px] text-ink font-medium break-words">{po.code}</p>
                  <p className="text-caption text-fossil mt-0.5 break-words">
                    {po.supplier?.name ?? '-'} - {po.warehouse?.name ?? '-'} - {formatDate(po.createdAt)}
                  </p>
                </div>
                <p className="text-caption text-fossil">
                  {po.items?.length ?? 0} item - <span className="tnum font-medium text-ink">{formatIDR(Number(po.totalValue) || 0)}</span>
                </p>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </Card>
            );
          })}
          <Pagination currentPage={page} totalPages={totalPages} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
