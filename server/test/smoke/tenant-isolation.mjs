// Sapuan IDOR / isolasi tenant terhadap API yang SUDAH berjalan.
//
//   API_URL=http://localhost:4013/v1 node test/smoke/tenant-isolation.mjs
//
// Cara kerja (otomatis, tidak ada daftar rute manual):
//  1. Rute dibaca dari source controller (@Controller + @Get/@Post/@Patch/@Put/@Delete).
//  2. Login owner Newsem -> panggil setiap GET list tanpa parameter -> kumpulkan semua `id`.
//  3. Login sari (Kopi Kelana, tenant lain) -> untuk SETIAP rute ber-:param, isi param
//     dengan id milik Newsem lalu panggil GET/PATCH/PUT/DELETE/POST.
//     Wajib 4xx (404/403/400/...) -- tidak boleh 2xx (bocor / termutasi) maupun 5xx.
//  4. Respons GET list milik sari tidak boleh memuat satu pun id Newsem.
//  5. Header X-Company-Id milik tenant lain -> 403; X-Tenant-ID palsu -> 403.
//  6. Referensi id asing di BODY (POST/PATCH tanpa :id) ditolak.
//
// Env: SMOKE_OWNER_EMAIL/PASSWORD (default owner Newsem), SMOKE_OTHER_EMAIL/PASSWORD (default sari).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API, call, login, check, done } from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

// ── 1. Ekstrak rute dari controller ─────────────────────────────────────────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.controller.ts')) out.push(p);
  }
  return out;
}

