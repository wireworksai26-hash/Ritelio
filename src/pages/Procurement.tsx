import { useState } from 'react';
import { Reveal } from '../components/Reveal';
import { OrdersTab } from '../components/procurement/OrdersTab';
import { PartiesTab } from '../components/procurement/PartiesTab';
import { ReorderTab } from '../components/procurement/ReorderTab';
import { RequisitionsTab } from '../components/procurement/RequisitionsTab';
import { TransfersTab } from '../components/procurement/TransfersTab';
import { VendorTab } from '../components/procurement/VendorTab';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { Tabs } from '../components/ui/Tabs';

type TabKey = 'permintaan' | 'po' | 'transfer' | 'reorder' | 'vendor' | 'mitra';

const tabOptions: Array<{ value: TabKey; label: string }> = [
  { value: 'permintaan', label: 'Permintaan' },
  { value: 'po', label: 'PO' },
  { value: 'transfer', label: 'Transfer Gudang' },
  { value: 'reorder', label: 'Reorder' },
  { value: 'vendor', label: 'Skor Vendor' },
  { value: 'mitra', label: 'Pemasok & Pelanggan' },
];

// Tombol aksi utama di header mengikuti tab aktif; tab tanpa pembuatan (reorder, vendor, mitra)
// menaruh aksinya sendiri di dalam tab.
const createLabel: Partial<Record<TabKey, string>> = {
  permintaan: 'Permintaan Baru',
  po: 'PO Baru',
  transfer: 'Transfer Baru',
};

export default function Procurement() {
  const [tab, setTab] = useState<TabKey>('permintaan');
  const [createOpen, setCreateOpen] = useState(false);

  const changeTab = (next: TabKey) => {
    setCreateOpen(false);
    setTab(next);
  };
  const closeCreate = () => setCreateOpen(false);

  const label = createLabel[tab];

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Pengadaan"
        subtitle="Permintaan, pesanan pembelian, transfer gudang, dan kinerja pemasok"
        actions={
          label ? (
            <Button variant="primary" icon="plus" full onClick={() => setCreateOpen(true)}>
              {label}
            </Button>
          ) : undefined
        }
      />

      <Tabs options={tabOptions} value={tab} onChange={changeTab} />

      <Reveal key={tab}>
        {tab === 'permintaan' && <RequisitionsTab createOpen={createOpen} onCreateClose={closeCreate} />}
        {tab === 'po' && <OrdersTab createOpen={createOpen} onCreateClose={closeCreate} />}
        {tab === 'transfer' && <TransfersTab createOpen={createOpen} onCreateClose={closeCreate} />}
        {tab === 'reorder' && <ReorderTab />}
        {tab === 'vendor' && <VendorTab />}
        {tab === 'mitra' && <PartiesTab />}
      </Reveal>
    </div>
  );
}
