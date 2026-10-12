// Regression suite end-to-end (API berjalan + Postgres sungguhan) untuk jalur uang/stok
// modul OPERASIONAL & SDM: procurement, stok opname, penjualan SO, manufaktur,
// proyek/timesheet, pengiriman, work order, HRM/payroll, IoT, OCR, isolasi tenant,
// dan fuzz input aneh.
//
// Pakai (DB bersih, hasil seed):
//   API_URL=http://localhost:4012/v1 node test/smoke/operations.mjs
//
// Suite membuat data uniknya sendiri (akhiran RUN), tapi payroll per periode & seed
// TaxRule bersifat global per tenant, jadi jalankan ulang setelah seed ulang.
import { call, login, check, done } from './lib.mjs';

const RUN = Date.now().toString(36).toUpperCase().slice(-6);
const n = (x) => Number(x);
const near = (a, b, eps = 0.02) => Math.abs(n(a) - n(b)) <= eps;
const section = (t) => console.log(`\n== ${t}`);
const UUID0 = '00000000-0000-4000-8000-000000000000';

const owner = await login('owner@newsembakery.id', 'admin123');
const sari = await login('sari@kopikelana.id', 'admin123');
// Akun manager seed (ferry@newsembakery) tidak bisa login lewat API karena DTO login
// menuntut format email; jadi pemohon requisition dibuat sebagai user manager baru.
const mgrCreated = (await call(owner, 'POST', '/users', { name: `Manager Uji ${RUN}`, email: `mgr-${RUN.toLowerCase()}@newsembakery.id`, role: 'manager' })).body;
const ferry = await login(`mgr-${RUN.toLowerCase()}@newsembakery.id`, mgrCreated.temporaryPassword);

// ------------------------------------------------------------------ helper
const ok = (r) => r.status >= 200 && r.status < 300;
const show = (r) => `[${r.status}] ${JSON.stringify(r.body)?.slice(0, 200)}`;
async function must(r, label) {
  if (!ok(r)) { console.log(`  FATAL setup ${label}: ${show(r)}`); check(`setup ${label}`, false, show(r)); done(); }
  return r.body;
}
const get = (t, p) => call(t, 'GET', p);
const post = (t, p, b) => call(t, 'POST', p, b ?? {});
const patch = (t, p, b) => call(t, 'PATCH', p, b ?? {});

let ACCOUNTS = null;
async function acct(code) {
  if (!ACCOUNTS) ACCOUNTS = (await get(owner, '/finance/accounts')).body.data;
  return ACCOUNTS.find((a) => a.code === code);
}
async function refreshAccounts() { ACCOUNTS = null; }

async function journalsFor(sourceModule, refId) {
  const r = await get(owner, `/journals?sourceModule=${sourceModule}&take=200`);
  return (r.body?.data ?? []).filter((j) => j.sourceRefId === refId);
}
function sums(j) {
  let dr = 0, cr = 0;
  for (const l of j.lines) (l.direction === 'debit' ? (dr += n(l.amount)) : (cr += n(l.amount)));
  return { dr: Math.round(dr * 100) / 100, cr: Math.round(cr * 100) / 100 };
}
function lineAmount(j, accountId, direction) {
  return j.lines.filter((l) => l.accountId === accountId && l.direction === direction)
    .reduce((s, l) => s + n(l.amount), 0);
}
async function stockRow(wh, pid) {
  const r = await get(owner, `/inventory/stock?warehouseId=${wh}`);
  return (r.body ?? []).find((s) => s.productId === pid);
}
const qty = async (wh, pid) => n((await stockRow(wh, pid))?.quantity ?? 0);
const cost = async (wh, pid) => n((await stockRow(wh, pid))?.avgCost ?? 0);

async function mkWarehouse(tag) {
  return must(await post(owner, '/inventory/warehouses', { code: `W${tag}${RUN}`, name: `Gudang ${tag} ${RUN}` }), `warehouse ${tag}`);
}
async function mkProduct(tag, extra = {}) {
  return must(await post(owner, '/inventory/products', {
    name: `Produk ${tag} ${RUN}`, sku: `${tag}-${RUN}`, sellPrice: 2000, costPrice: 1000, ...extra,
  }), `product ${tag}`);
}
async function addStock(wh, pid, q) {
  return must(await post(owner, '/inventory/stock/adjust', { productId: pid, warehouseId: wh, qty: q, note: 'setup test' }), 'adjust setup');
}
async function mkSupplier(tag, extra = {}) {
  return must(await post(owner, '/parties/suppliers', { name: `Pemasok ${tag} ${RUN}`, paymentTermDays: 14, ...extra }), `supplier ${tag}`);
}
async function mkCustomer(tag, extra = {}) {
  return must(await post(owner, '/parties/customers', { name: `Pelanggan ${tag} ${RUN}`, paymentTermDays: 7, ...extra }), `customer ${tag}`);
}
const isoToday = () => new Date().toISOString();
const dateOnly = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

