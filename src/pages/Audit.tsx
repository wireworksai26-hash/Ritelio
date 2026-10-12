import { useSearchParams } from 'react-router-dom';
import { AuditLogTab } from '../components/audit/AuditLogTab';
import { TaxTab } from '../components/audit/TaxTab';
import { PageHeader } from '../components/ui/PageHeader';
import { Tabs } from '../components/ui/Tabs';

type TabKey = 'jejak' | 'pajak';

const tabOptions: Array<{ value: TabKey; label: string }> = [
  { value: 'jejak', label: 'Jejak Aktivitas' },
  { value: 'pajak', label: 'Pajak' },
];

export default function Audit() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: TabKey = tabOptions.some((t) => t.value === requested) ? (requested as TabKey) : 'jejak';

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Audit & Pajak"
        subtitle="Siapa melakukan apa dan kapan, serta aturan pajak yang dipakai perhitungan."
      />

      <Tabs options={tabOptions} value={tab} onChange={(next) => setParams({ tab: next }, { replace: true })} />

      {tab === 'jejak' && <AuditLogTab />}
      {tab === 'pajak' && <TaxTab />}
    </div>
  );
}