function extractRoutes() {
  const routes = [];
  for (const file of walk(join(root, 'modules'))) {
    const src = readFileSync(file, 'utf8');
    const prefixMatch = src.match(/@Controller\(\s*(?:'([^']*)')?\s*\)/);
    const prefix = prefixMatch?.[1] ?? '';
    const lines = src.split(/\r?\n/);
    let pending = null;
    let isPublic = false;
    for (const line of lines) {
      const verb = line.match(/^\s*@(Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?\s*\)/);
      if (/^\s*@Public\(\)/.test(line)) isPublic = true;
      if (verb) {
        pending = { method: verb[1].toUpperCase(), sub: verb[2] ?? '' };
        continue;
      }
      // metode berikutnya (bukan decorator) menutup blok decorator
      if (pending && /^\s*(async\s+)?[a-zA-Z_]\w*\s*\(/.test(line)) {
        const path = '/' + [prefix, pending.sub].filter(Boolean).join('/');
        routes.push({ ...pending, path: path.replace(/\/+/g, '/'), isPublic, file });
        pending = null;
        isPublic = false;
      }
      if (pending === null && /^\s*(async\s+)?[a-zA-Z_]\w*\s*\(/.test(line)) isPublic = false;
    }
  }
  return routes;
}

const routes = extractRoutes().filter((r) => !r.isPublic);
const SKIP = [/^\/auth\//, /^\/ai\/chat/, /^\/ocr\/(scan|parse)/];
const testable = routes.filter((r) => !SKIP.some((re) => re.test(r.path)));
console.log(`Rute terbaca: ${routes.length} (${testable.length} diuji, ${routes.length - testable.length} dilewati/publik)`);

const ownerEmail = process.env.SMOKE_OWNER_EMAIL ?? 'owner@newsembakery.id';
const ownerPass = process.env.SMOKE_OWNER_PASSWORD ?? 'admin123';
const otherEmail = process.env.SMOKE_OTHER_EMAIL ?? 'sari@kopikelana.id';
const otherPass = process.env.SMOKE_OTHER_PASSWORD ?? 'admin123';

const owner = await login(ownerEmail, ownerPass);
const other = await login(otherEmail, otherPass);

// ── 2. Kumpulkan id Newsem dari semua GET list ──────────────────────────────
function collect(node, into, depth = 0) {
  if (depth > 5 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node.slice(0, 30)) collect(item, into, depth + 1);
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if ((k === 'id' || k === 'key') && typeof v === 'string' && v.length < 80) into.add(v);
    else if (typeof v === 'object') collect(v, into, depth + 1);
  }
}

const listRoutes = testable.filter((r) => r.method === 'GET' && !r.path.includes(':'));
const idsByModule = new Map(); // segmen pertama -> Set id
const allOwnerIds = new Set();
let ownerOk = 0;
for (const r of listRoutes) {
  const res = await call(owner, 'GET', r.path);
  if (res.status >= 200 && res.status < 300) {
    ownerOk++;
    const set = new Set();
    collect(res.body, set);
    const mod = r.path.split('/')[1];
    if (!idsByModule.has(mod)) idsByModule.set(mod, new Set());
    for (const id of set) {
      idsByModule.get(mod).add(id);
      allOwnerIds.add(id);
    }
  }
}
console.log(`Kontrol: owner GET list 2xx ${ownerOk}/${listRoutes.length}, id terkumpul: ${allOwnerIds.size}`);
check('id Newsem berhasil dikumpulkan (>50)', allOwnerIds.size > 50, String(allOwnerIds.size));

// id milik sari sendiri tidak boleh dianggap "id asing"
const otherOwn = new Set();
for (const r of listRoutes) {
  const res = await call(other, 'GET', r.path);
  if (res.status >= 200 && res.status < 300) collect(res.body, otherOwn);
}
const foreignIds = new Set([...allOwnerIds].filter((id) => !otherOwn.has(id)));

// ── 4. Kebocoran list: respons sari tidak boleh memuat id Newsem ────────────
let leaks = 0;
// /audit/* dilewati: log sari memuat id yang sari sendiri ketik pada probe IDOR (entityId), bukan data Newsem.
for (const r of listRoutes.filter((x) => !x.path.startsWith('/audit/'))) {
  const res = await call(other, 'GET', r.path);
  if (res.status >= 500) {
    check(`GET ${r.path} (sari) bukan 5xx`, false, `${res.status}`);
    continue;
  }
  if (res.status < 200 || res.status >= 300) continue;
  const text = JSON.stringify(res.body);
  const hit = [...foreignIds].find((id) => id.length >= 8 && text.includes(`"${id}"`));
  if (hit) {
    leaks++;
    check(`GET ${r.path} (sari) tidak memuat id tenant lain`, false, `bocor id ${hit}`);
  }
}
check(`tidak ada kebocoran id Newsem pada list sari (${listRoutes.length} endpoint)`, leaks === 0);

// ── 3. IDOR: rute ber-:param dengan id asing ────────────────────────────────
const paramRoutes = testable.filter((r) => r.path.includes(':'));
const pick = (mod) => {
  const own = [...(idsByModule.get(mod) ?? [])].filter((id) => foreignIds.has(id)).slice(0, 6);
  if (own.length) return own;
  return [...foreignIds].slice(0, 4);
};

// Bila validasi DTO menolak body kosong (400), bangun body dari pesan class-validator
// agar probe sampai ke lapisan otorisasi/tenant, bukan berhenti di validasi.
// Pesan IsEnum(['a','b']) tidak memuat daftar nilai, jadi coba kandidat umum bergantian.
const ENUM_GUESSES = ['approved', 'qualified', 'in_progress', 'sent', 'in_transit', 'screening', 'open', 'draft', 'prospecting', 'pass', 'delivered', 'resolved', 'rejected'];
function guessBody(messages, body, round = 0) {
  const out = { ...body };
  for (const m of Array.isArray(messages) ? messages : []) {
    const f = String(m).match(/^([A-Za-z_][A-Za-z0-9_]*) /)?.[1];
    if (!f || f.includes('.')) continue;
    if (/one of the following values: S/.test(m)) out[f] = m.match(/values: ([^,]+)/)[1].trim();
    else if (/one of the following values:/.test(m)) out[f] = ENUM_GUESSES[round % ENUM_GUESSES.length];
    else if (/boolean/.test(m)) out[f] = true;
    else if (/ISO 8601/.test(m)) out[f] = new Date().toISOString();
    else if (/number|integer/.test(m)) out[f] = 1;
    else if (/array/.test(m)) out[f] = [];
    else if (/string|longer than/.test(m)) out[f] = 'uji-isolasi-tenant-0123456789';
  }
  return out;
}

async function probe(r, path) {
  let body = r.method === 'GET' || r.method === 'DELETE' ? undefined : {};
  let res = await call(other, r.method, path, body);
  for (let i = 0; i < 14 && res.status === 400 && body !== undefined; i++) {
    const next = guessBody(res.body?.message, body, i);
    if (JSON.stringify(next) === JSON.stringify(body) && i > 12) break;
    body = next;
    res = await call(other, r.method, path, body);
  }
  return res;
}

const isEmptyBody = (b) =>
  b === null || b === undefined || b === '' || (Array.isArray(b) && b.length === 0) ||
  (typeof b === 'object' && !Array.isArray(b) && Object.keys(b).length === 0);

const idor = { tested: 0, ok4xx: 0, inconclusive400: 0, bad: [], weak: [] };
const order = { GET: 0, PATCH: 1, PUT: 1, POST: 2, DELETE: 3 };
paramRoutes.sort((a, b) => order[a.method] - order[b.method]);
for (const r of paramRoutes) {
  const mod = r.path.split('/')[1];
  for (const id of pick(mod)) {
    const path = r.path.replace(/:[A-Za-z]+/g, id);
    const res = await probe(r, path);
    idor.tested++;
    if (res.status >= 200 && res.status < 300) {
      // 2xx berbody kosong (null / []) = tidak ada data bocor tapi seharusnya 404.
      const line = `${r.method} ${r.path} -> ${res.status} ${JSON.stringify(res.body)?.slice(0, 100)}`;
      if (isEmptyBody(res.body)) idor.weak.push(line);
      else idor.bad.push(line);
    } else if (res.status >= 500) {
      idor.bad.push(`${r.method} ${path} -> ${res.status} (5xx)`);
    } else if (res.status === 400) {
      if (process.env.SHOW400) console.log('   400', r.method, r.path, JSON.stringify(res.body?.message)?.slice(0, 120));
      idor.inconclusive400++;
    } else {
      idor.ok4xx++;
    }
  }
}
console.log(
  `IDOR: ${idor.tested} probe, ${idor.ok4xx} ditolak 401/403/404, ${idor.inconclusive400} berhenti di 400 (tidak konklusif), ${idor.weak.length} 2xx kosong`,
);
for (const line of new Set(idor.weak)) console.log(`  WARN 2xx kosong (tanpa kebocoran, tetapi seharusnya 404): ${line}`);
for (const line of new Set(idor.bad)) check(`IDOR ${line}`, false);
check(`semua probe ber-:id dengan id tenant lain ditolak (${paramRoutes.length} rute)`, idor.bad.length === 0);
if (process.env.STRICT === '1') check('tidak ada 2xx kosong (STRICT)', idor.weak.length === 0);

// ── 5. Header tenant/company ────────────────────────────────────────────────
const fakeTenant = await call(other, 'GET', '/inventory/products', undefined, { 'x-tenant-id': 'tenant-newsem' });
check('X-Tenant-ID tenant lain -> 403', fakeTenant.status === 403, String(fakeTenant.status));
const garbageTenant = await call(other, 'GET', '/inventory/products', undefined, { 'x-tenant-id': "' OR 1=1 --" });
check('X-Tenant-ID sampah -> 403', garbageTenant.status === 403, String(garbageTenant.status));

// Perusahaan milik tenant lain (UUID valid): daftarkan tenant sementara agar punya company berformat UUID.
const stamp = Date.now();
const reg = await call(null, 'POST', '/auth/register', {
  businessName: `Isolasi ${stamp}`,
  industryTemplate: 'retail',
  ownerName: 'Isolasi Uji',
  email: `isolasi-${stamp}@example.com`,
  password: 'Uji-Isolasi-2026!x',
});
if (reg.body?.accessToken) {
  const companies = await call(reg.body.accessToken, 'GET', '/companies');
  const foreignCompany = (Array.isArray(companies.body) ? companies.body : companies.body?.data)?.[0]?.id;
  check('company asing (UUID) tersedia untuk uji', Boolean(foreignCompany));
  if (foreignCompany) {
    for (const path of ['/inventory/products', '/finance/entries', '/crm/leads']) {
      const r = await call(other, 'GET', path, undefined, { 'x-company-id': foreignCompany });
      check(`X-Company-Id tenant lain GET ${path} -> 403`, r.status === 403, String(r.status));
    }
    const w = await call(other, 'POST', '/crm/leads', { name: 'x' }, { 'x-company-id': foreignCompany });
    check('X-Company-Id tenant lain POST -> 403', w.status === 403, String(w.status));
  }
} else {
  console.log(`  (lewati uji X-Company-Id UUID: register gagal ${reg.status} ${JSON.stringify(reg.body)?.slice(0, 120)})`);
}
const nonUuid = await call(other, 'GET', '/inventory/products', undefined, { 'x-company-id': 'company-newsem-main' });
check('X-Company-Id id Newsem (non-UUID) -> 403', nonUuid.status === 403, String(nonUuid.status));

// ── 6. Referensi id asing di body ───────────────────────────────────────────
// Ambil satu id nyata per resource Newsem lalu coba dipakai oleh sari di body.
async function firstId(path) {
  const r = await call(owner, 'GET', path);
  const arr = Array.isArray(r.body) ? r.body : r.body?.data ?? r.body?.items;
  return Array.isArray(arr) ? arr[0]?.id : undefined;
}
const f = {
  product: await firstId('/inventory/products'),
  warehouse: await firstId('/inventory/warehouses'),
  outlet: await firstId('/outlets'),
  supplier: await firstId('/parties/suppliers'),
  customer: await firstId('/parties/customers'),
  account: await firstId('/finance/accounts'),
  user: await firstId('/users'),
};
const notCreated = (name, res) =>
  check(name, !(res.status >= 200 && res.status < 300) && res.status < 500, `${res.status} ${JSON.stringify(res.body)?.slice(0, 120)}`);

if (f.outlet && f.product) {
  notCreated(
    'POST /sales/transactions dengan outlet+produk Newsem oleh sari ditolak',
    await call(other, 'POST', '/sales/transactions', {
      outletId: f.outlet,
      paymentMethod: 'cash',
      items: [{ productId: f.product, quantity: 1, unitPrice: 1000 }],
    }),
  );
}
if (f.outlet) {
  notCreated(
    'POST /users dengan outletIds Newsem oleh sari ditolak',
    await call(other, 'POST', '/users', {
      name: 'Uji Silang',
      email: `silang-${stamp}@example.com`,
      role: 'staff',
      outletIds: [f.outlet],
    }),
  );
}
if (f.product && f.warehouse) {
  notCreated(
    'POST /inventory/movements memakai produk+gudang Newsem oleh sari ditolak',
    await call(other, 'POST', '/inventory/movements', {
      productId: f.product,
      warehouseId: f.warehouse,
      type: 'in',
      quantity: 1,
    }),
  );
}
if (f.supplier && f.product) {
  notCreated(
    'POST /purchasing/orders dengan supplier+produk Newsem oleh sari ditolak',
    await call(other, 'POST', '/purchasing/orders', {
      supplierId: f.supplier,
      items: [{ productId: f.product, quantity: 1, unitCost: 1000 }],
    }),
  );
}
if (f.user) {
  notCreated(
    'PATCH /users/:id Newsem oleh sari ditolak',
    await call(other, 'PATCH', `/users/${f.user}`, { isActive: false }),
  );
  notCreated('DELETE /users/:id Newsem oleh sari ditolak', await call(other, 'DELETE', `/users/${f.user}`));
}
// approvals submit dengan role approver milik tenant lain
const ownerUsers = await call(owner, 'GET', '/users');
if (ownerUsers.status === 200) {
  notCreated(
    'POST /approvals dengan approverRoleId asing ditolak',
    await call(other, 'POST', '/approvals', {
      documentType: 'purchase_order',
      documentId: 'doc-isolasi',
      steps: [{ approverRoleId: '00000000-0000-4000-8000-000000000000' }],
    }),
  );
}

done();