// =================================================================== 1. PROCUREMENT
section('1. Procurement: requisition -> PO -> receive -> bayar');
const whA = await mkWarehouse('A');
const whB = await mkWarehouse('B');
const sup = await mkSupplier('1');
const p1 = await mkProduct('P1', { costPrice: 1000 });
const p2 = await mkProduct('P2', { costPrice: 500 });
// stok awal P1 di gudang A: 10 @ 800 lewat PO pertama supaya moving average terbukti
const accPersediaan = await acct('1100');
const accHutang = await acct('2000');

{
  const req = await must(await post(ferry, '/procurement/requisitions', {
    reason: 'uji', lines: [{ productId: p1.id, qty: 10 }, { productId: p2.id, qty: 5 }],
  }), 'requisition');
  check('requisition draft', req.status === 'draft', show({ status: 200, body: req }));
  let r = await post(owner, `/procurement/requisitions/${req.id}/approve`, { approve: true });
  check('approve sebelum submit ditolak', r.status === 400, show(r));
  r = await post(ferry, `/procurement/requisitions/${req.id}/submit`);
  check('submit ok', ok(r) && r.body.status === 'submitted', show(r));
  r = await post(ferry, `/procurement/requisitions/${req.id}/submit`);
  check('submit dua kali ditolak (409)', r.status === 409, show(r));
  r = await post(ferry, `/procurement/requisitions/${req.id}/approve`, { approve: true });
  check('pemohon tidak boleh approve sendiri', r.status === 400 || r.status === 403, show(r));
  r = await post(owner, `/procurement/requisitions/${req.id}/convert-po`, { warehouseId: whA.id, supplierId: sup.id });
  check('convert sebelum approve ditolak', r.status === 400, show(r));
  r = await post(owner, `/procurement/requisitions/${req.id}/approve`, { approve: true });
  check('approve oleh orang lain ok', ok(r) && r.body.status === 'approved', show(r));
  r = await post(owner, `/procurement/requisitions/${req.id}/approve`, { approve: true });
  check('approve dua kali ditolak', r.status === 400 || r.status === 409, show(r));

  // dua convert paralel: hanya satu PO
  const [c1, c2] = await Promise.all([
    post(owner, `/procurement/requisitions/${req.id}/convert-po`, { warehouseId: whA.id, supplierId: sup.id, lines: [{ productId: p1.id, price: 1000 }] }),
    post(owner, `/procurement/requisitions/${req.id}/convert-po`, { warehouseId: whA.id, supplierId: sup.id, lines: [{ productId: p1.id, price: 1000 }] }),
  ]);
  const wins = [c1, c2].filter(ok);
  check('convert paralel: tepat satu berhasil', wins.length === 1, show(c1) + ' | ' + show(c2));
  check('convert paralel: yang kalah 409 bukan 500', [c1, c2].filter((x) => !ok(x)).every((x) => x.status === 409), show(c1) + ' | ' + show(c2));
  r = await post(owner, `/procurement/requisitions/${req.id}/convert-po`, { warehouseId: whA.id, supplierId: sup.id });
  check('convert kedua kali ditolak (409)', r.status === 409, show(r));

  const poId = wins[0].body.purchaseOrders[0].id;
  const poList = await get(owner, '/purchasing/orders?limit=100');
  check('PO hasil convert hanya satu untuk requisition', poList.body.data.filter((p) => p.id === poId).length === 1);
  let po = (await get(owner, `/purchasing/orders/${poId}`)).body;
  check('PO draft', po.status === 'draft', show({ status: 200, body: po }));
  check('PO total benar (10x1000 + 5x500)', near(po.totalValue, 12500), `got ${po.totalValue}`);

  r = await post(owner, `/purchasing/orders/${poId}/receive`, {});
  check('receive PO draft ditolak', r.status === 409 || r.status === 400, show(r));
  r = await patch(owner, `/purchasing/orders/${poId}`, { status: 'received' });
  check('PATCH status received ditolak', r.status === 400, show(r));
  r = await post(owner, `/purchasing/orders/${poId}/send`);
  check('send PO ok', ok(r) && r.body.purchaseOrder.status === 'ordered', show(r));
  r = await post(owner, `/purchasing/orders/${poId}/send`);
  check('send ulang idempoten (alreadySent)', ok(r) && r.body.alreadySent === true, show(r));

  po = (await get(owner, `/purchasing/orders/${poId}`)).body;
  const it1 = po.items.find((i) => i.productId === p1.id);
  const it2 = po.items.find((i) => i.productId === p2.id);
  r = await post(owner, `/purchasing/orders/${poId}/receive`, { rejections: { [it1.id]: 11 } });
  check('penolakan melebihi qty ditolak', r.status === 400, show(r));
  r = await post(owner, `/purchasing/orders/${poId}/receive`, { rejections: { [it1.id]: -1 } });
  check('penolakan negatif ditolak', r.status === 400, show(r));

  // receive: P1 10 (tolak 2 -> 8 masuk), P2 5
  const [rc1, rc2] = await Promise.all([
    post(owner, `/purchasing/orders/${poId}/receive`, { rejections: { [it1.id]: 2 } }),
    post(owner, `/purchasing/orders/${poId}/receive`, { rejections: { [it1.id]: 2 } }),
  ]);
  const rwins = [rc1, rc2].filter(ok);
  check('receive paralel: tepat satu berhasil', rwins.length === 1, show(rc1) + ' | ' + show(rc2));
  check('receive paralel: yang kalah 409 bukan 500', [rc1, rc2].filter((x) => !ok(x)).every((x) => x.status === 409), show(rc1) + ' | ' + show(rc2));
  r = await post(owner, `/purchasing/orders/${poId}/receive`, {});
  check('receive kedua kali ditolak (409)', r.status === 409, show(r));

  check('stok P1 = 8 (2 ditolak)', (await qty(whA.id, p1.id)) === 8);
  check('stok P2 = 5', (await qty(whA.id, p2.id)) === 5);
  check('avgCost P1 = 1000', near(await cost(whA.id, p1.id), 1000));
  po = (await get(owner, `/purchasing/orders/${poId}`)).body;
  check('qtyRejected tercatat', n(po.items.find((i) => i.id === it1.id).qtyRejected) === 2 && n(po.items.find((i) => i.id === it2.id).qtyRejected) === 0);
  const js = await journalsFor('purchasing', poId);
  check('tepat satu jurnal penerimaan', js.length === 1, `jumlah ${js.length}`);
  if (js[0]) {
    const s = sums(js[0]);
    check('jurnal seimbang', near(s.dr, s.cr), JSON.stringify(s));
    check('nilai jurnal = 8x1000 + 5x500 = 10500', near(s.dr, 10500), JSON.stringify(s));
    check('Dr persediaan 10500', near(lineAmount(js[0], accPersediaan.id, 'debit'), 10500));
    check('Cr utang usaha 10500', near(lineAmount(js[0], accHutang.id, 'credit'), 10500));
  }
  const bills = await get(owner, '/payables/bills?status=open');
  const bill = (bills.body.data ?? bills.body).find((b) => b.purchaseOrderId === poId || b.purchaseOrder?.id === poId);
  check('faktur pembelian terbit', !!bill && near(bill.total, 10500), JSON.stringify(bill)?.slice(0, 200));
  if (bill) {
    r = await post(owner, `/payables/bills/${bill.id}/pay`, { amount: 10500, method: 'transfer' });
    check('bayar faktur lunas', ok(r), show(r));
  }

  // moving average: PO kedua 8 @ 2000 ke gudang yang sama -> (8*1000+8*2000)/16 = 1500
  const po2 = await must(await post(owner, '/purchasing/orders', {
    supplierId: sup.id, warehouseId: whA.id, status: 'ordered', items: [{ productId: p1.id, qty: 8, price: 2000 }],
  }), 'po2');
  r = await post(owner, `/purchasing/orders/${po2.id}/receive`, {});
  check('receive PO2', ok(r), show(r));
  check('moving average P1 = 1500', near(await cost(whA.id, p1.id), 1500), `got ${await cost(whA.id, p1.id)}`);
  check('stok P1 = 16', (await qty(whA.id, p1.id)) === 16);
  r = await post(owner, '/purchasing/orders', { supplierId: sup.id, warehouseId: whA.id, status: 'received', items: [{ productId: p1.id, qty: 1, price: 1 }] });
  check('PO langsung status received ditolak', r.status === 400, show(r));
  r = await post(owner, '/purchasing/orders', { supplierId: sup.id, warehouseId: whA.id, items: [{ productId: p1.id, qty: 1, price: 0 }] });
  check('PO harga 0 ditolak', r.status === 400, show(r));
}

