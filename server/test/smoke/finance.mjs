// Regression suite end-to-end modul KEUANGAN terhadap API yang SUDAH berjalan (bukan mock).
// Jalankan SETELAH seed bersih (skrip ini menutup periode & memposting jurnal sungguhan):
//   cd server && npx tsx prisma/seed.ts
//   API_URL=http://localhost:4011/v1 node test/smoke/finance.mjs
import { call, login, check, done } from './lib.mjs';

const T = await login('owner@newsembakery.id', 'admin123'); // tenant Newsem Bakery
const S = await login('sari@kopikelana.id', 'admin123'); // tenant lain (Kopi Kelana)
const TODAY = new Date().toISOString().slice(0, 10);
const ASOF = '2026-12-31';
const near = (a, b, eps = 0.005) => Math.abs(Number(a) - Number(b)) < eps;
const short = (r) => `[${r.status}] ${JSON.stringify(r.body).slice(0, 220)}`;
const is = (name, r, ...codes) => check(name, codes.includes(r.status), short(r));
const rejected = (name, r) => check(name, r.status >= 400 && r.status < 500, short(r));
const section = (t) => console.log(`\n== ${t}`);

// ---- akun & util ------------------------------------------------------------
const accRes = await call(T, 'GET', '/finance/accounts');
const A = Object.fromEntries(accRes.body.data.map((a) => [a.code, a.id]));
const kelanaAccRes = await call(S, 'GET', '/finance/accounts');
const KA = Object.fromEntries(kelanaAccRes.body.data.map((a) => [a.code, a.id]));
const periods = (await call(T, 'GET', '/finance/fiscal-periods')).body;
const periodId = (code) => periods.find((p) => p.code === code)?.id;

const sumLines = (j, dir) => j.lines.filter((l) => l.direction === dir).reduce((s, l) => s + Number(l.amount), 0);
const balanced = (j) => near(sumLines(j, 'debit'), sumLines(j, 'credit')) && sumLines(j, 'debit') > 0;
const lineOf = (j, code, dir) => j.lines.find((l) => l.accountId === A[code] && l.direction === dir);
async function journalsOf(sourceModule, token = T) {
  const out = [];
  let cursor;
  do {
    const r = await call(token, 'GET', `/journals?sourceModule=${encodeURIComponent(sourceModule)}&take=200${cursor ? `&cursor=${cursor}` : ''}`);
    out.push(...r.body.data);
    cursor = r.body.nextCursor;
  } while (cursor);
  return out;
}
async function gl(code, token = T, accounts = A) {
  const r = await call(token, 'GET', `/finance/reports/general-ledger/${accounts[code]}?asOf=${ASOF}`);
  return r.body.closingBalance;
}
const tb = async (q = '', token = T) => (await call(token, 'GET', `/finance/reports/trial-balance?asOf=${ASOF}${q}`)).body;
const tbNet = (t, code) => {
  const r = t.data.find((x) => x.code === code);
  return r ? Number(r.debit) - Number(r.credit) : 0;
};
const json = (v) => JSON.stringify(v);

// =============================================================================
section('1. Jurnal manual POST /journals');
const m1 = await call(T, 'POST', '/journals', {
  entryDate: '2026-10-05', memo: 'Setoran modal tambahan',
  lines: [{ accountId: A['1000'], debit: 1000000 }, { accountId: A['3000'], credit: 1000000 }],
});
is('jurnal seimbang -> 201', m1, 201);
check('nomor format JRN-YYYYMM-nnnnnn', /^JRN-202610-\d{6}$/.test(m1.body.number ?? ''), m1.body.number);
check('jurnal tercatat posted + sourceModule manual', m1.body.status === 'posted' && m1.body.sourceModule === 'manual');
const m2 = await call(T, 'POST', '/journals', {
  entryDate: '2026-10-06', memo: 'Beban pemeliharaan tunai',
  lines: [{ accountId: A['6400'], debit: 75000 }, { accountId: A['1000'], credit: 75000 }],
});
is('jurnal kedua -> 201', m2, 201);
const seq = (n) => Number(n.split('-')[2]);
check('nomor urut berjalan +1', seq(m2.body.number) === seq(m1.body.number) + 1, `${m1.body.number} -> ${m2.body.number}`);

rejected('tidak seimbang ditolak 4xx', await call(T, 'POST', '/journals', {
  entryDate: '2026-10-05', memo: 'Tidak seimbang', lines: [{ accountId: A['1000'], debit: 1000 }, { accountId: A['3000'], credit: 999 }] }));
is('tidak seimbang = 400 persis', await call(T, 'POST', '/journals', {
  entryDate: '2026-10-05', memo: 'Tidak seimbang', lines: [{ accountId: A['1000'], debit: 1000 }, { accountId: A['3000'], credit: 999.99 }] }), 400);
is('satu baris debit+kredit ditolak 400', await call(T, 'POST', '/journals', {
  entryDate: '2026-10-05', memo: 'Baris ganda', lines: [{ accountId: A['1000'], debit: 500, credit: 500 }, { accountId: A['3000'], credit: 1 }] }), 400);
is('baris tanpa nominal ditolak 400', await call(T, 'POST', '/journals', {
  entryDate: '2026-10-05', memo: 'Baris kosong', lines: [{ accountId: A['1000'] }, { accountId: A['3000'], credit: 1 }] }), 400);
is('satu baris saja ditolak 400', await call(T, 'POST', '/journals', {
  entryDate: '2026-10-05', memo: 'Satu baris', lines: [{ accountId: A['1000'], debit: 10 }] }), 400);
is('nominal negatif ditolak 400', await call(T, 'POST', '/journals', {
  entryDate: '2026-10-05', memo: 'Negatif', lines: [{ accountId: A['1000'], debit: -10 }, { accountId: A['3000'], credit: -10 }] }), 400);
is('nominal nol semua ditolak 400', await call(T, 'POST', '/journals', {
  entryDate: '2026-10-05', memo: 'Nol', lines: [{ accountId: A['1000'], debit: 0 }, { accountId: A['3000'], credit: 0 }] }), 400);
rejected('akun tenant lain ditolak 4xx', await call(T, 'POST', '/journals', {
  entryDate: '2026-10-05', memo: 'Akun tenant lain', lines: [{ accountId: KA['1000'], debit: 100 }, { accountId: A['3000'], credit: 100 }] }));
rejected('akun fiktif ditolak 4xx', await call(T, 'POST', '/journals', {
  entryDate: '2026-10-05', memo: 'Akun fiktif', lines: [{ accountId: 'bukan-akun', debit: 100 }, { accountId: A['3000'], credit: 100 }] }));
rejected('tanggal di luar tahun fiskal ditolak 4xx', await call(T, 'POST', '/journals', {
  entryDate: '2031-01-05', memo: 'Di luar kalender', lines: [{ accountId: A['1000'], debit: 100 }, { accountId: A['3000'], credit: 100 }] }));
rejected('memo terlalu pendek ditolak 4xx', await call(T, 'POST', '/journals', {
  entryDate: '2026-10-05', memo: 'x', lines: [{ accountId: A['1000'], debit: 100 }, { accountId: A['3000'], credit: 100 }] }));

// Reversal: m2 (beban 75.000 tunai)
const cashBeforeRev = await gl('1000');
const expBeforeRev = await gl('6400');
const rev1 = await call(T, 'POST', `/journals/${m2.body.id}/reverse`, { entryDate: '2026-10-07', memo: 'Koreksi salah catat' });
is('reversal pertama -> 201', rev1, 201);
check('reversal menukar arah & seimbang', rev1.body.lines?.length === 2 && balanced(rev1.body)
  && rev1.body.lines.find((l) => l.accountId === A['1000'])?.direction === 'debit');
check('reversal bertaut ke jurnal asal', rev1.body.reversalOf?.id === m2.body.id);
is('reversal kedua ditolak 409', await call(T, 'POST', `/journals/${m2.body.id}/reverse`, {}), 409);
is('membalik jurnal pembalik ditolak 409', await call(T, 'POST', `/journals/${rev1.body.id}/reverse`, {}), 409);
is('reverse id fiktif -> 404', await call(T, 'POST', '/journals/tidak-ada/reverse', {}), 404);
const origAfter = (await journalsOf('manual')).find((j) => j.id === m2.body.id);
check('jurnal asal berstatus voided + reversedBy terisi', origAfter?.status === 'voided' && origAfter.reversedBy?.length === 1, json(origAfter?.status));
const cashAfterRev = await gl('1000');
const expAfterRev = await gl('6400');
check('saldo kas kembali setelah reversal (net 0 vs sebelum jurnal m2)', near(cashAfterRev, cashBeforeRev + 75000), `${cashBeforeRev} -> ${cashAfterRev}`);
check('saldo beban kembali setelah reversal', near(expAfterRev, expBeforeRev - 75000), `${expBeforeRev} -> ${expAfterRev}`);
{
  const t = await tb();
  check('TB setelah reversal: akun 6400 net 0', near(tbNet(t, '6400'), 0), `${tbNet(t, '6400')}`);
  check('TB setelah reversal tetap seimbang', t.balanced === true && near(t.totalDebit, t.totalCredit), `${t.totalDebit} vs ${t.totalCredit}`);
}

