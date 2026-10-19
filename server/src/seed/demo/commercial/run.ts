import type { DemoContext } from '../context';
import { Backdater } from './backdate';
import { CRM_PLANS } from './crm-data';
import { fixedUses } from './crm-plan';
import { CrmRunner, Stats, type TimelineEvent } from './crm';
import { maxAgoOf, planPosSales, todayCutHour } from './plan';
import { posEvents } from './pos';
import { POS_PROFILES } from './profiles';
import { distributeStock, StockBudget } from './stock';

/**
 * Domain commercial untuk satu usaha, urutannya:
 *  1. distribusi stok ke outlet kedua (transfer antar gudang)
 *  2. prospek, peluang, penawaran, pesanan (belum ada jurnal)
 *  3. linimasa kronologis: penjualan POS, penjualan kredit, fulfil pesanan, penerimaan pelanggan
 *     (satu urutan waktu supaya nomor jurnal per bulan ikut menaik menurut tanggal)
 *  4. interaksi dan keluhan (keluhan menautkan transaksi POS yang sudah ada)
 */
export async function runCommercial(ctx: DemoContext): Promise<void> {
  const key = ctx.biz.key;
  const profile = POS_PROFILES[key];
  const crmPlan = CRM_PLANS[key];
  if (!profile || !crmPlan) {
    ctx.log(`penjualan: tidak ada profil untuk ${key}, dilewati`);
    return;
  }

  const todayNoon = ctx.daysAgo(0);
  const maxAgo = maxAgoOf(todayNoon);
  const windowDays = Math.min(profile.days, maxAgo);
  const stats = new Stats();
  const bd = await Backdater.create(ctx);

  const catalogSkus = profile.catalog.map((e) => e.sku);
  const crmSkus = new Set<string>();
  const collect = (lines: Array<{ sku: string }>) => lines.forEach((l) => crmSkus.add(l.sku));
  crmPlan.quotations.forEach((q) => collect(q.lines));
  crmPlan.orders.forEach((o) => collect(o.lines ?? []));
  crmPlan.creditSales.forEach((c) => collect(c.lines));

  // Stok awal dan distribusinya harus lebih tua daripada penjualan tertua (POS maupun pesanan lama).
  const oldestCrm = Math.max(0, ...crmPlan.orders.map((o) => o.fulfilAgo ?? 0), ...crmPlan.creditSales.map((c) => c.ageDays));
  const openingAgo = Math.min(Math.max(windowDays, oldestCrm) + 3, maxAgo);
  const opened = await bd.openingStock(ctx.at(openingAgo, 7));
  if (opened > 0) ctx.log(`stok awal: ${opened} jurnal dipindah ke ${ctx.isoDay(ctx.daysAgo(openingAgo))}`);
  const moved = await distributeStock(ctx, catalogSkus, ctx.at(Math.max(openingAgo - 1, 0), 8));
  if (moved > 0) ctx.log(`stok: ${moved} baris didistribusikan ke outlet lain`);
  const budget = await StockBudget.load(ctx, [...catalogSkus, ...crmSkus]);

  const runner = new CrmRunner(ctx, crmPlan, bd, budget, stats, maxAgo);
  await runner.leads();
  await runner.deals();
  ctx.log(`CRM: ${stats.describe()}`);

  // Hari ini ikut diisi sampai jam yang sudah lewat, supaya tile "Penjualan Hari Ini" tidak kosong.
  const nowWib = new Date(Date.now() + 7 * 3_600_000);
  const todayMaxHour = todayCutHour(nowWib.getUTCHours() * 60 + nowWib.getUTCMinutes());
  const posPlan = planPosSales(profile, {
    windowDays,
    todayMaxHour,
    todayDow: todayNoon.getUTCDay(),
    isoOf: (d) => ctx.isoDay(ctx.daysAgo(d)),
    capacity: budget.posCapacity(catalogSkus),
    timeline: {
      events: await budget.timeline(catalogSkus),
      fixed: fixedUses(crmPlan, (sku) => ctx.product(sku).productType !== 'service', (ago, hour, minute) => ctx.at(Math.min(ago, maxAgo), hour, minute).getTime()),
      timeOf: (d, hour, minute) => ctx.at(d, hour, minute).getTime(),
    },
  });
  const events: TimelineEvent[] = [...(await posEvents(ctx, posPlan, budget, bd, stats)), ...runner.events()];
  events.sort((a, b) => a.when.getTime() - b.when.getTime());

  let done = 0;
  for (const ev of events) {
    try {
      await ev.run();
    } catch (err) {
      stats.fail(`${ev.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (++done % 150 === 0) ctx.log(`linimasa ${done}/${events.length}`);
  }

  await runner.interactions();
  await runner.complaints();

  ctx.log(`selesai: ${stats.describe()}`);
  if (stats.failures.length > 0) {
    for (const f of stats.failures.slice(0, 10)) ctx.log(`GAGAL ${f}`);
    throw new Error(`${stats.failures.length} langkah penjualan gagal (lihat log). Jalankan ulang setelah diperbaiki: yang sudah ada dilewati.`);
  }
}
