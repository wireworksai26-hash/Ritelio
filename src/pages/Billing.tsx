import { useState } from 'react';
import { ApBillActions } from '../components/billing/ApBillActions';
import { DocumentLedger } from '../components/billing/DocumentLedger';
import { PageHeader } from '../components/ui/PageHeader';
import { Tabs } from '../components/ui/Tabs';

type TabKey = 'receivable' | 'payable';

const tabOptions: Array<{ value: TabKey; label: string }> = [
  { value: 'receivable', label: 'Piutang (tagihan pelanggan)' },
  { value: 'payable', label: 'Utang (tagihan pemasok)' },
];

export default function Billing() {
  const [tab, setTab] = useState<TabKey>('receivable');
  // Naik setiap tagihan baru tersimpan; DocumentLedger memuat ulang tanpa kehilangan filter
  const [reloadSignal, setReloadSignal] = useState(0);

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Piutang & Utang"
        subtitle="Pantau tagihan ke pelanggan dan kewajiban ke pemasok, lengkap dengan umur jatuh tempo."
        actions={tab === 'payable' ? <ApBillActions onCreated={() => setReloadSignal((n) => n + 1)} /> : undefined}
      />
      <Tabs options={tabOptions} value={tab} onChange={setTab} />
      {/* key memaksa state filter/modal tiap tab mulai bersih */}
      <DocumentLedger key={tab} kind={tab} reloadSignal={reloadSignal} />
    </div>
  );
}