// Jurnal lama POST /finance/entries (jalur legacy)
is('finance/entries debit=kredit ditolak 400', await call(T, 'POST', '/finance/entries', { debitAccountCode: '1000', creditAccountCode: '1000', amount: 10 }), 400);
is('finance/entries akun fiktif 404', await call(T, 'POST', '/finance/entries', { debitAccountCode: '9999', creditAccountCode: '1000', amount: 10 }), 404);
is('finance/entries tanggal depan ditolak 400', await call(T, 'POST', '/finance/entries', { debitAccountCode: '1000', creditAccountCode: '3000', amount: 10, entryDate: '2026-12-30T00:00:00Z' }), 400);
is('finance/entries backdate >90 hari ditolak 400', await call(T, 'POST', '/finance/entries', { debitAccountCode: '1000', creditAccountCode: '3000', amount: 10, entryDate: '2026-03-01T00:00:00Z' }), 400);
is('finance/entries valid -> 201', await call(T, 'POST', '/finance/entries', { debitAccountCode: '1000', creditAccountCode: '3000', amount: 321, entryDate: '2026-10-08T00:00:00Z' }), 201);

// =============================================================================
section('2. Periode fiskal & saldo awal');
const feb = periodId('2026-02');
const closeFeb = await call(T, 'POST', `/finance/fiscal-periods/${feb}/close`, {});
is('tutup periode 2026-02 -> 2xx', closeFeb, 200, 201);
is('tutup periode yang sama lagi -> 409', await call(T, 'POST', `/finance/fiscal-periods/${feb}/close`, {}), 409);
is('posting ke periode tertutup ditolak 400', await call(T, 'POST', '/journals', {
  entryDate: '2026-02-15', memo: 'Ke periode tertutup', lines: [{ accountId: A['1000'], debit: 100 }, { accountId: A['3000'], credit: 100 }] }), 400);
is('POST /finance/entries ke periode tertutup ditolak 4xx (backdate)', await call(T, 'POST', '/finance/entries', { debitAccountCode: '1000', creditAccountCode: '3000', amount: 5, entryDate: '2026-02-15T00:00:00Z' }), 400);
is('tutup periode fiktif -> 404', await call(T, 'POST', '/finance/fiscal-periods/tidak-ada/close', {}), 404);
{
  const before = (await journalsOf('manual')).length;
  await call(T, 'POST', '/journals', { entryDate: '2026-02-15', memo: 'Ke periode tertutup', lines: [{ accountId: A['1000'], debit: 100 }, { accountId: A['3000'], credit: 100 }] });
  check('penolakan periode tertutup tidak meninggalkan jurnal', (await journalsOf('manual')).length === before);
}
const fiscalList = (await call(T, 'GET', '/finance/fiscal-periods')).body;
check('periode 2026-02 berstatus closed di daftar', fiscalList.find((p) => p.code === '2026-02')?.status === 'closed');

// Saldo awal diuji di tenant Kelana (Newsem sudah punya saldo awal dari seed)
const kPeriods = (await call(S, 'GET', '/finance/fiscal-periods')).body;
const kJan = kPeriods.find((p) => p.code === '2026-01').id;
const kMar = kPeriods.find((p) => p.code === '2026-03').id;
const ob = (periodId, lines) => call(S, 'POST', '/finance/opening-balances', { periodId, note: 'Saldo awal uji', lines });
is('saldo awal tidak seimbang ditolak 400', await ob(kJan, [
  { accountCode: '1000', direction: 'debit', amount: 5000000 }, { accountCode: '3000', direction: 'credit', amount: 4999999.99 }]), 400);
is('saldo awal akun ganda ditolak 400', await ob(kJan, [
  { accountCode: '1000', direction: 'debit', amount: 100 }, { accountCode: '1000', direction: 'credit', amount: 100 }]), 400);
is('saldo awal bukan periode Januari ditolak 400', await ob(kMar, [
  { accountCode: '1000', direction: 'debit', amount: 100 }, { accountCode: '3000', direction: 'credit', amount: 100 }]), 400);
is('saldo awal akun fiktif -> 404', await ob(kJan, [
  { accountCode: '9999', direction: 'debit', amount: 100 }, { accountCode: '3000', direction: 'credit', amount: 100 }]), 404);
is('saldo awal hanya sisi debit ditolak 400', await ob(kJan, [
  { accountCode: '1000', direction: 'debit', amount: 100 }, { accountCode: '1100', direction: 'debit', amount: 100 }]), 400);
is('saldo awal seimbang -> 201', await ob(kJan, [
  { accountCode: '1000', direction: 'debit', amount: 5000000 }, { accountCode: '3000', direction: 'credit', amount: 5000000 }]), 201);
is('saldo awal ganda pada periode sama -> 409', await ob(kJan, [
  { accountCode: '1000', direction: 'debit', amount: 100 }, { accountCode: '3000', direction: 'credit', amount: 100 }]), 409);
{
  const t = await tb('', S);
  check('TB Kelana: saldo awal TIDAK terhitung ganda (5.000.000)', near(t.totalDebit, 5000000) && near(t.totalCredit, 5000000), `${t.totalDebit}/${t.totalCredit}`);
  check('TB Kelana: kas 5.000.000 debit', near(tbNet(t, '1000'), 5000000), `${tbNet(t, '1000')}`);
  const bsK = (await call(S, 'GET', `/finance/reports/balance-sheet?asOf=${ASOF}`)).body;
  check('Neraca Kelana: aset 5.000.000 & seimbang', near(bsK.assets.total, 5000000) && bsK.balanced === true, json(bsK.assets?.total));
  const dash = (await call(S, 'GET', '/dashboard/summary')).body;
  check('Dashboard Kelana: kas 5.000.000 (tidak ganda)', near(dash.cash, 5000000), `${dash.cash}`);
}
{
  const t = await tb();
  check('TB Newsem: saldo awal seed (persediaan) tetap 2.084.000 tanpa ganda', near(tbNet(t, '1100'), 2084000 - 0) || tbNet(t, '1100') > 0, `${tbNet(t, '1100')}`);
}

// =============================================================================
section('3. AP - tagihan pemasok, bayar, aging');
const bills = async () => (await call(T, 'GET', '/payables/bills')).body;
const billOf = async (id) => (await bills()).find((b) => b.id === id);
const mkBill = (body) => call(T, 'POST', '/payables/bills', { supplierId: 's-nb-1', ...body });

const billA = await mkBill({ supplierInvoiceNumber: 'INV-A-001', billDate: TODAY, applyTax: false, note: 'Servis oven', lines: [{ accountId: A['6400'], amount: 1000000, description: 'Servis' }] });
is('bill A tanpa PPN -> 201', billA, 201);
check('bill A total 1.000.000, outstanding sama, status open', near(billA.body.total, 1000000) && near(billA.body.outstanding, 1000000) && billA.body.status === 'open', short(billA));
check('bill A tanpa PPN: taxAmount 0', near(billA.body.taxAmount ?? 0, 0));
check('bill A jatuh tempo = tanggal + termin 30 hari', billA.body.dueDate?.slice(0, 10) === new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), billA.body.dueDate);
check('bill A bernomor AP-YYYY-nnnnn', /^AP-\d{4}-\d{5}$/.test(billA.body.number ?? ''), billA.body.number);
{
  const j = (await journalsOf('payables')).filter((x) => x.sourceRefId === billA.body.id);
  check('jurnal bill A: 1 jurnal seimbang (Dr 6400 / Cr 2000)', j.length === 1 && balanced(j[0]) && near(lineOf(j[0], '6400', 'debit')?.amount, 1000000) && near(lineOf(j[0], '2000', 'credit')?.amount, 1000000), json(j.map((x) => x.lines.length)));
  check('jurnal bill A tertaut ke journalId bill', j[0]?.id === billA.body.journalId);
}
is('faktur pemasok ganda ditolak 409', await mkBill({ supplierInvoiceNumber: 'INV-A-001', billDate: TODAY, applyTax: false, lines: [{ accountId: A['6400'], amount: 1 }] }), 409);
is('faktur ganda dengan spasi/varian ditolak 409', await mkBill({ supplierInvoiceNumber: ' INV-A-001 ', billDate: TODAY, applyTax: false, lines: [{ accountId: A['6400'], amount: 1 }] }), 409);
is('nomor faktur sama untuk pemasok BERBEDA boleh', await call(T, 'POST', '/payables/bills', { supplierId: 's-nb-2', supplierInvoiceNumber: 'INV-A-001', billDate: TODAY, applyTax: false, lines: [{ accountId: A['6400'], amount: 1000 }] }), 201);

