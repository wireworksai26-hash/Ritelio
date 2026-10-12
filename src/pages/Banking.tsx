import { useMemo, useState } from 'react';
import { BankSummaryNumbers } from '../components/banking/BankSummaryNumbers';
import { AccountModal, ReconcileModal, StatementModal } from '../components/banking/BankModals';
import { num, type BankAccount, type BankStatement, type BankSummary } from '../components/banking/bankingTypes';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { DataTable, StatRow, type Column } from '../components/ui/DataTable';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { cn, formatDate, formatIDR } from '../lib/format';
import { listOf, usePagedList, useResource } from '../lib/useResource';

type StatementFilter = 'open' | 'done' | 'all';

const filterOptions: Array<{ value: StatementFilter; label: string }> = [
  { value: 'open', label: 'Belum cocok' },
  { value: 'done', label: 'Sudah cocok' },
  { value: 'all', label: 'Semua' },
];

export default function Banking() {
  const accounts = useResource<BankAccount[]>('/v1/banking/accounts');
  const summary = useResource<BankSummary[]>('/v1/banking/summary');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatementFilter>('open');
  const [accountModal, setAccountModal] = useState(false);
  const [statementTarget, setStatementTarget] = useState<BankAccount | null>(null);
  const [reconcileTarget, setReconcileTarget] = useState<BankStatement | null>(null);

  const accountRows = useMemo(() => listOf<BankAccount>(accounts.data), [accounts.data]);
  const summaryRows = useMemo(() => listOf<BankSummary>(summary.data), [summary.data]);
  const activeAccount = accountRows.find((a) => a.id === selectedId) ?? accountRows[0] ?? null;

  const statements = useResource<BankStatement[]>(
    activeAccount ? `/v1/banking/accounts/${activeAccount.id}/statements` : null,
  );

  const statementRows = useMemo(() => {
    // Terbaru di atas; endpoint mengurutkan naik berdasarkan tanggal
    const all = [...listOf<BankStatement>(statements.data)].reverse();
    if (filter === 'open') return all.filter((s) => !s.isReconciled);
    if (filter === 'done') return all.filter((s) => s.isReconciled);
    return all;
  }, [statements.data, filter]);

  const { page, setPage, totalPages, paged } = usePagedList(statementRows, 20);

  const summaryOf = (id: string) => summaryRows.find((s) => s.bankAccountId === id);
  const totalUnreconciled = summaryRows.reduce((sum, s) => sum + num(s.unreconciledCount), 0);
  const totalNet = summaryRows.reduce((sum, s) => sum + num(s.totalStatements), 0);
  const totalReconciled = summaryRows.reduce((sum, s) => sum + num(s.reconciledAmount), 0);

  const reloadAll = () => {
    accounts.reload();
    summary.reload();
    statements.reload();
  };

  const columns: Column<BankStatement>[] = [
    {
      key: 'desc',
      header: 'Mutasi',
      render: (s) => (
        <>
          <p className="text-[15px] text-ink break-words">{s.description}</p>
          <p className="text-caption text-fossil">
            {formatDate(s.statementDate)}
            {s.reference ? ` · ${s.reference}` : ''}
          </p>
        </>
      ),
    },
    {
      key: 'amount',
      header: 'Jumlah',
      align: 'right',
      render: (s) => {
        const amount = num(s.amount);
        return (
          <span className={cn('tnum text-[15px] font-medium', amount < 0 ? 'text-rose-700' : 'text-ink')}>
            {amount < 0 ? '-' : '+'}
            {formatIDR(Math.abs(amount))}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) =>
        !s.isReconciled ? (
          <Badge variant="outline">Belum cocok</Badge>
        ) : s.matchedJournalId ? (
          <Badge variant="accent" icon="check">
            Cocok dengan jurnal
          </Badge>
        ) : (
          <Badge variant="neutral">Ditandai manual</Badge>
        ),
    },
  ];

  const header = (
    <PageHeader
      title="Kas & Bank"
      subtitle="Catat mutasi rekening dan cocokkan dengan pembukuan kas."
      actions={
        <Button icon="plus" full className="sm:w-auto min-h-[44px] sm:min-h-0" onClick={() => setAccountModal(true)}>
          Tambah rekening
        </Button>
      }
    />
  );

  if (accounts.loading && !accounts.data) {
    return (
      <div className="space-y-5 sm:space-y-6">
        {header}
        <div className="h-28 rounded-xl bg-sand/60 animate-pulse" />
        <div className="h-64 rounded-xl bg-sand/40 animate-pulse" />
      </div>
    );
  }

  if (accounts.error) {
    return (
      <div className="space-y-5 sm:space-y-6">
        {header}
        <Card className="p-6">
          <EmptyState
            icon="warning"
            title="Gagal memuat rekening"
            body={accounts.error}
            action={
              <Button variant="ghost" icon="sync" onClick={accounts.reload}>
                Coba lagi
              </Button>
            }
          />
        </Card>
        <AccountModal open={accountModal} onClose={() => setAccountModal(false)} onSaved={reloadAll} />
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {header}

      {accountRows.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon="wallet"
            title="Belum ada rekening bank"
            body="Tambahkan rekening, lalu masukkan mutasi dari rekening koran untuk dicocokkan dengan pembukuan."
            action={
              <Button icon="plus" onClick={() => setAccountModal(true)}>
                Tambah rekening
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <StatRow
            items={[
              { label: 'Rekening', value: accountRows.length },
              { label: 'Belum dicocokkan', value: `${totalUnreconciled} mutasi`, tone: totalUnreconciled > 0 ? 'accent' : 'default' },
              { label: 'Mutasi bersih', value: formatIDR(totalNet) },
              { label: 'Sudah dicocokkan', value: formatIDR(totalReconciled) },
            ]}
          />

          {/* Pemilih rekening: kartu yang bisa digeser di HP, grid di layar lebar */}
          <div
            className="-mx-3 px-3 sm:mx-0 sm:px-0 flex sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 overflow-x-auto sm:overflow-visible snap-x snap-mandatory no-scrollbar pb-1"
            role="radiogroup"
            aria-label="Pilih rekening"
          >
            {accountRows.map((a) => {
              const s = summaryOf(a.id);
              const selected = activeAccount?.id === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setSelectedId(a.id);
                    setPage(1);
                  }}
                  className={cn(
                    'snap-start shrink-0 w-[82%] sm:w-auto text-left rounded-xl border px-4 py-3.5 min-h-[88px] transition-colors',
                    selected ? 'border-ink bg-sand' : 'border-ash bg-paper hover:border-pebble',
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-[15px] text-ink truncate">{a.name}</span>
                      <span className="block text-caption text-fossil truncate">
                        {[a.bankName, a.accountNumber].filter(Boolean).join(' · ') || a.code}
                      </span>
                    </span>
                    {s && num(s.unreconciledCount) > 0 ? (
                      <Badge variant="ink">{s.unreconciledCount}</Badge>
                    ) : (
                      <Badge variant="accent" icon="check">
                        Rapi
                      </Badge>
                    )}
                  </span>
                  {s && <BankSummaryNumbers total={num(s.totalStatements)} reconciled={num(s.reconciledAmount)} currency={a.currencyCode} />}
                </button>
              );
            })}
          </div>

          {activeAccount && (
            <section className="space-y-3" aria-label={`Mutasi ${activeAccount.name}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar" role="tablist" aria-label="Filter mutasi">
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
                <Button
                  variant="ghost"
                  icon="plus"
                  className="min-h-[44px] sm:min-h-0 w-full sm:w-auto"
                  onClick={() => setStatementTarget(activeAccount)}
                >
                  Tambah / impor mutasi
                </Button>
              </div>

              <DataTable
                rows={paged}
                columns={columns}
                rowKey={(s) => s.id}
                loading={statements.loading}
                error={statements.error}
                onRetry={statements.reload}
                emptyIcon={filter === 'open' ? 'check' : 'document'}
                emptyTitle={
                  filter === 'open' && listOf<BankStatement>(statements.data).length > 0
                    ? 'Semua mutasi sudah dicocokkan'
                    : 'Belum ada mutasi'
                }
                emptyBody={
                  listOf<BankStatement>(statements.data).length === 0
                    ? 'Masukkan mutasi dari rekening koran satu per satu atau tempel banyak sekaligus.'
                    : undefined
                }
                page={page}
                totalPages={totalPages}
                totalItems={statementRows.length}
                pageSize={20}
                onPageChange={setPage}
                rowActions={(s) =>
                  s.isReconciled ? null : (
                    <Button
                      variant="subtle"
                      size="sm"
                      icon="check"
                      className="min-h-[40px] sm:min-h-0"
                      onClick={() => setReconcileTarget(s)}
                    >
                      Cocokkan
                    </Button>
                  )
                }
              />
            </section>
          )}
        </>
      )}

      <AccountModal
        open={accountModal}
        onClose={() => setAccountModal(false)}
        onSaved={(id) => {
          setAccountModal(false);
          if (id) setSelectedId(id);
          reloadAll();
        }}
      />
      <StatementModal
        account={statementTarget}
        onClose={() => setStatementTarget(null)}
        onSaved={() => {
          statements.reload();
          summary.reload();
        }}
      />
      <ReconcileModal
        statement={reconcileTarget}
        onClose={() => setReconcileTarget(null)}
        onDone={() => {
          setReconcileTarget(null);
          statements.reload();
          summary.reload();
        }}
      />
    </div>
  );
}