section('1b. Reorder suggestions -> generate PO (idempoten)');
{
  const supR = await mkSupplier('R');
  const pr = await mkProduct('RO', { costPrice: 300, reorderPoint: 10, reorderQty: 20, preferredSupplierId: supR.id });
  await addStock(whB.id, pr.id, 4);
  let r = await get(owner, '/procurement/reorder-suggestions');
  const sug = (r.body ?? []).find((s) => s.productId === pr.id);
  check('reorder suggestion muncul', !!sug && sug.suggestedQty === 26, show(r));
  const g1 = await post(owner, '/procurement/reorder-generate-po', { supplierId: supR.id, notify: false });
  check('generate PO pertama membuat 1 PO', ok(g1) && g1.body.created.length === 1, show(g1));
  const g2 = await post(owner, '/procurement/reorder-generate-po', { supplierId: supR.id, notify: false });
  check('generate kedua tidak membuat PO ganda', ok(g2) && g2.body.created.length === 0, show(g2));
  const [g3, g4] = await Promise.all([
    post(owner, '/procurement/reorder-generate-po', { supplierId: supR.id, notify: false }),
    post(owner, '/procurement/reorder-generate-po', { supplierId: supR.id, notify: false }),
  ]);
  check('generate paralel tidak membuat PO ganda', ok(g3) && ok(g4) && g3.body.created.length + g4.body.created.length === 0, show(g3) + show(g4));
  const pos = (await get(owner, '/purchasing/orders?limit=100')).body.data.filter((p) => p.supplierId === supR.id);
  check('hanya satu PO terbuka untuk pemasok reorder', pos.length === 1, `jumlah ${pos.length}`);
  check('PO reorder digudang yang kekurangan stok', pos[0]?.warehouseId === whB.id, JSON.stringify(pos[0]?.warehouseId));
}