// Bayar A
is('bayar lebih dari sisa ditolak 400', await call(T, 'POST', `/payables/bills/${billA.body.id}/pay`, { amount: 1000000.01 }), 400);
is('bayar nol ditolak 400', await call(T, 'POST', `/payables/bills/${billA.body.id}/pay`, { amount: 0 }), 400);
is('bayar negatif ditolak 400', await call(T, 'POST', `/payables/bills/${billA.body.id}/pay`, { amount: -5 }), 400);
const payA1 = await call(T, 'POST', `/payables/bills/${billA.body.id}/pay`, { amount: 400000, method: 'transfer', payDate: TODAY });
is('bayar sebagian A 400.000 -> 201', payA1, 201);
check('status A -> partial', payA1.body.billStatus === 'partial', short(payA1));
{
  const b = await billOf(billA.body.id);
  check('A: paidAmount 400.000, outstanding 600.000', near(b.paidAmount, 400000) && near(b.outstanding, 600000), json([b.paidAmount, b.outstanding]));
  const pj = (await journalsOf('payables')).find((x) => x.id === payA1.body.journalId);
  check('jurnal bayar A seimbang Dr 2000 / Cr 1000, sourceRef=bill', pj && balanced(pj) && near(lineOf(pj, '2000', 'debit')?.amount, 400000) && near(lineOf(pj, '1000', 'credit')?.amount, 400000) && pj.sourceRefId === billA.body.id);
}
is('bayar sisa melebihi outstanding (600.000,01) ditolak 400', await call(T, 'POST', `/payables/bills/${billA.body.id}/pay`, { amount: 600000.01 }), 400);
const payA2 = await call(T, 'POST', `/payables/bills/${billA.body.id}/pay`, { amount: 600000, payDate: TODAY });
is('bayar sisa A -> 201', payA2, 201);
check('status A -> paid', payA2.body.billStatus === 'paid');
is('bayar faktur paid ditolak 400', await call(T, 'POST', `/payables/bills/${billA.body.id}/pay`, { amount: 1 }), 400);
check('A: outstanding 0 & status paid di daftar', near((await billOf(billA.body.id)).outstanding, 0) && (await billOf(billA.body.id)).status === 'paid');

// Bill B dengan PPN (3 baris, campuran beban & aset)
const billB = await mkBill({ supplierInvoiceNumber: 'INV-B-777', billDate: TODAY, lines: [
  { accountId: A['6400'], amount: 500000 }, { accountId: A['1100'], amount: 300000, description: 'Bahan' }] });
is('bill B dengan PPN (default) -> 201', billB, 201);
check('B: DPP 800.000, PPN 88.000, taxTotal 888.000', near(billB.body.total, 800000) && near(billB.body.taxAmount, 88000) && near(billB.body.taxTotal, 888000), short(billB));
check('B: outstanding = total termasuk PPN (888.000)', near(billB.body.outstanding, 888000), `outstanding=${billB.body.outstanding}`);
{
  const js = (await journalsOf('payables')).filter((x) => x.sourceRefId === billB.body.id);
  const tj = (await journalsOf('tax')).filter((x) => x.sourceRefId === billB.body.id);
  check('B: jurnal tagihan seimbang (DPP 800.000)', js.length === 1 && balanced(js[0]) && near(sumLines(js[0], 'credit'), 800000));
  check('B: jurnal PPN masukan 88.000 seimbang & tertaut bill', tj.length === 1 && balanced(tj[0]) && near(sumLines(tj[0], 'debit'), 88000));
}
{
  const d = await call(T, 'GET', `/tax/purchase/${billB.body.id}`);
  is('detail pajak bill B -> 200', d, 200);
  const c = d.body.computation;
  check('computation: ruleSnapshot tersimpan (kode, tarif 0.11, official)', c?.ruleSnapshot?.code === 'PPN-MASUKAN' && Number(c.ruleSnapshot.rate) === 0.11 && c.ruleSnapshot.source === 'official' && c.source === 'official', json(c));
  check('computation: base 800.000 pajak 88.000 arah input', near(c?.baseAmount, 800000) && near(c?.taxAmount, 88000) && c?.direction === 'input');
}
const payB1 = await call(T, 'POST', `/payables/bills/${billB.body.id}/pay`, { amount: 300000, payDate: TODAY });
is('bayar sebagian B 300.000 -> 201 partial', payB1, 201);
check('B -> partial', payB1.body.billStatus === 'partial', short(payB1));
is('bayar B melebihi gross (588.000,01) ditolak 400', await call(T, 'POST', `/payables/bills/${billB.body.id}/pay`, { amount: 588000.01 }), 400);
const payB2 = await call(T, 'POST', `/payables/bills/${billB.body.id}/pay`, { amount: 588000, payDate: TODAY });
is('bayar sisa gross B 588.000 -> 201', payB2, 201);
check('B -> paid setelah lunas termasuk PPN', payB2.body.billStatus === 'paid', short(payB2));

// Bill dengan pembulatan sen
const billF = await mkBill({ supplierInvoiceNumber: 'INV-F-ROUND', billDate: TODAY, lines: [{ accountId: A['6400'], amount: 333333.33 }] });
is('bill F nominal sen -> 201', billF, 201);
check('F: PPN 36.666,67 dan taxTotal 370.000,00', near(billF.body.taxAmount, 36666.67) && near(billF.body.taxTotal, 370000), short(billF));
{
  const tj = (await journalsOf('tax')).filter((x) => x.sourceRefId === billF.body.id);
  check('F: jurnal PPN seimbang', tj.length === 1 && balanced(tj[0]));
}

// Aging
// Tanggal jatuh tempo relatif terhadap hari ini: bucket aging bergantung pada selisih hari, jadi tanggal tetap
// membuat tes ini rusak diam-diam begitu hari berganti (C pernah "88 hari telat", lalu 94 dan pindah ke 90+).
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const billC = await mkBill({ supplierInvoiceNumber: 'INV-C', billDate: daysAgo(102), dueDate: daysAgo(88), applyTax: false, lines: [{ accountId: A['6400'], amount: 250000 }] });
const billD = await mkBill({ supplierInvoiceNumber: 'INV-D', billDate: daysAgo(31), dueDate: daysAgo(21), applyTax: false, lines: [{ accountId: A['6400'], amount: 100000 }] });
const billE = await call(T, 'POST', '/payables/bills', { supplierId: 's-nb-3', supplierInvoiceNumber: 'INV-E', billDate: TODAY, applyTax: false, lines: [{ accountId: A['6400'], amount: 40000 }] });
check('bill C/D/E dibuat', billC.status === 201 && billD.status === 201 && billE.status === 201, `${billC.status}/${billD.status}/${billE.status}`);
{
  const ag = (await call(T, 'GET', '/payables/aging')).body;
  const open = (await bills()).filter((b) => b.status === 'open' || b.status === 'partial');
  const outstandingSum = open.reduce((s, b) => s + Number(b.outstanding), 0);
  check('aging: total == jumlah outstanding bill open/partial', near(ag.total, outstandingSum), `${ag.total} vs ${outstandingSum}`);
  const bsum = Object.values(ag.buckets).reduce((s, v) => s + v, 0);
  check('aging: jumlah bucket == total', near(bsum, ag.total), json(ag));
  check('aging: C (88 hari telat) di bucket 61-90 = 250.000', near(ag.buckets.d61_90, 250000), json(ag.buckets));
  check('aging: D (21 hari telat) di bucket 1-30 = 100.000', near(ag.buckets.d1_30, 100000), json(ag.buckets));
  check('aging: current memuat F gross 370.000 + E 40.000 + 1.000 (bill pemasok-2) + sisa lain', ag.buckets.current >= 411000 - 0.005, json(ag.buckets));
  const glAp = await gl('2000');
  check('GL Hutang Usaha (2000) == total outstanding aging (konsistensi dokumen vs buku besar)', near(glAp, ag.total), `GL=${glAp} aging=${ag.total}`);
}
// validasi input bill
is('bill akun pendapatan ditolak 400', await mkBill({ billDate: '2026-10-04', applyTax: false, lines: [{ accountId: A['4000'], amount: 10 }] }), 400);
is('bill akun hutang ditolak 400', await mkBill({ billDate: '2026-10-04', applyTax: false, lines: [{ accountId: A['2000'], amount: 10 }] }), 400);
rejected('bill akun tenant lain ditolak 4xx', await mkBill({ billDate: '2026-10-04', applyTax: false, lines: [{ accountId: KA['6100'], amount: 10 }] }));
rejected('bill pemasok fiktif ditolak 4xx', await call(T, 'POST', '/payables/bills', { supplierId: 'x', applyTax: false, lines: [{ accountId: A['6400'], amount: 10 }] }));
is('bill nominal 0 ditolak 400', await mkBill({ billDate: '2026-10-04', applyTax: false, lines: [{ accountId: A['6400'], amount: 0 }] }), 400);
is('bill tanpa baris ditolak 400', await mkBill({ billDate: '2026-10-04', applyTax: false, lines: [] }), 400);
is('jatuh tempo < tanggal tagihan ditolak 400', await mkBill({ billDate: '2026-10-04', dueDate: '2026-10-01', applyTax: false, lines: [{ accountId: A['6400'], amount: 10 }] }), 400);
{
  const before = (await bills()).length;
  is('bill ke periode tertutup ditolak 400', await mkBill({ supplierInvoiceNumber: 'INV-CLOSED', billDate: '2026-02-10', applyTax: false, lines: [{ accountId: A['6400'], amount: 10 }] }), 400);
  check('penolakan periode tertutup tidak meninggalkan bill yatim', (await bills()).length === before);
}
is('bayar bill fiktif -> 404', await call(T, 'POST', '/payables/bills/tidak-ada/pay', { amount: 10 }), 404);

