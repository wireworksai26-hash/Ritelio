import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Field, Input, Select, Textarea } from '../ui/controls';
import { DataTable, StatRow, type Column } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { Tabs } from '../ui/Tabs';
import { Icon } from '../icons/Icon';
import { BarcodeScanner } from './BarcodeScanner';
import { apiFetch } from '../../lib/api';
import { formatDateTime, formatNumber } from '../../lib/format';
import { listOf, useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';

interface Warehouse {
  id: string;
  code: string;
  name: string;
}

interface OpLine {
  id: string;
  productId: string;
  systemQty: number | string;
  countedQty: number | string | null;
  variance: number | string;
  product: { id: string; sku: string; name: string; unit: string };
}

interface StockOp {
  id: string;
  code: string;
  status: 'open' | 'closed';
  note: string;
  openedAt: string;
  closedAt: string | null;
  warehouse: { id: string; code: string; name: string };
  lines?: OpLine[];
}

type LineFilter = 'all' | 'todo' | 'diff';

const lineFilterOptions: Array<{ value: LineFilter; label: string }> = [
  { value: 'all', label: 'Semua' },
  { value: 'todo', label: 'Belum dihitung' },
  { value: 'diff', label: 'Selisih' },
];

const isCounted = (l: OpLine) => l.countedQty !== null && l.countedQty !== undefined;

function VarianceText({ value }: { value: number }) {
  if (value === 0) return <span className="tnum text-fossil">0</span>;
  return (
    <span className={`tnum font-medium ${value < 0 ? 'text-rose-700' : 'text-olive'}`}>
      {value > 0 ? '+' : ''}
      {formatNumber(value)}
    </span>
  );
}

/** Daftar sesi opname + pembuatan sesi baru. Satu gudang hanya boleh punya satu sesi terbuka (aturan backend). */
export function StockOpnameTab() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const ops = useResource<StockOp[]>('/v1/inventory/stock-ops');
  const warehouses = useResource<Warehouse[]>('/v1/inventory/warehouses?isActive=true');

  const [newOpen, setNewOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const rows = listOf<StockOp>(ops.data);
  const whRows = listOf<Warehouse>(warehouses.data);

  async function createOp() {
    if (!warehouseId) {
      toast({ title: 'Pilih gudang dulu.', icon: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const created = await apiFetch<StockOp>('/v1/inventory/stock-ops', {
        method: 'POST',
        body: JSON.stringify({ warehouseId, note: note.trim() || undefined }),
      });
      toast({ title: `Sesi ${created.code} dibuka.`, icon: 'check' });
      setNewOpen(false);
      setNote('');
      ops.reload();
      setActiveId(created.id);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal membuka sesi.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  if (activeId) {
    return (
      <OpnameSession
        id={activeId}
        onBack={() => {
          setActiveId(null);
          ops.reload();
        }}
      />
    );
  }

  const columns: Column<StockOp>[] = [
    {
      key: 'code',
      header: 'Sesi',
      render: (o) => (
        <>
          <p className="text-[15px] text-ink font-medium tnum">{o.code}</p>
          <p className="text-caption text-fossil">{o.warehouse.name}</p>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (o) => <Badge variant={o.status === 'open' ? 'accent' : 'ink'}>{o.status === 'open' ? 'Berjalan' : 'Selesai'}</Badge>,
    },
    {
      key: 'progress',
      header: 'Dihitung',
      align: 'right',
      render: (o) => {
        const lines = o.lines ?? [];
        return (
          <span className="tnum text-body-sm text-ink">
            {lines.filter(isCounted).length}/{lines.length}
          </span>
        );
      },
    },
    {
      key: 'opened',
      header: 'Dibuka',
      align: 'right',
      hideOnMobile: true,
      render: (o) => <span className="text-caption text-fossil">{formatDateTime(o.openedAt)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body-sm text-fossil">
          Hitung stok fisik per gudang, bandingkan dengan sistem, lalu tutup sesi untuk menyesuaikan stok.
        </p>
        <Button icon="plus" className="shrink-0" onClick={() => setNewOpen(true)}>
          Sesi Baru
        </Button>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(o) => o.id}
        loading={ops.loading}
        error={ops.error}
        onRetry={ops.reload}
        emptyIcon="clipboard"
        emptyTitle="Belum ada sesi opname"
        emptyBody="Buka sesi untuk satu gudang, lalu pindai barcode produk untuk mencatat jumlah fisik."
        onRowClick={(o) => setActiveId(o.id)}
      />

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Sesi Opname Baru" maxWidth="md">
        <div className="space-y-4">
          <Select label="Gudang" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">Pilih gudang…</option>
            {whRows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} · {w.name}
              </option>
            ))}
          </Select>
          <Textarea
            label="Catatan (opsional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={255}
            placeholder="mis. Opname akhir bulan"
            className="min-h-[72px]"
          />
          <p className="text-caption text-fossil">
            Stok sistem dicatat saat sesi dibuka. Selisih dihitung terhadap angka itu, bukan terhadap stok yang berubah selama penghitungan.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" full onClick={() => setNewOpen(false)}>
              Batal
            </Button>
            <Button full disabled={saving || !warehouseId} onClick={createOp}>
              {saving ? 'Membuka…' : 'Buka Sesi'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function OpnameSession({ id, onBack }: { id: string; onBack: () => void }) {
  const op = useResource<StockOp>(`/v1/inventory/stock-ops/${id}`);
  const data = op.data;
  const lines = useMemo(() => data?.lines ?? [], [data]);
  const isOpen = data?.status === 'open';

  const [scanText, setScanText] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [selected, setSelected] = useState<OpLine | null>(null);
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<LineFilter>('all');
  const [query, setQuery] = useState('');

  const [closeOpen, setCloseOpen] = useState(false);
  const [closeNote, setCloseNote] = useState('');
  const [force, setForce] = useState(false);
  const [closing, setClosing] = useState(false);

  const scanRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  // Setelah memilih produk, langsung arahkan fokus ke kolom jumlah (alur cepat di HP).
  useEffect(() => {
    if (selected) {
      const t = setTimeout(() => qtyRef.current?.select(), 30);
      return () => clearTimeout(t);
    }
  }, [selected]);

  const stats = useMemo(() => {
    const counted = lines.filter(isCounted);
    const diff = counted.filter((l) => Number(l.variance) !== 0);
    return {
      total: lines.length,
      counted: counted.length,
      todo: lines.length - counted.length,
      diff: diff.length,
      net: diff.reduce((s, l) => s + Number(l.variance), 0),
    };
  }, [lines]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines.filter((l) => {
      if (filter === 'todo' && isCounted(l)) return false;
      if (filter === 'diff' && !(isCounted(l) && Number(l.variance) !== 0)) return false;
      if (q && !`${l.product.name} ${l.product.sku}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [lines, filter, query]);

  function pick(line: OpLine) {
    setSelected(line);
    setQty(isCounted(line) ? String(Number(line.countedQty)) : '');
  }

  async function resolveCode(raw: string) {
    const code = raw.trim();
    if (!code || !isOpen) return;
    setScanText('');
    // SKU dicocokkan lokal dulu (cepat); barcode lewat lookup backend karena baris sesi tidak memuat barcode.
    const lower = code.toLowerCase();
    let line = lines.find((l) => l.product.sku.toLowerCase() === lower);
    if (!line) {
      try {
        const q = encodeURIComponent(code);
        const product = await apiFetch<{ id: string }>(`/v1/inventory/products/lookup?barcode=${q}&sku=${q}`);
        line = lines.find((l) => l.productId === product.id);
        if (!line) {
          toast({ title: 'Produk ini tidak ada di sesi opname (mungkin baru ditambahkan setelah sesi dibuka).', icon: 'warning' });
          return;
        }
      } catch (err) {
        toast({ title: err instanceof Error ? err.message : 'Produk tidak ditemukan.', icon: 'warning' });
        return;
      }
    }
    pick(line);
  }

  async function saveCount() {
    if (!selected || !data) return;
    const n = Number(qty.replace(',', '.'));
    if (qty.trim() === '' || !Number.isFinite(n) || n < 0) {
      toast({ title: 'Isi jumlah fisik (0 atau lebih).', icon: 'warning' });
      return;
    }
    const counted = Math.round(n * 100) / 100;
    setBusy(true);
    try {
      await apiFetch(`/v1/inventory/stock-ops/${id}/count`, {
        method: 'POST',
        body: JSON.stringify({ lines: [{ productId: selected.productId, countedQty: counted }] }),
      });
      const variance = counted - Number(selected.systemQty);
      op.setData((prev) => {
        const base = prev ?? data;
        return {
          ...base,
          lines: (base.lines ?? []).map((l) =>
            l.productId === selected.productId ? { ...l, countedQty: counted, variance } : l,
          ),
        };
      });
      toast({
        title: `${selected.product.name}: ${formatNumber(counted)} ${selected.product.unit}`,
        icon: 'check',
      });
      setSelected(null);
      setQty('');
      setTimeout(() => scanRef.current?.focus(), 30);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal menyimpan hitungan.', icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  async function closeSession() {
    setClosing(true);
    try {
      const res = await apiFetch<{ adjustmentsApplied: number }>(`/v1/inventory/stock-ops/${id}/close`, {
        method: 'POST',
        body: JSON.stringify({ note: closeNote.trim() || undefined, force: force || undefined }),
      });
      toast({ title: `Sesi ditutup. ${res.adjustmentsApplied} produk disesuaikan.`, icon: 'check' });
      setCloseOpen(false);
      setSelected(null);
      op.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal menutup sesi.', icon: 'warning' });
    } finally {
      setClosing(false);
    }
  }

  const columns: Column<OpLine>[] = [
    {
      key: 'product',
      header: 'Produk',
      render: (l) => (
        <>
          <p className="text-[15px] text-ink font-medium break-words">{l.product.name}</p>
          <p className="text-caption text-fossil tnum">{l.product.sku}</p>
        </>
      ),
    },
    {
      key: 'system',
      header: 'Sistem',
      mobileLabel: 'Sistem',
      align: 'right',
      render: (l) => (
        <span className="tnum text-body-sm">
          {formatNumber(Number(l.systemQty))} {l.product.unit}
        </span>
      ),
    },
    {
      key: 'counted',
      header: 'Fisik',
      mobileLabel: 'Fisik',
      align: 'right',
      render: (l) =>
        isCounted(l) ? (
          <span className="tnum text-body-sm text-ink">
            {formatNumber(Number(l.countedQty))} {l.product.unit}
          </span>
        ) : (
          <span className="text-caption text-pebble">Belum</span>
        ),
    },
    {
      key: 'variance',
      header: 'Selisih',
      mobileLabel: 'Selisih',
      align: 'right',
      render: (l) => (isCounted(l) ? <VarianceText value={Number(l.variance)} /> : <span className="text-pebble">-</span>),
    },
  ];

  if (op.loading && !data) {
    return <Card className="p-6 text-body-sm text-fossil">Memuat sesi…</Card>;
  }
  if (op.error || !data) {
    return (
      <Card className="p-6 space-y-3">
        <p className="text-body-sm text-ink">{op.error ?? 'Sesi tidak ditemukan.'}</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}>
            Kembali
          </Button>
          <Button variant="ghost" icon="sync" onClick={op.reload}>
            Coba lagi
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali ke daftar sesi"
          className="p-2.5 -ml-2 rounded-lg text-ink hover:bg-sand transition-colors shrink-0"
        >
          <Icon name="arrow-left" size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-heading-sm font-light text-ink tnum">{data.code}</p>
          <p className="text-body-sm text-fossil truncate">
            {data.warehouse.name} · dibuka {formatDateTime(data.openedAt)}
          </p>
        </div>
        <Badge variant={isOpen ? 'accent' : 'ink'}>{isOpen ? 'Berjalan' : 'Selesai'}</Badge>
      </div>

      <StatRow
        items={[
          { label: 'Produk', value: stats.total },
          { label: 'Sudah dihitung', value: `${stats.counted}/${stats.total}` },
          { label: 'Ada selisih', value: stats.diff, tone: stats.diff > 0 ? 'accent' : 'default' },
          { label: 'Selisih bersih', value: stats.net > 0 ? `+${formatNumber(stats.net)}` : formatNumber(stats.net) },
        ]}
      />

      {isOpen && (
        <Card className="p-4 space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <Input
                ref={scanRef}
                label="Pindai atau ketik barcode / SKU"
                value={scanText}
                onChange={(e) => setScanText(e.target.value)}
                onKeyDown={(e) => {
                  // Alat scan USB / pembaca RFID mode keyboard mengetik kode lalu menekan Enter
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void resolveCode(scanText);
                  }
                }}
                enterKeyHint="search"
                autoComplete="off"
                autoCapitalize="off"
                placeholder="mis. 8990001 atau KOP-001"
              />
            </div>
            <Button
              variant={cameraOn ? 'primary' : 'ghost'}
              icon="camera"
              className="shrink-0 min-h-[44px]"
              aria-pressed={cameraOn}
              onClick={() => setCameraOn((v) => !v)}
            >
              <span className="hidden sm:inline">{cameraOn ? 'Matikan' : 'Kamera'}</span>
            </Button>
          </div>

          {cameraOn && (
            <div>
              {/* Kamera dijeda selagi satu produk sedang diisi jumlahnya */}
              <BarcodeScanner active={cameraOn && !selected} onDetect={(code) => void resolveCode(code)} />
              <p className="text-caption text-fossil mt-2">Arahkan kamera ke barcode. Setelah terbaca, isi jumlah fisik.</p>
            </div>
          )}

          {selected && (
            <div className="rounded-xl border border-ink/20 bg-chartreuse/20 p-3.5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[16px] text-ink font-medium break-words">{selected.product.name}</p>
                  <p className="text-caption text-fossil tnum">
                    {selected.product.sku} · sistem {formatNumber(Number(selected.systemQty))} {selected.product.unit}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Batalkan pilihan produk"
                  className="p-2 -m-1 rounded-lg text-fossil hover:text-ink hover:bg-sand/60 shrink-0"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <Input
                    ref={qtyRef}
                    label={`Jumlah fisik (${selected.product.unit})`}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void saveCount();
                      }
                    }}
                    inputMode="decimal"
                    enterKeyHint="done"
                    placeholder="0"
                  />
                </div>
                <Button className="shrink-0 min-h-[44px]" disabled={busy} onClick={saveCount}>
                  {busy ? 'Menyimpan…' : 'Simpan'}
                </Button>
              </div>
              {qty.trim() !== '' && Number.isFinite(Number(qty.replace(',', '.'))) && (
                <p className="text-caption text-fossil">
                  Selisih dari sistem: <VarianceText value={Number(qty.replace(',', '.')) - Number(selected.systemQty)} />
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      <div className="space-y-3">
        <Tabs options={lineFilterOptions} value={filter} onChange={setFilter} />
        <div className="relative">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pebble pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari produk atau SKU dalam sesi…"
            aria-label="Cari produk dalam sesi"
            className="w-full bg-paper border border-pebble/70 rounded-lg pl-9 pr-3 py-2.5 text-[16px] sm:text-[15px] placeholder:text-pebble focus:border-ink focus:outline-none transition-colors"
          />
        </div>
        <DataTable
          rows={visible}
          columns={columns}
          rowKey={(l) => l.id}
          emptyIcon="clipboard"
          emptyTitle={filter === 'todo' ? 'Semua produk sudah dihitung' : filter === 'diff' ? 'Belum ada selisih' : 'Tidak ada produk'}
          emptyBody={lines.length === 0 ? 'Gudang ini belum punya stok saat sesi dibuka.' : undefined}
          onRowClick={isOpen ? pick : undefined}
        />
      </div>

      {isOpen && (
        <div className="flex justify-end">
          <Button variant="primary" icon="check" full className="sm:w-auto" onClick={() => setCloseOpen(true)}>
            Tutup Sesi & Sesuaikan Stok
          </Button>
        </div>
      )}

      <Modal open={closeOpen} onClose={() => setCloseOpen(false)} title="Tutup Sesi Opname" maxWidth="md">
        <div className="space-y-4">
          <div className="rounded-xl border border-ash bg-bone/40 p-3.5 text-body-sm text-ink space-y-1">
            <p>
              <strong className="tnum">{stats.diff}</strong> produk akan disesuaikan ke jumlah fisik
              {stats.diff > 0 && (
                <>
                  {' '}
                  (selisih bersih <VarianceText value={stats.net} />)
                </>
              )}
              .
            </p>
            <p className="text-fossil">Stok sistem diganti dengan hasil hitung dan tiap koreksi dicatat di kartu stok. Sesi yang sudah ditutup tidak bisa dibuka lagi.</p>
          </div>

          {stats.todo > 0 && (
            <label className="flex items-start gap-3 rounded-xl border border-ash p-3.5 cursor-pointer">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="mt-1 h-4 w-4 accent-[#1c1c1c] shrink-0"
              />
              <span className="text-body-sm text-ink">
                <strong className="tnum">{stats.todo}</strong> produk belum dihitung. Tutup tetap, stok produk itu tidak diubah.
              </span>
            </label>
          )}

          <Field label="Catatan penutupan (opsional)">
            <Textarea value={closeNote} onChange={(e) => setCloseNote(e.target.value)} maxLength={255} className="min-h-[72px]" />
          </Field>

          <div className="flex gap-2">
            <Button variant="ghost" full onClick={() => setCloseOpen(false)}>
              Batal
            </Button>
            <Button full disabled={closing || (stats.todo > 0 && !force)} onClick={closeSession}>
              {closing ? 'Menutup…' : 'Tutup Sesi'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
