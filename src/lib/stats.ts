// Selector statistik di atas data bisnis reaktif & persisten
import { useBusinessStore } from '../stores/businessStore';
import { useOutletStore } from '../stores/outletStore';
import type { Product, SalesTransaction } from '../types';
import { todayISO } from './format';

export function getActiveTenantId(): string {
  return useBusinessStore.getState().tenant?.id || 'tenant-1';
}

export function productById(id: string): Product | undefined {
  const tenantId = getActiveTenantId();
  return useBusinessStore.getState().products.find((p) => p.id === id && (!p.tenant_id || p.tenant_id === tenantId));
}

export function productName(id: string): string {
  return productById(id)?.name ?? 'Produk';
}

export function categoryName(id: string): string {
  const tenantId = getActiveTenantId();
  return useBusinessStore.getState().categories.find((c) => c.id === id && (!c.tenant_id || c.tenant_id === tenantId))?.name ?? '-';
}

export function warehouseName(id: string): string {
  const tenantId = getActiveTenantId();
  return useBusinessStore.getState().warehouses.find((w) => w.id === id && (!w.tenant_id || w.tenant_id === tenantId))?.name ?? '-';
}

export function outletName(id: string): string {
  const tenantId = getActiveTenantId();
  return useBusinessStore.getState().outlets.find((o) => o.id === id && (!o.tenant_id || o.tenant_id === tenantId))?.name ?? '-';
}

export function txInLastDays(days: number): SalesTransaction[] {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const tenantId = getActiveTenantId();
  const selected = useOutletStore.getState().selected;

  return useBusinessStore.getState().transactions.filter((t) => {
    if (t.tenant_id && t.tenant_id !== tenantId) return false;
    if (selected !== 'all' && t.outlet_id && t.outlet_id !== selected) return false;
    return new Date(t.client_timestamp).getTime() >= since;
  });
}

export function salesToday(): { total: number; count: number; deltaStr: string } {
  const today = todayISO();
  const tenantId = getActiveTenantId();
  const selected = useOutletStore.getState().selected;

  const allTx = useBusinessStore.getState().transactions.filter((t) => {
    if (t.tenant_id && t.tenant_id !== tenantId) return false;
    if (selected !== 'all' && t.outlet_id && t.outlet_id !== selected) return false;
    return true;
  });

  const listToday = allTx.filter((t) => t.client_timestamp.slice(0, 10) === today);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = yesterday.toISOString().slice(0, 10);
  const listYesterday = allTx.filter((t) => t.client_timestamp.slice(0, 10) === yKey);

  const totalToday = listToday.reduce((s, t) => s + t.total, 0);
  const totalYesterday = listYesterday.reduce((s, t) => s + t.total, 0);

  let deltaStr = '+0% vs kemarin';
  if (totalYesterday > 0) {
    const pct = Math.round(((totalToday - totalYesterday) / totalYesterday) * 100);
    deltaStr = `${pct >= 0 ? '+' : ''}${pct}% vs kemarin`;
  } else if (totalToday > 0) {
    deltaStr = '+100% vs kemarin';
  }

  return { total: totalToday, count: listToday.length, deltaStr };
}

export interface DaySales {
  label: string;
  value: number;
  count: number;
}

export function salesByDay(days = 14): DaySales[] {
  const result: DaySales[] = [];
  const tenantId = getActiveTenantId();
  const selected = useOutletStore.getState().selected;

  const txs = useBusinessStore.getState().transactions.filter((t) => {
    if (t.tenant_id && t.tenant_id !== tenantId) return false;
    if (selected !== 'all' && t.outlet_id && t.outlet_id !== selected) return false;
    return true;
  });

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const list = txs.filter((t) => t.client_timestamp.slice(0, 10) === key);
    result.push({
      label: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(d),
      value: list.reduce((s, t) => s + t.total, 0),
      count: list.length,
    });
  }
  return result;
}

export interface TopProduct {
  product: Product;
  qty: number;
  revenue: number;
}

export function topProducts(days = 7, n = 5): TopProduct[] {
  const map = new Map<string, { qty: number; revenue: number }>();
  for (const t of txInLastDays(days)) {
    for (const item of t.items) {
      const cur = map.get(item.product_id) ?? { qty: 0, revenue: 0 };
      cur.qty += item.qty;
      cur.revenue += item.qty * item.price;
      map.set(item.product_id, cur);
    }
  }
  return [...map.entries()]
    .map(([id, v]) => ({ product: productById(id)!, qty: v.qty, revenue: v.revenue }))
    .filter((x) => Boolean(x.product))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, n);
}

export interface LowStockItem {
  product: Product;
  warehouse: string;
  quantity: number;
  min_threshold: number;
}

export function lowStockItems(): LowStockItem[] {
  const tenantId = getActiveTenantId();
  const state = useBusinessStore.getState();
  const tenantWarehouses = new Set(state.warehouses.filter((w) => !w.tenant_id || w.tenant_id === tenantId).map((w) => w.id));

  return state.stocks
    .filter((s) => tenantWarehouses.has(s.warehouse_id) && s.quantity <= s.min_threshold)
    .map((s) => ({
      product: productById(s.product_id)!,
      warehouse: warehouseName(s.warehouse_id),
      quantity: s.quantity,
      min_threshold: s.min_threshold,
    }))
    .filter((x) => Boolean(x.product))
    .sort((a, b) => a.quantity - b.quantity);
}