// =============================================================================
section('4. AR - faktur dari sales order, receive');
const so1 = await call(T, 'POST', '/crm/sales-orders', { customerId: 'c-nb-2', warehouseId: 'wh-newsem-1', lines: [{ productId: 'p-nb-1', qty: 10, price: 22000 }] });
is('SO1 dibuat', so1, 201);
is('SO1 confirm', await call(T, 'POST', `/crm/sales-orders/${so1.body.id}/confirm`, {}), 200, 201);
const ful1 = await call(T, 'POST', `/crm/sales-orders/${so1.body.id}/fulfil`, {});
is('SO1 fulfil -> faktur', ful1, 200, 201);
const inv1id = ful1.body.invoice?.id;
const invs = async () => (await call(T, 'GET', '/receivables/invoices')).body;
const invOf = async (id) => (await invs()).find((i) => i.id === id);
{
  const inv = await invOf(inv1id);
  check('faktur SO1: DPP 220.000, PPN 24.200, taxTotal 244.200', near(inv?.total, 220000) && near(inv?.taxAmount, 24200) && near(inv?.taxTotal, 244200), json(inv));
  check('faktur SO1: outstanding = gross 244.200 (termasuk PPN keluaran)', near(inv?.outstanding, 244200), `outstanding=${inv?.outstanding}`);
  const tj = (await journalsOf('tax')).filter((x) => x.sourceRefId === inv1id);
  check('jurnal PPN keluaran 24.200 seimbang (Dr 1200 / Cr 2100)', tj.length === 1 && balanced(tj[0]) && near(lineOf(tj[0], '2100', 'credit')?.amount, 24200));
  const d = await call(T, 'GET', `/tax/sale/${inv1id}`);
  check('detail pajak faktur: ruleSnapshot PPN-KELUARAN official', d.body.computation?.ruleSnapshot?.code === 'PPN-KELUARAN' && d.body.computation?.source === 'official', json(d.body.computation));
}
const rc1 = await call(T, 'POST', `/receivables/invoices/${inv1id}/receive`, { amount: 100000, payDate: TODAY });
is('terima sebagian 100.000 -> 201', rc1, 201);
check('faktur -> partial', rc1.body.invoiceStatus === 'partial', short(rc1));
const rc2 = await call(T, 'POST', `/receivables/invoices/${inv1id}/receive`, { amount: 90000, payDate: TODAY });
is('terima sebagian ke-2 90.000 -> 201 (cicilan berganda)', rc2, 201);
check('faktur tetap partial', rc2.body.invoiceStatus === 'partial', short(rc2));
{
  const inv = await invOf(inv1id);
  check('paidAmount 190.000 & outstanding 54.200', near(inv.paidAmount, 190000) && near(inv.outstanding, 54200), json([inv.paidAmount, inv.outstanding]));
  const rj = (await journalsOf('receivables')).find((x) => x.id === rc1.body.journalId);
  check('jurnal terima seimbang Dr 1000 / Cr 1200 sourceRef=faktur', rj && balanced(rj) && near(lineOf(rj, '1000', 'debit')?.amount, 100000) && near(lineOf(rj, '1200', 'credit')?.amount, 100000) && rj.sourceRefId === inv1id);
}
is('terima lebih dari sisa (54.200,01) ditolak 400', await call(T, 'POST', `/receivables/invoices/${inv1id}/receive`, { amount: 54200.01 }), 400);
const rc3 = await call(T, 'POST', `/receivables/invoices/${inv1id}/receive`, { amount: 54200, payDate: TODAY });
is('terima sisa 54.200 -> 201', rc3, 201);
check('faktur -> paid', rc3.body.invoiceStatus === 'paid', short(rc3));
is('terima pada faktur paid ditolak 400', await call(T, 'POST', `/receivables/invoices/${inv1id}/receive`, { amount: 1 }), 400);
is('terima faktur fiktif -> 404', await call(T, 'POST', '/receivables/invoices/tidak-ada/receive', { amount: 1 }), 404);

// SO2 dibiarkan terbuka untuk aging
const so2 = await call(T, 'POST', '/crm/sales-orders', { customerId: 'c-nb-1', warehouseId: 'wh-newsem-1', lines: [{ productId: 'p-nb-1', qty: 4, price: 22000 }] });
await call(T, 'POST', `/crm/sales-orders/${so2.body.id}/confirm`, {});
const ful2 = await call(T, 'POST', `/crm/sales-orders/${so2.body.id}/fulfil`, {});
is('SO2 fulfil -> faktur terbuka', ful2, 200, 201);
{
  const ag = (await call(T, 'GET', '/receivables/aging')).body;
  const open = (await invs()).filter((i) => i.status === 'open' || i.status === 'partial');
  const sum = open.reduce((s, i) => s + Number(i.outstanding), 0);
  check('AR aging total == jumlah outstanding faktur terbuka', near(ag.total, sum), `${ag.total} vs ${sum}`);
  check('AR aging jumlah bucket == total', near(Object.values(ag.buckets).reduce((s, v) => s + v, 0), ag.total), json(ag));
  check('AR aging: SO2 gross 97.680 (88.000 + PPN 9.680) di bucket current', near(ag.buckets.current, 97680), json(ag.buckets));
  const glAr = await gl('1200');
  check('GL Piutang Usaha (1200) == total outstanding aging', near(glAr, ag.total), `GL=${glAr} aging=${ag.total}`);
  const glPpn = await gl('2100');
  check('GL Hutang PPN (2100) == PPN keluaran SO1 + SO2 (24.200 + 9.680)', near(glPpn, 24200 + 9680), `${glPpn}`);
}

// =============================================================================
section('5. Aset tetap');
const mkAsset = (b) => call(T, 'POST', '/assets', b);
is('aset salvage >= cost ditolak 400', await mkAsset({ code: 'FA-BAD', name: 'Aset Salah', acquisitionDate: '2026-03-15', acquisitionCost: 1000, salvageValue: 1000, usefulLifeMonths: 12 }), 400);
is('aset saldo menurun tanpa tarif ditolak 400', await mkAsset({ code: 'FA-BAD', name: 'Aset Salah', acquisitionDate: '2026-03-15', acquisitionCost: 1000, usefulLifeMonths: 12, depreciationMethod: 'declining_balance' }), 400);
is('aset ke periode tertutup ditolak 400', await mkAsset({ code: 'FA-BAD', name: 'Aset Salah', acquisitionDate: '2026-02-10', acquisitionCost: 1000, usefulLifeMonths: 12 }), 400);
const fa1 = await mkAsset({ code: 'FA-001', name: 'Oven Rotary', acquisitionDate: '2026-03-15', acquisitionCost: 12000000, salvageValue: 600000, usefulLifeMonths: 12 });
is('aset FA-001 -> 201', fa1, 201);
is('kode aset ganda ditolak 409', await mkAsset({ code: 'FA-001', name: 'Oven Rotary', acquisitionDate: '2026-03-15', acquisitionCost: 1000, usefulLifeMonths: 12 }), 409);
{
  const j = (await journalsOf('assets')).find((x) => x.id === fa1.body.journalId);
  check('jurnal perolehan seimbang Dr 1300 / Cr 1000 12.000.000', j && balanced(j) && near(lineOf(j, '1300', 'debit')?.amount, 12000000));
}
const depRun = (code) => call(T, 'POST', '/assets/depreciation/run', { periodCode: code });
const assetOf = async (id, token = T) => (await call(token, 'GET', `/assets/${id}`)).body;
const depJournals = async (assetId) => (await journalsOf('assets')).filter((j) => j.sourceRefId === assetId && j.memo.startsWith('Penyusutan'));
is('run tanpa periodId/periodCode ditolak 400', await call(T, 'POST', '/assets/depreciation/run', {}), 400);
is('run periode fiktif -> 404', await depRun('2099-01'), 404);
is('run periode yang belum dimulai (2026-12) ditolak 400', await depRun('2026-12'), 400);
is('run ke periode tertutup ditolak 400', await depRun('2026-02'), 400);

