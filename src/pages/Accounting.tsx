import { useSearchParams } from 'react-router-dom';
import { AccountsTab } from '../components/accounting/AccountsTab';
import { JournalTab } from '../components/accounting/JournalTab';
import { PeriodsTab } from '../components/accounting/PeriodsTab';
import { ReportsTab } from '../components/accounting/ReportsTab';
import { PageHeader } from '../components/ui/PageHeader';
import { Tabs } from '../components/ui/Tabs';

type TabKey = 'jurnal' | 'akun' | 'periode' | 'laporan';

const tabOptions: Array<{ value: TabKey; label: string }> = [
  { value: 'jurnal', label: 'Jurnal' },
  { value: 'akun', label: 'Bagan Akun' },
  { value: 'periode', label: 'Periode & Saldo Awal' },
  { value: 'laporan', label: 'Laporan' },
];

export default function Accounting() {
  // Tab tersimpan di URL agar tombol back dan tautan langsung ke satu tab tetap bekerja.
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: TabKey = tabOptions.some((t) => t.value === requested) ? (requested as TabKey) : 'jurnal';

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Akuntansi"
        subtitle="Buku besar, bagan akun, periode fiskal, dan laporan keuangan dari satu sumber jurnal."
      />

      <Tabs options={tabOptions} value={tab} onChange={(next) => setParams({ tab: next }, { replace: true })} />

      {tab === 'jurnal' && <JournalTab />}
      {tab === 'akun' && <AccountsTab />}
      {tab === 'periode' && <PeriodsTab />}
      {tab === 'laporan' && <ReportsTab />}
    </div>
  );
}