export function stockTotal(productId: string): number {
  return useBusinessStore
    .getState()
    .stocks.filter((s) => s.product_id === productId)
    .reduce((sum, s) => sum + s.quantity, 0);
}

export interface ProfitLoss {
  revenue: number;
  cogs: number;
  gross: number;
  opex: number;
  net: number;
}

export function profitLoss(days = 30): ProfitLoss {
  const txs = txInLastDays(days);
  const revenue = txs.reduce((s, t) => s + t.total, 0);
  const cogs = txs.reduce(
    (s, t) =>
      s + t.items.reduce((si, item) => si + item.qty * (productById(item.product_id)?.cost_price ?? 0), 0),
    0,
  );
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const tenantId = getActiveTenantId();

  const opex = useBusinessStore
    .getState()
    .financialEntries.filter((e) => (!e.tenant_id || e.tenant_id === tenantId) && e.debit_account.startsWith('Beban') && new Date(e.entry_date).getTime() >= since)
    .reduce((s, e) => s + e.amount, 0);
  const gross = revenue - cogs;
  return { revenue, cogs, gross, opex, net: gross - opex };
}

export interface CashflowPoint {
  label: string;
  inflow: number;
  outflow: number;
  forecast: boolean;
}

export function cashflowSeries(actualDays = 14, forecastDays = 30): CashflowPoint[] {
  const points: CashflowPoint[] = [];
  const perDayIn: number[] = [];
  const perDayOut: number[] = [];
  const tenantId = getActiveTenantId();
  const state = useBusinessStore.getState();

  const tenantTx = state.transactions.filter((t) => !t.tenant_id || t.tenant_id === tenantId);
  const tenantEntries = state.financialEntries.filter((e) => !e.tenant_id || e.tenant_id === tenantId);

  for (let i = actualDays - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const inflow = tenantTx
      .filter((t) => t.client_timestamp.slice(0, 10) === key)
      .reduce((s, t) => s + t.total, 0);
    const outflow = tenantEntries
      .filter((e) => e.debit_account.startsWith('Beban') && e.entry_date.slice(0, 10) === key)
      .reduce((s, e) => s + e.amount, 0);
    perDayIn.push(inflow);
    perDayOut.push(outflow);
    points.push({
      label: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(d),
      inflow,
      outflow,
      forecast: false,
    });
  }

  // Forecast linear sederhana
  const avgIn = perDayIn.slice(-7).reduce((a, b) => a + b, 0) / 7 || 0;
  const avgOut = perDayOut.slice(-7).reduce((a, b) => a + b, 0) / 7 || 0;
  for (let i = 1; i <= forecastDays; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const factor = 1 + i * 0.005;
    points.push({
      label: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(d),
      inflow: Math.round(avgIn * factor),
      outflow: Math.round(avgOut),
      forecast: true,
    });
  }
  return points;
}

export interface OutletPerf {
  id: string;
  name: string;
  total: number;
  count: number;
  growthPct: number;
}

export function outletPerformance(days = 14): OutletPerf[] {
  const half = Math.floor(days / 2);
  const tenantId = getActiveTenantId();
  const outlets = useBusinessStore.getState().outlets.filter((o) => !o.tenant_id || o.tenant_id === tenantId);

  return outlets.map((o) => {
    const all = txInLastDays(days).filter((t) => t.outlet_id === o.id);
    const recent = txInLastDays(half).filter((t) => t.outlet_id === o.id);
    const recentTotal = recent.reduce((s, t) => s + t.total, 0);
    const prevTotal = all.reduce((s, t) => s + t.total, 0) - recentTotal;
    const growthPct = prevTotal > 0 ? Math.round(((recentTotal - prevTotal) / prevTotal) * 100) : 0;
    return { id: o.id, name: o.name, total: all.reduce((s, t) => s + t.total, 0), count: all.length, growthPct };
  });
}

export function paymentBreakdown(days = 30): Array<{ label: string; value: number }> {
  const labels: Record<string, string> = { cash: 'Tunai', qris: 'QRIS', debit: 'Kartu Debit', transfer: 'Transfer' };
  const map = new Map<string, number>();
  for (const t of txInLastDays(days)) {
    map.set(t.payment_method, (map.get(t.payment_method) ?? 0) + t.total);
  }
  return [...map.entries()].map(([k, v]) => ({ label: labels[k] ?? k, value: v }));
}

export function categoryShare(days = 30): Array<{ label: string; value: number }> {
  const map = new Map<string, number>();
  for (const t of txInLastDays(days)) {
    for (const item of t.items) {
      const p = productById(item.product_id);
      if (!p) continue;
      const label = categoryName(p.category_id);
      map.set(label, (map.get(label) ?? 0) + item.qty * item.price);
    }
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function pendingSyncCount(): number {
  const tenantId = getActiveTenantId();
  return useBusinessStore.getState().transactions.filter((t) => (!t.tenant_id || t.tenant_id === tenantId) && t.sync_status === 'pending').length;
}

export function conflictCount(): number {
  const tenantId = getActiveTenantId();
  return useBusinessStore.getState().transactions.filter((t) => (!t.tenant_id || t.tenant_id === tenantId) && (t.sync_status === 'needs_review' || t.sync_status === 'conflict')).length;
}