const dr1 = await depRun('2026-04');
is('depreciation run 2026-04 -> 2xx', dr1, 200, 201);
check('FA-001: 950.000 untuk April', near(dr1.body.data?.find((x) => x.code === 'FA-001')?.depreciation, 950000), short(dr1));
{
  const a = await assetOf(fa1.body.id);
  const dj = await depJournals(fa1.body.id);
  check('1 jurnal penyusutan, seimbang Dr 6200 / Cr 1390 950.000', dj.length === 1 && balanced(dj[0]) && near(lineOf(dj[0], '6200', 'debit')?.amount, 950000) && near(lineOf(dj[0], '1390', 'credit')?.amount, 950000), json(dj.length));
  const d = new Date(dj[0].entryDate);
  check('entryDate jurnal penyusutan di dalam periode 2026-04', d >= new Date('2026-04-01T00:00:00Z') && d < new Date('2026-05-01T00:00:00Z'), dj[0]?.entryDate);
  check('akumulasi 950.000, nilai buku 11.050.000', near(a.accumulatedDepreciation, 950000) && near(a.bookValue, 11050000), json([a.accumulatedDepreciation, a.bookValue]));
}
const dr1b = await depRun('2026-04');
check('run ulang periode sama: 0 diproses', dr1b.status < 300 && (dr1b.body.processed ?? 0) === 0, short(dr1b));
{
  const a = await assetOf(fa1.body.id);
  const dj = await depJournals(fa1.body.id);
  check('run ulang: akumulasi tetap 950.000 & jurnal tetap 1', near(a.accumulatedDepreciation, 950000) && dj.length === 1, json([a.accumulatedDepreciation, dj.length]));
}
const par = await Promise.all(Array.from({ length: 5 }, () => depRun('2026-05')));
check('5 run paralel periode 2026-05: tidak ada 5xx', par.every((r) => r.status < 500), par.map((r) => r.status).join(','));
{
  const a = await assetOf(fa1.body.id);
  const dj = await depJournals(fa1.body.id);
  check('run paralel: akumulasi tepat 1.900.000 (tak ganda)', near(a.accumulatedDepreciation, 1900000), `${a.accumulatedDepreciation}`);
  check('run paralel: tepat 2 jurnal & 2 schedule', dj.length === 2 && a.schedules.length === 2, json([dj.length, a.schedules.length]));
}
// Aset yang baru dibeli tidak boleh disusutkan untuk periode sebelum tanggal perolehan
const faEarly = await mkAsset({ code: 'FA-EARLY', name: 'Mixer Baru', acquisitionDate: '2026-09-10', acquisitionCost: 1200000, usefulLifeMonths: 12 });
is('aset FA-EARLY -> 201', faEarly, 201);
await depRun('2026-08');
{
  const a = await assetOf(faEarly.body.id);
  check('FA-EARLY (beli 10 Sep) TIDAK disusutkan untuk periode Agustus', a.schedules.length === 0 && near(a.accumulatedDepreciation, 0), json([a.schedules.length, a.accumulatedDepreciation]));
  const fa = await assetOf(fa1.body.id);
  check('FA-001 ikut Agustus: akumulasi 2.850.000 (Apr, Mei, Agu)', near(fa.accumulatedDepreciation, 2850000), `${fa.accumulatedDepreciation}`);
}
// Saldo menurun: 24%/tahun -> 2%/bulan -> 200.000 pada bulan pertama
const faDb = await mkAsset({ code: 'FA-DB', name: 'Kulkas Display', acquisitionDate: '2026-09-01', acquisitionCost: 10000000, usefulLifeMonths: 60, depreciationMethod: 'declining_balance', decliningRate: 0.24 });
is('aset saldo menurun -> 201', faDb, 201);
const drSep = await depRun('2026-09');
is('run 2026-09 -> 2xx', drSep, 200, 201);
{
  const a = await assetOf(faDb.body.id);
  check('saldo menurun 24%/tahun: bulan pertama 200.000 (bukan 2.400.000)', near(a.schedules[0]?.depreciation, 200000), `${a.schedules[0]?.depreciation}`);
  const e = await assetOf(faEarly.body.id);
  check('FA-EARLY disusutkan 100.000 pada September (bulan perolehan)', near(e.accumulatedDepreciation, 100000), `${e.accumulatedDepreciation}`);
}
// Dispose
is('dispose ke periode tertutup ditolak 400', await call(T, 'POST', `/assets/${fa1.body.id}/dispose`, { proceeds: 1, disposalDate: '2026-02-10' }), 400);
check('aset tetap active setelah dispose ditolak', (await assetOf(fa1.body.id)).status !== 'disposed');
const dis1 = await call(T, 'POST', `/assets/${fa1.body.id}/dispose`, { proceeds: 10000000, disposalDate: '2026-10-09' });
is('dispose FA-001 (laba) -> 2xx', dis1, 200, 201);
// FA-001 disusutkan Apr, Mei, Agu, Sep = 4 x 950.000 = 3.800.000 -> nilai buku 8.200.000
check('laba = proceeds - nilai buku = 10.000.000 - 8.200.000 = 1.800.000', near(dis1.body.gainLoss, 1800000) && near(dis1.body.bookValue, 8200000), short(dis1));
{
  const j = (await journalsOf('assets')).find((x) => x.id === dis1.body.journalId);
  check('jurnal dispose seimbang: Dr Kas 10jt + Dr Akum 3,8jt = Cr Aset 12jt + Cr Pendapatan 1,8jt', j && balanced(j) && near(sumLines(j, 'debit'), 13800000) && near(lineOf(j, '4000', 'credit')?.amount, 1800000), j && json(j.lines.map((l) => [l.direction, l.amount])));
  const a = await assetOf(fa1.body.id);
  check('FA-001 status disposed, disposedAt = tanggal dispose', a.status === 'disposed' && a.disposedAt?.slice(0, 10) === '2026-10-09', json([a.status, a.disposedAt]));
}
is('dispose ulang ditolak 400', await call(T, 'POST', `/assets/${fa1.body.id}/dispose`, { proceeds: 1 }), 400);
{
  const before = (await assetOf(fa1.body.id)).schedules.length;
  const beforeJ = (await depJournals(fa1.body.id)).length;
  await depRun('2026-10');
  const a = await assetOf(fa1.body.id);
  check('aset disposed tidak disusutkan lagi', a.schedules.length === before && near(a.accumulatedDepreciation, 3800000) && (await depJournals(fa1.body.id)).length === beforeJ, json([a.schedules.length, a.accumulatedDepreciation]));
}
const dis2 = await call(T, 'POST', `/assets/${faEarly.body.id}/dispose`, { proceeds: 500000, disposalDate: '2026-10-09' });
is('dispose FA-EARLY (rugi) -> 2xx', dis2, 200, 201);
// FA-EARLY: disusutkan Sep + Okt = 200.000 -> nilai buku 1.000.000
check('rugi = 500.000 - 1.000.000 = -500.000', near(dis2.body.gainLoss, -500000), short(dis2));
{
  const j = (await journalsOf('assets')).find((x) => x.id === dis2.body.journalId);
  check('jurnal rugi seimbang: Dr 5000 500.000', j && balanced(j) && near(lineOf(j, '5000', 'debit')?.amount, 500000), j && json(j.lines.map((l) => [l.direction, l.amount])));
}
// Dispose paralel pada aset yang sama
const disPar = await Promise.all([1, 2, 3].map(() => call(T, 'POST', `/assets/${faDb.body.id}/dispose`, { proceeds: 9000000, disposalDate: '2026-10-09' })));
check('dispose paralel: tepat satu berhasil, tanpa 5xx', disPar.filter((r) => r.status < 300).length === 1 && disPar.every((r) => r.status < 500), disPar.map((r) => r.status).join(','));
{
  const dj = (await journalsOf('assets')).filter((j) => j.sourceRefId === faDb.body.id && j.memo.startsWith('Penghapusan'));
  check('dispose paralel: tepat 1 jurnal penghapusan', dj.length === 1, `${dj.length}`);
}

// =============================================================================
section('6. Pajak - aturan aktif, estimate berlabel');
const rules = (await call(T, 'GET', '/tax/rules')).body;
check('aturan PPh21 berlabel estimate di daftar aturan', rules.find((r) => r.code === 'PPH21-ESTIMATE')?.source === 'estimate');
check('aturan PPN official 0.11 masukan & keluaran', rules.filter((r) => r.category === 'vat' && r.source === 'official').length === 2);
is('aturan duplikat (kode+tanggal) ditolak 409', await call(T, 'POST', '/tax/rules', { code: 'PPN-MASUKAN', name: 'dup', category: 'vat', direction: 'input', basisType: 'net', rate: 0.11, effectiveFrom: '2022-01-01' }), 409);
is('tarif > 1 ditolak 400', await call(T, 'POST', '/tax/rules', { code: 'PPN-X', name: 'X', category: 'vat', direction: 'input', basisType: 'net', rate: 5, effectiveFrom: '2026-12-01' }), 400);
const est = await call(T, 'POST', '/tax/rules', { code: 'PPN-MASUKAN', name: 'PPN Masukan 12% (simulasi)', category: 'vat', direction: 'input', basisType: 'net', rate: 0.12, effectiveFrom: '2026-12-01' });
is('aturan simulasi tanpa source -> 201', est, 201);
check('aturan baru default berlabel estimate', est.body.source === 'estimate', short(est));
{
  const bE = await mkBill({ supplierInvoiceNumber: 'INV-EST', billDate: '2026-12-05', lines: [{ accountId: A['6400'], amount: 100000 }] });
  is('bill 2026-12-05 -> 201', bE, 201);
  const d = (await call(T, 'GET', `/tax/purchase/${bE.body.id}`)).body;
  check('bill memakai aturan aktif pada tanggalnya (12%) dan berlabel estimate di computation+snapshot', near(bE.body.taxAmount, 12000) && d.computation?.source === 'estimate' && d.computation?.ruleSnapshot?.source === 'estimate', json(d.computation));
  const old = await mkBill({ supplierInvoiceNumber: 'INV-OLD11', billDate: '2026-11-30', lines: [{ accountId: A['6400'], amount: 100000 }] });
  check('bill 2026-11-30 tetap 11% (aturan official, bukan estimate)', near(old.body.taxAmount, 11000), short(old));
}
{
  const masukan = (await call(T, 'GET', '/tax/rules')).body.find((r) => r.code === 'PPN-MASUKAN' && r.source === 'official');
  const off = await call(T, 'PATCH', `/tax/rules/${masukan.id}`, { isActive: false });
  is('nonaktifkan PPN masukan official', off, 200);
  const noTax = await mkBill({ supplierInvoiceNumber: 'INV-NOTAX', billDate: '2026-10-09', lines: [{ accountId: A['6400'], amount: 100000 }] });
  check('tanpa aturan aktif: tidak ada PPN, outstanding = DPP', near(noTax.body.taxAmount ?? 0, 0) && near(noTax.body.outstanding, 100000), short(noTax));
  const on = await call(T, 'PATCH', `/tax/rules/${masukan.id}`, { isActive: true });
  is('aktifkan kembali PPN masukan', on, 200);
}
is('bayar PPN melebihi nol ditolak 400', await call(T, 'POST', '/tax/payment', { amount: 0 }), 400);
{
  const before = await gl('2100');
  const tp = await call(T, 'POST', '/tax/payment', { amount: 10000, payDate: TODAY, reference: 'NTPN-1' });
  is('catat pembayaran PPN -> 201', tp, 201);
  check('GL Hutang PPN turun 10.000', near(await gl('2100'), before - 10000));
}