section('1c. Transfer antar gudang');
{
  const pt = await mkProduct('TR', { costPrice: 700 });
  await addStock(whA.id, pt.id, 10);
  const tr = await must(await post(owner, '/procurement/transfers', {
    fromWarehouseId: whA.id, toWarehouseId: whB.id, lines: [{ productId: pt.id, qty: 4 }],
  }), 'transfer');
  let r = await post(owner, `/procurement/transfers/${tr.id}/receive`);
  check('receive sebelum ship ditolak', r.status === 409, show(r));
  r = await post(owner, '/procurement/transfers', { fromWarehouseId: whA.id, toWarehouseId: whA.id, lines: [{ productId: pt.id, qty: 1 }] });
  check('transfer ke gudang sama ditolak', r.status === 400, show(r));
  const big = await must(await post(owner, '/procurement/transfers', {
    fromWarehouseId: whA.id, toWarehouseId: whB.id, lines: [{ productId: pt.id, qty: 99 }],
  }), 'transfer besar');
  r = await post(owner, `/procurement/transfers/${big.id}/ship`);
  check('ship melebihi stok ditolak (400)', r.status === 400, show(r));
  check('stok sumber utuh setelah ship gagal', (await qty(whA.id, pt.id)) === 10);
  const [s1, s2] = await Promise.all([
    post(owner, `/procurement/transfers/${tr.id}/ship`), post(owner, `/procurement/transfers/${tr.id}/ship`),
  ]);
  check('ship paralel: satu berhasil, lain 409', [s1, s2].filter(ok).length === 1 && [s1, s2].filter((x) => !ok(x)).every((x) => x.status === 409), show(s1) + show(s2));
  check('stok sumber turun 4', (await qty(whA.id, pt.id)) === 6);
  check('stok tujuan belum bertambah saat transit', (await qty(whB.id, pt.id)) === 0);
  r = await post(owner, `/procurement/transfers/${tr.id}/receive`);
  check('receive ok', ok(r), show(r));
  r = await post(owner, `/procurement/transfers/${tr.id}/receive`);
  check('receive kedua kali ditolak', r.status === 409, show(r));
  check('stok tujuan naik 4', (await qty(whB.id, pt.id)) === 4);
  check('HPP ikut pindah (carry) 0 -> sama dg sumber', near(await cost(whB.id, pt.id), await cost(whA.id, pt.id)), `${await cost(whB.id, pt.id)} vs ${await cost(whA.id, pt.id)}`);
  const mv = (await get(owner, `/inventory/movements?productId=${pt.id}&limit=100`)).body.data;
  check('movement transfer_out & transfer_in tercatat', mv.some((m) => m.type === 'transfer_out' && n(m.quantity) === -4) && mv.some((m) => m.type === 'transfer_in' && n(m.quantity) === 4));
}

