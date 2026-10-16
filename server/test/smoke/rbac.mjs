// Matriks RBAC role x endpoint terhadap API yang SUDAH berjalan.
//
//   API_URL=http://localhost:4013/v1 node test/smoke/rbac.mjs
//
// Untuk setiap rute (dibaca dari @RequirePermissions di controller) dan tiap role
// (owner, admin, manager, cashier, staff) diperiksa:
//   - role TANPA izin yang dibutuhkan  -> harus 403
//   - role DENGAN izin                 -> tidak boleh 401/403 (400/404 dari validasi tidak masalah)
// Izin per role diambil dari API itu sendiri (GET /users/permissions/matrix = ROLE_PERMISSIONS).
// Memakai tenant Kopi Kelana (owner/manager/cashier/staff dari seed + admin dibuat di sini).
// Lalu skenario khusus: approvals:decide, self-approval, eskalasi hak, override izin per-user.
import { call, login, check, done } from './lib.mjs';
import { extractRoutes } from './routes.mjs';

const ownerEmail = process.env.RBAC_OWNER_EMAIL ?? 'sari@kopikelana.id';
const ownerPass = process.env.RBAC_OWNER_PASSWORD ?? 'admin123';
const SEED = {
  manager: [process.env.RBAC_MANAGER_EMAIL ?? 'bima@kopikelana.id', process.env.RBAC_PASSWORD ?? 'admin123'],
  cashier: [process.env.RBAC_CASHIER_EMAIL ?? 'dewi@kopikelana.id', process.env.RBAC_PASSWORD ?? 'admin123'],
  staff: [process.env.RBAC_STAFF_EMAIL ?? 'andi@kopikelana.id', process.env.RBAC_PASSWORD ?? 'admin123'],
};

const tokens = { owner: await login(ownerEmail, ownerPass) };
for (const [role, [email, pw]] of Object.entries(SEED)) tokens[role] = await login(email, pw);

// Admin tidak ada di seed: buat lewat API (sekaligus menguji alur pembuatan user).
const adminEmail = `rbac-admin-${Date.now()}@example.com`;
const created = await call(tokens.owner, 'POST', '/users', { name: 'RBAC Admin', email: adminEmail, role: 'admin' });
check('owner dapat membuat user admin', created.status === 201 && created.body?.temporaryPassword, JSON.stringify(created.body));
tokens.admin = await login(adminEmail, created.body.temporaryPassword);
const adminId = created.body.user.id;

const matrix = (await call(tokens.owner, 'GET', '/users/permissions/matrix')).body;
const rolePerms = { ...matrix.byRole, owner: matrix.all };
const roles = ['owner', 'admin', 'manager', 'cashier', 'staff'];
const can = (role, perms) => perms.every((p) => rolePerms[role]?.includes(p));