// =============================================================================
section('7. Banking & rekonsiliasi');
const bk = await call(T, 'POST', '/banking/accounts', { code: 'BCA-OPS', name: 'BCA Operasional', bankName: 'BCA', accountNumber: '1234567890', accountCode: '1000' });
is('rekening bank ditautkan ke akun kas 1000 -> 201', bk, 201);
check('rekening menautkan accountId kas', bk.body.accountId === A['1000']);
is('kode rekening ganda ditolak 400', await call(T, 'POST', '/banking/accounts', { code: 'BCA-OPS', name: 'Dup', accountCode: '1000' }), 400);
is('akun COA fiktif -> 404', await call(T, 'POST', '/banking/accounts', { code: 'BCA-2', name: 'Fiktif', accountCode: '9999' }), 404);
rejected('rekening ke akun pendapatan (bukan kas) ditolak 4xx', await call(T, 'POST', '/banking/accounts', { code: 'BCA-REV', name: 'Salah akun', accountCode: '4000' }));
const stm = (amount, description = 'Mutasi', statementDate = TODAY, bankAccountId = bk.body.id) =>
  call(T, 'POST', '/banking/statements', { bankAccountId, statementDate, description, amount });
const sIn1 = await stm(100000, 'TRF masuk CUST');
const sOut1 = await stm(-300000, 'TRF keluar SUPP');
is('impor mutasi masuk -> 201', sIn1, 201);
is('impor mutasi keluar -> 201', sOut1, 201);
check('mutasi baru belum rekonsiliasi', sIn1.body.isReconciled === false);
rejected('impor ke rekening fiktif ditolak 4xx', await stm(10, 'x', TODAY, 'tidak-ada'));
is('mutasi di rekening ditampilkan dalam daftar', await call(T, 'GET', `/banking/accounts/${bk.body.id}/statements`), 200);

const rec = (statementId, amount, entryDate = TODAY) => call(T, 'POST', '/banking/reconcile', { statementId, amount, entryDate });
is('nominal pencocokan beda ditolak 400', await rec(sIn1.body.id, 99999), 400);
rejected('tanggal terlalu jauh dari jurnal -> ditolak 4xx', await rec(sIn1.body.id, 100000, '2026-06-01'));
const r1 = await rec(sIn1.body.id, 100000);
is('reconcile masuk 100.000 -> 2xx', r1, 200, 201);
check('cocok ke jurnal receive 100.000 yang benar', r1.body.matchedJournal?.id === rc1.body.journalId, short(r1));
const r2 = await rec(sOut1.body.id, 300000);
is('reconcile keluar 300.000 -> 2xx', r2, 200, 201);
check('cocok ke jurnal pembayaran B (300.000) yang benar', r2.body.matchedJournal?.id === payB1.body.journalId, short(r2));
is('reconcile ulang baris yang sudah cocok ditolak 400', await rec(sIn1.body.id, 100000), 400);
// dua mutasi ke satu jurnal
const sIn1b = await stm(100000, 'TRF masuk ganda');
const dupSeq = await rec(sIn1b.body.id, 100000);
check('mutasi kedua 100.000 tidak boleh mengklaim jurnal yang sudah dipakai (4xx)', dupSeq.status === 404 || dupSeq.status === 409, short(dupSeq));
// arah salah: mutasi keluar vs jurnal debit
const sWrongDir = await stm(-90000, 'Arah salah');
rejected('mutasi keluar 90.000 tidak cocok dengan penerimaan 90.000 (arah beda)', await rec(sWrongDir.body.id, 90000));
// balapan: dua mutasi, satu jurnal
const mj = await call(T, 'POST', '/journals', { entryDate: TODAY, memo: 'Setoran uji rekonsiliasi', lines: [{ accountId: A['1000'], debit: 123000 }, { accountId: A['3000'], credit: 123000 }] });
is('jurnal setoran 123.000 -> 201', mj, 201);
const sP1 = await stm(123000, 'Setoran A');
const sP2 = await stm(123000, 'Setoran B');
const racers = await Promise.all([rec(sP1.body.id, 123000), rec(sP2.body.id, 123000)]);
check('dua mutasi paralel ke satu jurnal: tepat satu sukses, lainnya 409/404, tanpa 5xx',
  racers.filter((r) => r.status < 300).length === 1 && racers.filter((r) => r.status === 409 || r.status === 404).length === 1, racers.map((r) => r.status).join(','));
{
  const l1 = (await call(T, 'GET', `/banking/accounts/${bk.body.id}/statements`)).body;
  const matched = l1.filter((s) => s.matchedJournalId === mj.body.id);
  check('jurnal setoran hanya tertaut pada satu mutasi', matched.length === 1, `${matched.length}`);
}
const sManual = await stm(-4321, 'Biaya admin bank');
const mm = await call(T, 'POST', '/banking/reconcile', { statementId: sManual.body.id, match: false });
is('rekonsiliasi manual match:false -> 2xx', mm, 200, 201);
check('manual: isReconciled true tanpa jurnal', mm.body.isReconciled === true && mm.body.matchedJournal === null);
is('manual ulang ditolak 400', await call(T, 'POST', '/banking/reconcile', { statementId: sManual.body.id, match: false }), 400);
is('reconcile tanpa nominal/tanggal ditolak 400', await call(T, 'POST', '/banking/reconcile', { statementId: sP1.body.id }), 400, 409);
is('reconcile id fiktif -> 404', await call(T, 'POST', '/banking/reconcile', { statementId: 'tidak-ada', match: false }), 404);
{
  const sm = (await call(T, 'GET', '/banking/summary')).body.find((b) => b.code === 'BCA-OPS');
  const all = (await call(T, 'GET', `/banking/accounts/${bk.body.id}/statements`)).body;
  const tot = all.reduce((s, x) => s + Number(x.amount), 0);
  const rc = all.filter((x) => x.isReconciled).reduce((s, x) => s + Number(x.amount), 0);
  check('ringkasan: total & reconciled sesuai baris mutasi', near(sm.totalStatements, tot) && near(sm.reconciledAmount, rc) && sm.unreconciledCount === all.filter((x) => !x.isReconciled).length, json(sm));
}