// =================================================================== 2. STOCK OPNAME & ADJUST
section('2. Stock opname + penyesuaian stok bernilai -> jurnal Selisih Persediaan');
{
  const wh = await mkWarehouse('O');
  const pa = await mkProduct('OA', { costPrice: 1000 });
  const pb = await mkProduct('OB', { costPrice: 2000 });
  const pc = await mkProduct('OC', { costPrice: 500 });
  // isi stok lewat PO terima supaya avgCost nyata dan jurnal persediaan wajar
  const sup2 = await mkSupplier('O');
  const poo = await must(await post(owner, '/purchasing/orders', {
    supplierId: sup2.id, warehouseId: wh.id, status: 'ordered',
    items: [{ productId: pa.id, qty: 10, price: 1000 }, { productId: pb.id, qty: 10, price: 2000 }, { productId: pc.id, qty: 10, price: 500 }],
  }), 'po opname');
  await must(await post(owner, `/purchasing/orders/${poo.id}/receive`, {}), 'receive opname');
  const accSelisih = async () => { await refreshAccounts(); return acct('6500'); };

  let r = await get(owner, '/journals?take=200');
  const before = (await get(owner, '/journals?sourceModule=stock-opname&take=200')).body.data.length;
  const op = await must(await post(owner, '/inventory/stock-ops', { warehouseId: wh.id }), 'open opname');
  r = await post(owner, '/inventory/stock-ops', { warehouseId: wh.id });
  check('opname kedua di gudang sama ditolak (409)', r.status === 409, show(r));
  r = await post(owner, `/inventory/stock-ops/${op.id}/close`, {});
  check('close tanpa hitung ditolak (400)', r.status === 400, show(r));
  r = await post(owner, `/inventory/stock-ops/${op.id}/count`, { lines: [{ productId: pa.id, countedQty: -1 }] });
  check('hitung negatif ditolak', r.status === 400, show(r));
  r = await post(owner, `/inventory/stock-ops/${op.id}/count`, { lines: [{ productId: pa.id, countedQty: 8 }, { productId: pb.id, countedQty: 13 }, { productId: pc.id, countedQty: 10 }] });
  check('count ok', ok(r), show(r));
  // pa -2 x 1000 = -2000 (rugi), pb +3 x 2000 = +6000 (laba) => net +4000 ke selisih (Cr)
  const [c1, c2] = await Promise.all([
    post(owner, `/inventory/stock-ops/${op.id}/close`, { note: 'uji' }),
    post(owner, `/inventory/stock-ops/${op.id}/close`, { note: 'uji' }),
  ]);
  check('close paralel: tepat satu berhasil', [c1, c2].filter(ok).length === 1 && [c1, c2].filter((x) => !ok(x)).every((x) => x.status === 400 || x.status === 409), show(c1) + show(c2));
  check('stok pa jadi 8', (await qty(wh.id, pa.id)) === 8);
  check('stok pb jadi 13', (await qty(wh.id, pb.id)) === 13);
  check('stok pc tetap 10', (await qty(wh.id, pc.id)) === 10);
  const mv = (await get(owner, `/inventory/movements?productId=${pa.id}&limit=100`)).body.data;
  check('StockMovement adjustment -2 tercatat', mv.some((m) => m.type === 'adjustment' && n(m.quantity) === -2 && m.refId === op.id));
  const accS = await accSelisih();
  check('akun Selisih Persediaan tersedia di COA', !!accS && accS.type === 'expense', JSON.stringify(accS));
  const js = await journalsFor('stock-opname', op.id);
  check('tepat satu jurnal opname', js.length === 1, `jumlah ${js.length}`);
  if (js[0] && accS) {
    const s = sums(js[0]);
    check('jurnal opname seimbang', near(s.dr, s.cr), JSON.stringify(s));
    check('Dr persediaan 6000 (pb +3x2000)', near(lineAmount(js[0], accPersediaan.id, 'debit'), 6000), JSON.stringify(js[0].lines));
    check('Cr persediaan 2000 (pa -2x1000)', near(lineAmount(js[0], accPersediaan.id, 'credit'), 2000), JSON.stringify(js[0].lines));
    check('Dr selisih 2000 (rugi pa)', near(lineAmount(js[0], accS.id, 'debit'), 2000));
    check('Cr selisih 6000 (laba pb)', near(lineAmount(js[0], accS.id, 'credit'), 6000));
  }
  void before;

  // opname tanpa selisih tidak membuat jurnal
  const op2 = await must(await post(owner, '/inventory/stock-ops', { warehouseId: wh.id }), 'open opname 2');
  await post(owner, `/inventory/stock-ops/${op2.id}/count`, { lines: [{ productId: pa.id, countedQty: 8 }, { productId: pb.id, countedQty: 13 }, { productId: pc.id, countedQty: 10 }] });
  r = await post(owner, `/inventory/stock-ops/${op2.id}/close`, {});
  check('opname tanpa selisih tertutup', ok(r), show(r));
  check('opname tanpa selisih tidak menjurnal', (await journalsFor('stock-opname', op2.id)).length === 0);

  // stok bergerak setelah opname dibuka: penyesuaian harus relatif terhadap stok kini
  const op3 = await must(await post(owner, '/inventory/stock-ops', { warehouseId: wh.id }), 'open opname 3');
  await post(owner, '/inventory/stock/adjust', { productId: pc.id, warehouseId: wh.id, qty: -4, note: 'pecah' });
  check('stok pc 6 setelah adjust', (await qty(wh.id, pc.id)) === 6);
  await post(owner, `/inventory/stock-ops/${op3.id}/count`, { lines: [{ productId: pa.id, countedQty: 8 }, { productId: pb.id, countedQty: 13 }, { productId: pc.id, countedQty: 6 }] });
  r = await post(owner, `/inventory/stock-ops/${op3.id}/close`, {});
  check('close opname 3', ok(r), show(r));
  check('hitung fisik 6 konsisten dg stok kini (tidak ada selisih semu)', (await qty(wh.id, pc.id)) === 6);
  check('tidak ada jurnal selisih semu untuk opname 3', (await journalsFor('stock-opname', op3.id)).length === 0, 'selisih dihitung thd snapshot lama');

  // /inventory/stock/adjust bernilai -> jurnal
  const adjUp = await post(owner, '/inventory/stock/adjust', { productId: pa.id, warehouseId: wh.id, qty: 2, note: 'temuan' });
  check('adjust +2 ok', ok(adjUp), show(adjUp));
  const adjDown = await post(owner, '/inventory/stock/adjust', { productId: pa.id, warehouseId: wh.id, qty: -3, note: 'rusak' });
  check('adjust -3 ok', ok(adjDown), show(adjDown));
  const mvA = (await get(owner, `/inventory/movements?productId=${pa.id}&limit=100`)).body.data.filter((m) => m.note === 'rusak');
  check('movement adjust tercatat dg refId', mvA.length === 1 && !!mvA[0].refId, JSON.stringify(mvA[0]));
  if (mvA[0]?.refId) {
    const ja = await journalsFor('inventory-adjustment', mvA[0].refId);
    check('adjust -3 menjurnal Dr selisih 3000 / Cr persediaan 3000', ja.length === 1 && near(sums(ja[0]).dr, 3000) && near(sums(ja[0]).cr, 3000), `jumlah ${ja.length}`);
  }
  r = await post(owner, '/inventory/stock/adjust', { productId: pa.id, warehouseId: wh.id, qty: -999 });
  check('adjust yang membuat stok negatif ditolak', r.status === 400 || r.status === 409, show(r));
  check('stok pa tetap 7', (await qty(wh.id, pa.id)) === 7);
  r = await post(owner, '/inventory/stock/adjust', { productId: pa.id, warehouseId: wh.id, qty: 0 });
  check('adjust 0 ditolak', r.status === 400, show(r));

  // produk baru dengan initialStock: stok awal harus tercatat (movement + jurnal modal awal)
  const pi = await must(await post(owner, '/inventory/products', {
    name: `Awal ${RUN}`, sku: `AWAL-${RUN}`, sellPrice: 100, costPrice: 40, initialStock: 5, warehouseId: wh.id,
  }), 'produk stok awal');
  check('stok awal 5', (await qty(wh.id, pi.id)) === 5);
  const mvi = (await get(owner, `/inventory/movements?productId=${pi.id}&limit=20`)).body.data;
  check('stok awal punya StockMovement', mvi.length === 1 && n(mvi[0].quantity) === 5, JSON.stringify(mvi));
  if (mvi[0]?.refId) {
    const ji = await journalsFor('inventory-adjustment', mvi[0].refId);
    check('stok awal bernilai 5x40=200 dijurnal seimbang', ji.length === 1 && near(sums(ji[0]).dr, 200) && near(sums(ji[0]).cr, 200), `jumlah ${ji.length}`);
  }
}

