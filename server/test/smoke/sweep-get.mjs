// Sapuan: semua endpoint GET tanpa parameter harus 2xx untuk owner (tidak boleh 5xx).
import { call, login, check, done } from './lib.mjs';

const token = await login(process.env.SMOKE_EMAIL ?? 'owner@newsembakery.id', process.env.SMOKE_PASSWORD ?? 'admin123');
const paths = [
  '/auth/me', '/users', '/outlets', '/notifications', '/notifications/unread-count', '/modules',
  '/inventory/products', '/inventory/categories', '/inventory/warehouses', '/inventory/stock', '/inventory/stock/low',
  '/inventory/stock-ops', '/inventory/movements', '/purchasing/orders', '/sales/transactions',
  '/finance/profit-loss', '/finance/cashflow', '/finance/entries', '/finance/accounts', '/finance/accounts/tree',
  '/finance/fiscal-periods', '/finance/reports/trial-balance', '/finance/reports/balance-sheet',
  '/finance/reports/consolidation', '/finance/reports/fx-rates',
  '/journals', '/payables/bills', '/payables/aging', '/receivables/invoices', '/receivables/aging',
  '/banking/accounts', '/banking/summary', '/assets',
  '/procurement/requisitions', '/procurement/transfers', '/procurement/reorder-suggestions',
  '/procurement/vendor-scorecard', '/parties/suppliers', '/parties/customers',
  '/approvals', '/audit/logs', '/audit/facets', '/tax/rules', '/tax/computations',
  '/companies', '/companies/currencies', '/dashboard/summary',
  '/crm/leads', '/crm/opportunities', '/crm/pipeline', '/crm/quotations', '/crm/sales-orders', '/crm/complaints',
  '/hrm/departments', '/hrm/positions', '/hrm/employees', '/hrm/leaves', '/hrm/payroll/runs', '/hrm/attendance/summary',
  '/manufacturing/boms', '/manufacturing/mrp', '/manufacturing/orders', '/manufacturing/work-centers',
  '/manufacturing/capacity-plan', '/manufacturing/schedule/proposal',
  '/operations/projects', '/operations/shipments', '/operations/vehicles', '/operations/work-orders',
  '/operations/maintenance/due', '/operations/maintenance-plans', '/operations/timesheets',
  '/resources/workload', '/resources/available', '/forecasting/demand',
  '/iot/sensors', '/recruitment/postings', '/recruitment/applicants', '/recruitment/pipeline',
  '/performance/kpis', '/performance/score', '/performance/reviews', '/performance/leaderboard', '/performance/targets',
  '/ocr/results', '/ai/insights', '/ai/usage', '/ai/forecast/cashflow',
];
for (const p of paths) {
  const r = await call(token, 'GET', p);
  check(`GET ${p} -> ${r.status}`, r.status >= 200 && r.status < 300 || r.status === 400, JSON.stringify(r.body)?.slice(0, 160));
}
done();