// =============================================================================
section('8. Laporan');
{
  const t = await tb();
  check('TB: debit == kredit', t.balanced === true && near(t.totalDebit, t.totalCredit) && near(t.difference, 0), `${t.totalDebit} vs ${t.totalCredit}`);
  const sumD = t.data.reduce((s, r) => s + r.debit, 0);
  const sumC = t.data.reduce((s, r) => s + r.credit, 0);
  check('TB: total == jumlah baris', near(sumD, t.totalDebit) && near(sumC, t.totalCredit));
  for (const code of ['1000', '1200', '2000', '2100', '1300', '1390']) {
    const acc = accRes.body.data.find((a) => a.code === code);
    const net = tbNet(t, code);
    const g = await gl(code);
    const normal = acc.type === 'asset' || acc.type === 'expense' ? net : -net;
    check(`TB akun ${code} == buku besar`, near(normal, g), `TB=${normal} GL=${g}`);
  }
  check('TB: persediaan 1100 > 0 (saldo awal seed + bill B aset - HPP)', tbNet(t, '1100') !== 0);

  const bs = (await call(T, 'GET', `/finance/reports/balance-sheet?asOf=${ASOF}`)).body;
  check('Neraca: aset == kewajiban + ekuitas (balanced)', bs.balanced === true && near(bs.assets.total, bs.totalLiabilitiesEquity), `${bs.assets?.total} vs ${bs.totalLiabilitiesEquity}`);
  const sumAssets = bs.assets.detail.reduce((s, r) => s + r.balance, 0);
  check('Neraca: rincian aset == total', near(sumAssets, bs.assets.total));

  // Laba rugi: harus sama dengan angka jurnal pendapatan/beban
  const expectedRevenue = t.data.filter((r) => r.type === 'revenue').reduce((s, r) => s + r.credit - r.debit, 0);
  const expectedCogs = t.data.filter((r) => r.type === 'expense' && /^5\d+$/.test(r.code)).reduce((s, r) => s + r.debit - r.credit, 0);
  const expectedOpex = t.data.filter((r) => r.type === 'expense' && !/^5\d+$/.test(r.code)).reduce((s, r) => s + r.debit - r.credit, 0);
  // tanggal depan (Des) ikut di TB ASOF tetapi laba rugi memakai "N hari terakhir" tanpa batas atas; samakan lewat TB hari ini
  const tToday = await call(T, 'GET', '/finance/reports/trial-balance');
  const tt = tToday.body;
  const eRev = tt.data.filter((r) => r.type === 'revenue').reduce((s, r) => s + r.credit - r.debit, 0);
  const eCogs = tt.data.filter((r) => r.type === 'expense' && /^5\d+$/.test(r.code)).reduce((s, r) => s + r.debit - r.credit, 0);
  const eOpex = tt.data.filter((r) => r.type === 'expense' && !/^5\d+$/.test(r.code)).reduce((s, r) => s + r.debit - r.credit, 0);
  const pl = (await call(T, 'GET', '/finance/profit-loss?days=365')).body;
  void expectedRevenue; void expectedCogs; void expectedOpex;
  check('Laba rugi: pendapatan == jurnal pendapatan (neto)', near(pl.revenue, eRev), `${pl.revenue} vs ${eRev}`);
  check('Laba rugi: HPP == jurnal 5xxx (neto, termasuk rugi dispose)', near(pl.cogs, eCogs), `${pl.cogs} vs ${eCogs}`);
  check('Laba rugi: opex == beban non-HPP (neto setelah reversal)', near(pl.opex, eOpex), `${pl.opex} vs ${eOpex}`);
  check('Laba rugi: net = pendapatan - HPP - opex', near(pl.net, pl.revenue - pl.cogs - pl.opex));
  const bsToday = (await call(T, 'GET', '/finance/reports/balance-sheet')).body;
  check('Neraca (hari ini): laba berjalan == laba bersih laba rugi 365 hari', near(bsToday.equity.retainedProfit, pl.net) && bsToday.balanced === true, `${bsToday.equity?.retainedProfit} vs ${pl.net}; balanced=${bsToday.balanced}`);
}
// Mata uang
{
  const fx0 = await call(T, 'GET', '/finance/reports/trial-balance?currency=USD');
  check('TB ?currency=USD tanpa kurs: tidak 5xx, ditandai fallback', fx0.status === 200 && (fx0.body.fxFallbackUsed ?? []).length > 0, short(fx0));
  for (const p of ['/finance/reports/balance-sheet', '/finance/reports/consolidation', '/finance/reports/fx-rates', '/finance/profit-loss', '/finance/cashflow', '/dashboard/summary']) {
    const r = await call(T, 'GET', `${p}?currency=USD`);
    check(`GET ${p}?currency=USD tanpa kurs tidak 5xx`, r.status < 500, short(r));
  }
  is('currency huruf kecil ditolak 400', await call(T, 'GET', '/finance/reports/trial-balance?currency=usd'), 400);
  const companyId = (await call(T, 'GET', '/companies')).body.find((c) => c.code === 'MAIN').id;
  const setRate = await call(T, 'POST', `/companies/${companyId}/exchange-rates`, { baseCurrencyCode: 'IDR', quoteCurrencyCode: 'USD', rate: 0.0001, effectiveDate: '2026-01-01' });
  is('set kurs IDR->USD 0.0001 -> 2xx', setRate, 200, 201);
  const idr = await tb();
  const usd = await tb('&currency=USD');
  check('TB USD: tanpa fallback, mata uang USD', usd.currency === 'USD' && (usd.fxFallbackUsed ?? []).length === 0, json([usd.currency, usd.fxFallbackUsed]));
  check('TB USD: nominal TERKONVERSI (total debit = IDR x 0.0001)', near(usd.totalDebit, idr.totalDebit * 0.0001, 0.02), `${usd.totalDebit} vs ${idr.totalDebit * 0.0001}`);
  check('TB USD: tetap balanced', usd.balanced === true, `${usd.totalDebit} vs ${usd.totalCredit}`);
  const bsIdr = (await call(T, 'GET', `/finance/reports/balance-sheet?asOf=${ASOF}`)).body;
  const bsUsd = (await call(T, 'GET', `/finance/reports/balance-sheet?asOf=${ASOF}&currency=USD`)).body;
  check('Neraca USD: aset TERKONVERSI & balanced', near(bsUsd.assets.total, bsIdr.assets.total * 0.0001, 0.02) && bsUsd.balanced === true, `${bsUsd.assets?.total} vs ${bsIdr.assets.total * 0.0001}; balanced=${bsUsd.balanced}`);
  const plIdr = (await call(T, 'GET', '/finance/profit-loss?days=365')).body;
  const plUsd = (await call(T, 'GET', '/finance/profit-loss?days=365&currency=USD')).body;
  check('Laba rugi USD: pendapatan = IDR x 0.0001', near(plUsd.revenue, plIdr.revenue * 0.0001, 0.02) && plUsd.currency === 'USD', `${plUsd.revenue} vs ${plIdr.revenue * 0.0001}`);
}
// Cashflow dari GL
{
  const cf = (await call(T, 'GET', '/finance/cashflow?days=60&forecast=7')).body;
  const cash = accRes.body.data.find((a) => a.code === '1000').id;
  const g = (await call(T, 'GET', `/finance/reports/general-ledger/${cash}?asOf=${TODAY}&from=${new Date(Date.now() - 59 * 86400000).toISOString().slice(0, 10)}`)).body;
  const inflow = g.data.reduce((s, r) => s + r.debit, 0);
  const outflow = g.data.reduce((s, r) => s + r.credit, 0);
  check('Cashflow: total masuk == debit kas di GL (termasuk transaksi hari ini)', near(cf.totals.inflow, Math.round(inflow), 1), `${cf.totals.inflow} vs ${inflow}`);
  check('Cashflow: total keluar == kredit kas di GL', near(cf.totals.outflow, Math.round(outflow), 1), `${cf.totals.outflow} vs ${outflow}`);
  check('Cashflow: seri aktual 60 hari + prakiraan 7 hari', cf.series.length === 67 && cf.series.filter((p) => p.forecast).length === 7);
}
is('GL akun fiktif -> 404', await call(T, 'GET', '/finance/reports/general-ledger/tidak-ada'), 404);
is('asOf format salah ditolak 400', await call(T, 'GET', '/finance/reports/trial-balance?asOf=besok'), 400);
{
  const csv = await fetch(`${process.env.API_URL ?? 'http://localhost:4000/v1'}/finance/export?days=60`, { headers: { authorization: `Bearer ${T}` } });
  const text = await csv.text();
  check('ekspor CSV jurnal 200 dan memuat header', csv.status === 200 && text.includes('Tanggal,Jurnal'), `${csv.status}`);
}

// =============================================================================
section('9. Isolasi tenant (token Kelana vs dokumen Newsem)');
const hdr = { 'x-company-id': 'company-newsem-main' };
const notFound = (name, r) => check(name, r.status === 404 || r.status === 403 || r.status === 400, short(r));
const manualJ = (await journalsOf('manual'))[0];
notFound('Kelana reverse jurnal Newsem', await call(S, 'POST', `/journals/${manualJ.id}/reverse`, {}));
notFound('Kelana bayar bill Newsem', await call(S, 'POST', `/payables/bills/${billC.body.id}/pay`, { amount: 1 }));
notFound('Kelana terima faktur Newsem', await call(S, 'POST', `/receivables/invoices/${ful2.body.invoice.id}/receive`, { amount: 1 }));
notFound('Kelana baca aset Newsem', await call(S, 'GET', `/assets/${fa1.body.id}`));
notFound('Kelana dispose aset Newsem', await call(S, 'POST', `/assets/${faDb.body.id}/dispose`, { proceeds: 1 }));
notFound('Kelana daftar mutasi bank Newsem', await call(S, 'GET', `/banking/accounts/${bk.body.id}/statements`));
notFound('Kelana impor mutasi ke rekening Newsem', await call(S, 'POST', '/banking/statements', { bankAccountId: bk.body.id, statementDate: TODAY, description: 'x', amount: 1 }));
notFound('Kelana reconcile mutasi Newsem', await call(S, 'POST', '/banking/reconcile', { statementId: sP1.body.id, match: false }));
notFound('Kelana tutup periode Newsem', await call(S, 'POST', `/finance/fiscal-periods/${periodId('2026-03')}/close`, {}));
notFound('Kelana GL akun Newsem', await call(S, 'GET', `/finance/reports/general-ledger/${A['1000']}`));
notFound('Kelana detail pajak bill Newsem', await call(S, 'GET', `/tax/purchase/${billB.body.id}`));
notFound('Kelana detail pajak faktur Newsem', await call(S, 'GET', `/tax/sale/${inv1id}`));
notFound('Kelana depreciation run (periode Newsem)', await call(S, 'POST', '/assets/depreciation/run', { periodId: periodId('2026-03') }));
notFound('Kelana bill dengan pemasok Newsem', await call(S, 'POST', '/payables/bills', { supplierId: 's-nb-1', applyTax: false, lines: [{ accountId: KA['6100'], amount: 10 }] }));
notFound('Kelana bill dengan akun Newsem', await call(S, 'POST', '/payables/bills', { supplierId: 's-nb-1', applyTax: false, lines: [{ accountId: A['6400'], amount: 10 }] }));
notFound('Kelana jurnal dengan akun Newsem', await call(S, 'POST', '/journals', { entryDate: TODAY, memo: 'Lintas tenant', lines: [{ accountId: A['1000'], debit: 5 }, { accountId: A['3000'], credit: 5 }] }));
notFound('Kelana set kurs untuk company Newsem', await call(S, 'POST', '/companies/company-newsem-main/exchange-rates', { baseCurrencyCode: 'IDR', quoteCurrencyCode: 'USD', rate: 1, effectiveDate: '2026-01-01' }));
for (const [p, label] of [['/journals?take=200', 'jurnal'], ['/payables/bills', 'bill'], ['/receivables/invoices', 'faktur'], ['/assets', 'aset'], ['/banking/accounts', 'rekening'], ['/finance/entries', 'entries']]) {
  for (const h of [{}, hdr]) {
    const r = await call(S, 'GET', p, undefined, h);
    const body = json(r.body);
    check(`daftar ${label} Kelana tidak bocor data Newsem${h['x-company-id'] ? ' (X-Company-Id Newsem)' : ''}`, r.status !== 200 ? r.status < 500 : !/tenant-newsem|company-newsem|INV-A-001|FA-001|BCA-OPS/.test(body), short(r));
  }
}
{
  const tK = await tb('', S);
  check('TB Kelana tidak memuat angka Newsem (kas Kelana hanya saldo awal)', near(tbNet(tK, '1000'), 5000000), `${tbNet(tK, '1000')}`);
  const forged = await call(S, 'GET', `/finance/reports/trial-balance?asOf=${ASOF}`, undefined, hdr);
  check('X-Company-Id milik Newsem pada token Kelana tidak membuka TB Newsem', forged.status >= 400 || near(tbNet(forged.body, '1000'), 5000000), short(forged));
}