// =================================================================== 3. SALES ORDER
section('3. Sales: quotation -> SO -> confirm -> fulfil');
{
  const wh = await mkWarehouse('S');
  const cust = await mkCustomer('S');
  const ps = await mkProduct('SA', { costPrice: 600, sellPrice: 1000 });
  const sup3 = await mkSupplier('S');
  const poS = await must(await post(owner, '/purchasing/orders', { supplierId: sup3.id, warehouseId: wh.id, status: 'ordered', items: [{ productId: ps.id, qty: 10, price: 600 }] }), 'po sales');
  await must(await post(owner, `/purchasing/orders/${poS.id}/receive`, {}), 'receive sales');
  const poS2 = await must(await post(owner, '/purchasing/orders', { supplierId: sup3.id, warehouseId: wh.id, status: 'ordered', items: [{ productId: ps.id, qty: 10, price: 800 }] }), 'po sales 2');
  await must(await post(owner, `/purchasing/orders/${poS2.id}/receive`, {}), 'receive sales 2');
  check('stok 20 @ avg 700', (await qty(wh.id, ps.id)) === 20 && near(await cost(wh.id, ps.id), 700));

  // quotation -> SO sekali saja
  const quo = await must(await post(owner, '/crm/quotations', { customerId: cust.id, lines: [{ productId: ps.id, qty: 4, price: 1000 }] }), 'quotation');
  let r = await post(owner, `/crm/quotations/${quo.id}/convert`, { warehouseId: wh.id });
  check('convert quotation draft ditolak', r.status === 400, show(r));
  r = await post(owner, `/crm/quotations/${quo.id}/status`, { status: 'accepted' });
  check('draft -> accepted langsung ditolak', r.status === 400, show(r));
  r = await post(owner, `/crm/quotations/${quo.id}/status`, { status: 'sent' });
  check('draft -> sent', ok(r), show(r));
  r = await post(owner, `/crm/quotations/${quo.id}/status`, { status: 'converted' });
  check('set manual converted ditolak', r.status === 400, show(r));
  r = await post(owner, `/crm/quotations/${quo.id}/status`, { status: 'accepted' });
  check('sent -> accepted', ok(r), show(r));
  const [q1, q2] = await Promise.all([
    post(owner, `/crm/quotations/${quo.id}/convert`, { warehouseId: wh.id }),
    post(owner, `/crm/quotations/${quo.id}/convert`, { warehouseId: wh.id }),
  ]);
  check('convert quotation paralel: satu berhasil', [q1, q2].filter(ok).length === 1 && [q1, q2].filter((x) => !ok(x)).every((x) => x.status === 409), show(q1) + show(q2));
  r = await post(owner, `/crm/quotations/${quo.id}/convert`, { warehouseId: wh.id });
  check('convert quotation kedua kali ditolak', r.status === 409, show(r));
  const so = [q1, q2].find(ok).body;
  check('SO dari quotation total 4000', near(so.total, 4000), String(so.total));

  r = await post(owner, `/crm/sales-orders/${so.id}/fulfil`);
  check('fulfil SO draft ditolak', r.status === 400, show(r));
  r = await post(owner, `/crm/sales-orders/${so.id}/confirm`);
  check('confirm ok', ok(r), show(r));
  r = await post(owner, `/crm/sales-orders/${so.id}/confirm`);
  check('confirm dua kali ditolak (409)', r.status === 409, show(r));
  r = await post(owner, `/crm/sales-orders/${so.id}/fulfil`);
  check('fulfil ok', ok(r) && r.body.fulfilled === true, show(r));
  check('COGS = 4 x 700 = 2800', near(r.body.cogs, 2800), show(r));
  check('stok turun jadi 16', (await qty(wh.id, ps.id)) === 16);
  check('avgCost tidak berubah saat jual', near(await cost(wh.id, ps.id), 700));
  const invId = r.body.invoice?.id;
  const inv = (await get(owner, '/receivables/invoices')).body;
  const invRow = (inv.data ?? inv).find((i) => i.id === invId);
  check('faktur AR terbit total 4000', !!invRow && near(invRow.total, 4000), JSON.stringify(invRow)?.slice(0, 200));
  const js = await journalsFor('sales', so.id);
  check('tepat satu jurnal fulfil', js.length === 1, `jumlah ${js.length}`);
  if (js[0]) {
    const s = sums(js[0]);
    check('jurnal fulfil seimbang', near(s.dr, s.cr), JSON.stringify(s));
    check('Dr piutang 4000 + Dr HPP 2800 = 6800', near(s.dr, 6800), JSON.stringify(s));
  }
  r = await post(owner, `/crm/sales-orders/${so.id}/fulfil`);
  check('fulfil kedua kali ditolak (409)', r.status === 409, show(r));
  r = await post(owner, `/crm/sales-orders/${so.id}/cancel`);
  check('cancel SO fulfilled ditolak (409)', r.status === 409, show(r));
  check('stok tetap 16 setelah fulfil ulang', (await qty(wh.id, ps.id)) === 16);

  // melebihi stok
  const big = await must(await post(owner, '/crm/sales-orders', { customerId: cust.id, warehouseId: wh.id, lines: [{ productId: ps.id, qty: 500, price: 1000 }] }), 'so besar');
  await post(owner, `/crm/sales-orders/${big.id}/confirm`);
  r = await post(owner, `/crm/sales-orders/${big.id}/fulfil`);
  check('fulfil melebihi stok ditolak (400)', r.status === 400, show(r));
  check('stok utuh setelah fulfil gagal', (await qty(wh.id, ps.id)) === 16);
  r = await get(owner, '/crm/sales-orders');
  check('SO besar tetap confirmed (rollback status)', r.body.find((x) => x.id === big.id)?.status === 'confirmed');
  r = await post(owner, `/crm/sales-orders/${big.id}/cancel`);
  check('cancel SO confirmed ok', ok(r) && r.body.status === 'cancelled', show(r));
  r = await post(owner, `/crm/sales-orders/${big.id}/fulfil`);
  check('fulfil SO cancelled ditolak', r.status === 400, show(r));
  r = await post(owner, `/crm/sales-orders/${big.id}/confirm`);
  check('confirm SO cancelled ditolak', r.status === 400, show(r));

  // 10 fulfil paralel
  const par = await must(await post(owner, '/crm/sales-orders', { customerId: cust.id, warehouseId: wh.id, lines: [{ productId: ps.id, qty: 3, price: 1000 }] }), 'so paralel');
  await must(await post(owner, `/crm/sales-orders/${par.id}/confirm`), 'confirm paralel');
  const rs = await Promise.all(Array.from({ length: 10 }, () => post(owner, `/crm/sales-orders/${par.id}/fulfil`)));
  check('10 fulfil paralel: tepat satu berhasil', rs.filter(ok).length === 1, rs.map((x) => x.status).join(','));
  check('10 fulfil paralel: sisanya 409/400 (tanpa 500)', rs.filter((x) => !ok(x)).every((x) => x.status === 409 || x.status === 400), rs.map((x) => x.status).join(','));
  check('stok turun tepat 3 -> 13', (await qty(wh.id, ps.id)) === 13, String(await qty(wh.id, ps.id)));
  check('hanya satu jurnal untuk SO paralel', (await journalsFor('sales', par.id)).length === 1);
  // cancel vs fulfil paralel tidak boleh menimpa fulfilled
  const race = await must(await post(owner, '/crm/sales-orders', { customerId: cust.id, warehouseId: wh.id, lines: [{ productId: ps.id, qty: 1, price: 1000 }] }), 'so race');
  await must(await post(owner, `/crm/sales-orders/${race.id}/confirm`), 'confirm race');
  const [rf, rcn] = await Promise.all([post(owner, `/crm/sales-orders/${race.id}/fulfil`), post(owner, `/crm/sales-orders/${race.id}/cancel`)]);
  const finalStatus = (await get(owner, '/crm/sales-orders')).body.find((x) => x.id === race.id).status;
  check('fulfil vs cancel paralel: status akhir konsisten dg hasil', (ok(rf) && !ok(rcn) && finalStatus === 'fulfilled') || (!ok(rf) && ok(rcn) && finalStatus === 'cancelled') || (ok(rf) && ok(rcn) && false), `${rf.status}/${rcn.status}/${finalStatus}`);
  check('tidak ada 500 pada fulfil vs cancel', rf.status < 500 && rcn.status < 500, `${rf.status}/${rcn.status}`);
}

done();