// ── Matriks otomatis ────────────────────────────────────────────────────────
const SKIP_PATH = [/^\/auth\//, /^\/ai\/chat/, /^\/ocr\/scan/];
const routes = extractRoutes().filter((r) => !r.isPublic && !SKIP_PATH.some((re) => re.test(r.path)));
const FAKE_ID = '00000000-0000-4000-8000-000000000000';
let probes = 0;
const wrong = [];
const unguardedMutations = [];

for (const r of routes) {
  if (r.method !== 'GET' && r.perms.length === 0) unguardedMutations.push(`${r.method} ${r.path}`);
  if (r.perms.length === 0) continue;
  const path = r.path.replace(/:[A-Za-z]+/g, FAKE_ID);
  const body = r.method === 'GET' || r.method === 'DELETE' ? undefined : {};
  for (const role of roles) {
    const res = await call(tokens[role], r.method, path, body);
    probes++;
    const allowed = can(role, r.perms);
    if (res.status === 429) wrong.push(`${role} ${r.method} ${r.path}: 429 (jalankan dengan THROTTLE_LIMIT=100000)`);
    else if (allowed && (res.status === 401 || res.status === 403)) wrong.push(`${role} ${r.method} ${r.path}: seharusnya BOLEH (${r.perms}) tapi ${res.status}`);
    else if (!allowed && res.status !== 403) wrong.push(`${role} ${r.method} ${r.path}: seharusnya 403 (butuh ${r.perms}) tapi ${res.status}`);
  }
}
console.log(`Matriks: ${routes.length} rute, ${probes} probe`);
for (const w of wrong) check(w, false);
check('seluruh matriks role x endpoint sesuai ROLE_PERMISSIONS', wrong.length === 0);

// Mutasi tanpa @RequirePermissions = terbuka bagi semua user login. Hanya yang disengaja yang boleh.
const ALLOWED_OPEN = [/^POST \/notifications/, /^POST \/ai\//, /^POST \/hrm\/attendance\/(clock-in|clock-out)/];
const openMut = unguardedMutations.filter((x) => !ALLOWED_OPEN.some((re) => re.test(x)));
for (const x of openMut) console.log(`  WARN mutasi tanpa @RequirePermissions: ${x}`);
check('tidak ada endpoint mutasi tanpa @RequirePermissions (di luar daftar sengaja-terbuka)', openMut.length === 0, openMut.join(', '));

// ── Pembatasan eksplisit sesuai brief ───────────────────────────────────────
for (const role of ['cashier', 'staff']) {
  for (const [method, path] of [
    ['GET', '/finance/entries'],
    ['GET', '/finance/profit-loss'],
    ['GET', '/hrm/employees'],
    ['POST', '/hrm/employees'],
    ['GET', '/hrm/payroll/runs'],
    ['GET', '/journals'],
    ['GET', '/audit/logs'],
    ['GET', '/users'],
    ['POST', '/users'],
    ['GET', '/payables/bills'],
  ]) {
    const r = await call(tokens[role], method, path, method === 'POST' ? {} : undefined);
    check(`${role} ${method} ${path} -> 403`, r.status === 403, String(r.status));
  }
}
const adminFin = await call(tokens.admin, 'GET', '/finance/entries');
check('admin tanpa finance:* -> 403 di /finance/entries', adminFin.status === 403, String(adminFin.status));

// ── approvals:decide ────────────────────────────────────────────────────────
check('manager punya approvals:decide', rolePerms.manager.includes('approvals:decide'));
check('manager TIDAK punya finance:write', !rolePerms.manager.includes('finance:write'));
check('admin/cashier/staff tidak punya approvals:decide', !['admin', 'cashier', 'staff'].some((r) => rolePerms[r].includes('approvals:decide')));

const submit = await call(tokens.owner, 'POST', '/approvals', {
  documentType: 'purchase_order',
  documentId: `po-${Date.now()}`,
  steps: [{ requiredPermission: 'approvals:decide' }],
});
check('owner mengajukan approval', submit.status === 201 && submit.body?.id, JSON.stringify(submit.body)?.slice(0, 160));
const approvalId = submit.body?.id;
if (approvalId) {
  const mgrSubmit = await call(tokens.manager, 'POST', '/approvals', { documentType: 'x', documentId: 'y', steps: [{ requiredPermission: 'approvals:decide' }] });
  check('manager tidak boleh mengajukan approval (finance:write) -> 403', mgrSubmit.status === 403, String(mgrSubmit.status));

  const cashierDecide = await call(tokens.cashier, 'POST', `/approvals/${approvalId}/decide`, { decision: 'approved' });
  check('cashier decide -> 403', cashierDecide.status === 403, String(cashierDecide.status));
  const adminDecide = await call(tokens.admin, 'POST', `/approvals/${approvalId}/decide`, { decision: 'approved' });
  check('admin decide -> 403', adminDecide.status === 403, String(adminDecide.status));

  const selfDecide = await call(tokens.owner, 'POST', `/approvals/${approvalId}/decide`, { decision: 'approved' });
  check('self-approval (pemohon = owner) ditolak 403', selfDecide.status === 403, `${selfDecide.status} ${JSON.stringify(selfDecide.body)}`);
  const still = await call(tokens.owner, 'GET', `/approvals/${approvalId}`);
  check('approval tetap pending setelah percobaan self-approval', still.body?.status === 'pending', JSON.stringify(still.body)?.slice(0, 80));

  const mgrDecide = await call(tokens.manager, 'POST', `/approvals/${approvalId}/decide`, { decision: 'approved' });
  check('manager (bukan pemohon) dapat menyetujui', mgrDecide.status === 201 && mgrDecide.body?.status === 'approved', `${mgrDecide.status} ${JSON.stringify(mgrDecide.body)?.slice(0, 120)}`);
}
const missing = await call(tokens.owner, 'GET', `/approvals/${FAKE_ID}`);
check('GET /approvals/:id yang tidak ada -> 404 (bukan 200 kosong)', missing.status === 404, String(missing.status));
const badStatus = await call(tokens.owner, 'GET', '/approvals?status=bukan-status');
check('GET /approvals?status=sampah -> 400 (bukan 500)', badStatus.status === 400, String(badStatus.status));

// ── Eskalasi hak ────────────────────────────────────────────────────────────
const ownerList = (await call(tokens.owner, 'GET', '/users')).body ?? [];
const ownerUser = ownerList.find((u) => u.role === 'owner');
const staffUser = ownerList.find((u) => u.role === 'staff');
const mkEsc = await call(tokens.admin, 'POST', '/users', { name: 'Eskalasi', email: `esc-${Date.now()}@example.com`, role: 'owner' });
check('admin tidak boleh membuat owner -> 403', mkEsc.status === 403, String(mkEsc.status));
const dis = await call(tokens.admin, 'PATCH', `/users/${ownerUser.id}`, { isActive: false });
check('admin tidak boleh menonaktifkan owner -> 403', dis.status === 403, String(dis.status));
const grant = await call(tokens.admin, 'PATCH', `/users/${staffUser.id}`, { permissions: { 'finance:read': true } });
check('admin tidak boleh memberi izin finance:read yang tidak dimilikinya -> 403', grant.status === 403, String(grant.status));
const selfPromote = await call(tokens.manager, 'PATCH', `/users/${adminId}`, { role: 'owner' });
check('manager (tanpa users:manage) tidak bisa mengubah role -> 403', selfPromote.status === 403, String(selfPromote.status));

// ── Override izin per-user ──────────────────────────────────────────────────
const cashierUser = ownerList.find((u) => u.role === 'cashier');
const before = await call(tokens.cashier, 'GET', '/outlets');
check('cashier awalnya tidak punya outlets:read -> 403', before.status === 403, String(before.status));
const allow = await call(tokens.owner, 'PATCH', `/users/${cashierUser.id}`, { permissions: { 'outlets:read': true } });
check('owner memberi override outlets:read', allow.status === 200, String(allow.status));
const after = await call(tokens.cashier, 'GET', '/outlets');
check('override allow berlaku langsung', after.status === 200, String(after.status));
const deny = await call(tokens.owner, 'PATCH', `/users/${cashierUser.id}`, { permissions: { 'pos:read': false } });
check('owner mencabut pos:read', deny.status === 200, String(deny.status));
const posDenied = await call(tokens.cashier, 'GET', '/sales/transactions');
check('override deny pos:read berlaku -> 403', posDenied.status === 403, String(posDenied.status));
await call(tokens.owner, 'PATCH', `/users/${cashierUser.id}`, { permissions: {} });

// Role di DB berubah -> berlaku di request berikutnya walau JWT lama masih membawa role lama.
const demote = await call(tokens.owner, 'PATCH', `/users/${adminId}`, { role: 'cashier' });
check('owner menurunkan admin -> cashier', demote.status === 200, JSON.stringify(demote.body));
const adminAfter = await call(tokens.admin, 'POST', '/users', { name: 'Pasca', email: `pasca-${Date.now()}@example.com`, role: 'staff' });
check('admin yang sudah diturunkan tidak bisa lagi membuat user (JWT lama, role dari DB) -> 403', adminAfter.status === 403, String(adminAfter.status));

// Pengguna dinonaktifkan: token lama langsung tidak berlaku.
const off = await call(tokens.owner, 'DELETE', `/users/${adminId}`);
check('owner menonaktifkan user', off.status === 200, String(off.status));
const offReq = await call(tokens.admin, 'GET', '/auth/me');
check('token user nonaktif ditolak (401/403)', offReq.status === 401 || offReq.status === 403, String(offReq.status));

done();