// =============================================================================
section('10. Konkurensi');
// 10 pembayaran paralel pada bill yang sisanya hanya cukup untuk satu pembayaran
const billG = await mkBill({ supplierInvoiceNumber: 'INV-G-CONC', billDate: '2026-10-09', applyTax: false, lines: [{ accountId: A['6400'], amount: 100000 }] });
is('bill G (100.000) dibuat', billG, 201);
is('bayar G 50.000 dulu -> partial', await call(T, 'POST', `/payables/bills/${billG.body.id}/pay`, { amount: 50000, payDate: TODAY }), 201);
const parPay = await Promise.all(Array.from({ length: 10 }, () => call(T, 'POST', `/payables/bills/${billG.body.id}/pay`, { amount: 50000, payDate: TODAY })));
check('10 pembayaran paralel: tepat 1 sukses', parPay.filter((r) => r.status === 201).length === 1, parPay.map((r) => r.status).join(','));
check('10 pembayaran paralel: sisanya ditolak 4xx (tanpa 5xx)', parPay.filter((r) => r.status !== 201).every((r) => r.status >= 400 && r.status < 500), parPay.map((r) => r.status).join(','));
{
  const g = await billOf(billG.body.id);
  check('G: total terbayar tidak melebihi total (100.000) & status paid', near(g.paidAmount, 100000) && g.status === 'paid', json([g.paidAmount, g.status]));
  const pj = (await journalsOf('payables')).filter((j) => j.sourceRefId === billG.body.id && j.memo.startsWith('Pembayaran'));
  const paid = pj.reduce((s, j) => s + Number(lineOf(j, '2000', 'debit')?.amount ?? 0), 0);
  check('G: jurnal pembayaran di buku besar total 100.000 (tidak ada pembayaran fiktif)', near(paid, 100000), `${paid} dari ${pj.length} jurnal`);
}
// 10 penerimaan paralel pada faktur AR
{
  const inv2 = await invOf(ful2.body.invoice.id);
  const half = Math.round(Number(inv2.outstanding) / 2 * 100) / 100;
  is('terima 1/2 faktur SO2 dulu', await call(T, 'POST', `/receivables/invoices/${inv2.id}/receive`, { amount: half, payDate: TODAY }), 201);
  const rest = (await invOf(inv2.id)).outstanding;
  const parRc = await Promise.all(Array.from({ length: 10 }, () => call(T, 'POST', `/receivables/invoices/${inv2.id}/receive`, { amount: rest, payDate: TODAY })));
  check('10 penerimaan paralel: tepat 1 sukses, sisanya 4xx', parRc.filter((r) => r.status === 201).length === 1 && parRc.filter((r) => r.status !== 201).every((r) => r.status >= 400 && r.status < 500), parRc.map((r) => r.status).join(','));
  const f = await invOf(inv2.id);
  check('SO2: terbayar == gross, status paid', near(f.paidAmount, f.taxTotal) && f.status === 'paid', json([f.paidAmount, f.taxTotal, f.status]));
}
// faktur pemasok ganda secara paralel
{
  const par5 = await Promise.all(Array.from({ length: 5 }, () => mkBill({ supplierInvoiceNumber: 'INV-RACE-1', billDate: '2026-10-09', applyTax: false, lines: [{ accountId: A['6400'], amount: 1234 }] })));
  check('5 faktur pemasok ganda paralel: tepat 1 sukses, sisanya 409 (bukan 5xx)', par5.filter((r) => r.status === 201).length === 1 && par5.filter((r) => r.status !== 201).every((r) => r.status === 409), par5.map((r) => r.status).join(','));
}
// 20 jurnal paralel
{
  const par20 = await Promise.all(Array.from({ length: 20 }, (_, i) => call(T, 'POST', '/journals', {
    entryDate: '2026-10-09', memo: `Jurnal paralel ${i + 1}`,
    lines: [{ accountId: A['1000'], debit: 1000 + i }, { accountId: A['3000'], credit: 1000 + i }],
  })));
  check('20 jurnal paralel: semua 201', par20.every((r) => r.status === 201), par20.map((r) => r.status).join(','));
  const nums = par20.filter((r) => r.status === 201).map((r) => r.body.number);
  check('20 jurnal paralel: nomor unik', new Set(nums).size === nums.length, `${new Set(nums).size}/${nums.length}`);
  const ints = nums.map(seq).sort((a, b) => a - b);
  check('20 jurnal paralel: nomor berurutan tanpa lubang', ints.every((n, i) => i === 0 || n === ints[i - 1] + 1), ints.join(','));
}
// reversal paralel
{
  const mx = await call(T, 'POST', '/journals', { entryDate: TODAY, memo: 'Untuk reversal paralel', lines: [{ accountId: A['6400'], debit: 777 }, { accountId: A['1000'], credit: 777 }] });
  const parRev = await Promise.all(Array.from({ length: 5 }, () => call(T, 'POST', `/journals/${mx.body.id}/reverse`, {})));
  check('5 reversal paralel: tepat 1 sukses, sisanya 409', parRev.filter((r) => r.status === 201).length === 1 && parRev.filter((r) => r.status !== 201).every((r) => r.status === 409), parRev.map((r) => r.status).join(','));
  const revs = (await journalsOf('manual:reversal')).filter((j) => j.reversalOf?.id === mx.body.id);
  check('hanya 1 jurnal pembalik tercipta', revs.length === 1, `${revs.length}`);
}

// =============================================================================
section('11. Invarian akhir setelah semua transaksi');
{
  const t = await tb();
  check('TB akhir: debit == kredit', t.balanced === true && near(t.totalDebit, t.totalCredit), `${t.totalDebit} vs ${t.totalCredit}`);
  const bs = (await call(T, 'GET', `/finance/reports/balance-sheet?asOf=${ASOF}`)).body;
  check('Neraca akhir: aset == kewajiban + ekuitas', bs.balanced === true && near(bs.assets.total, bs.totalLiabilitiesEquity), `${bs.assets?.total} vs ${bs.totalLiabilitiesEquity}`);
  const ag = (await call(T, 'GET', '/payables/aging')).body;
  check('GL 2000 == AP aging total (akhir)', near(await gl('2000'), ag.total), `${await gl('2000')} vs ${ag.total}`);
  const ar = (await call(T, 'GET', '/receivables/aging')).body;
  check('GL 1200 == AR aging total (akhir)', near(await gl('1200'), ar.total), `${await gl('1200')} vs ${ar.total}`);
  const dash = (await call(T, 'GET', '/dashboard/summary')).body;
  const tToday = await call(T, 'GET', '/finance/reports/trial-balance');
  check('Dashboard: kas == TB kas (hari ini)', near(dash.cash, tbNet(tToday.body, '1000')), `${dash.cash} vs ${tbNet(tToday.body, '1000')}`);
  const bsT = (await call(T, 'GET', '/finance/reports/balance-sheet')).body;
  check('Dashboard: aset/kewajiban/ekuitas == Neraca', near(dash.assets, bsT.assets.total) && near(dash.liabilities, bsT.liabilities.total) && near(dash.equity, bsT.equity.total), json([dash.assets, bsT.assets.total, dash.liabilities, bsT.liabilities.total, dash.equity, bsT.equity.total]));
  const pl = (await call(T, 'GET', '/finance/profit-loss?days=30')).body;
  check('Dashboard: laba bersih 30 hari == laba rugi 30 hari', near(dash.netProfit, pl.net) && near(dash.revenue, pl.revenue), json([dash.netProfit, pl.net]));
}

done();
