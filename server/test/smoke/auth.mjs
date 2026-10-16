// Uji autentikasi terhadap API yang SUDAH berjalan: kontrak login, rotasi refresh token,
// reuse detection, logout/logout-all, brute force, kebijakan kata sandi, akun tanpa hash
// valid, akun nonaktif, dan 2FA.
//
//   API_URL=http://localhost:4013/v1 node test/smoke/auth.mjs
//
// DATABASE_URL (bila ada) dipakai untuk uji akun '!pending-invite' lewat insert langsung,
// meniru HrmModule.hire({ createUser: true }).
import { authenticator } from 'otplib';
import { API, call, check, done } from './lib.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Throttle login 20/menit/IP: sebarkan panggilan login agar tidak menabrak batas itu
// kecuali pada uji brute force yang memang sengaja menabraknya.
const stamps = [];
const LOGIN_BUDGET = 16;
async function budget() {
  const now = Date.now();
  while (stamps.length && now - stamps[0] > 60_000) stamps.shift();
  if (stamps.length >= LOGIN_BUDGET) {
    await sleep(60_500 - (now - stamps[0]));
    return budget();
  }
  stamps.push(Date.now());
}
async function freshWindow() {
  if (stamps.length) await sleep(Math.max(0, 61_000 - (Date.now() - stamps[stamps.length - 1])));
  stamps.length = 0;
}
async function loginCall(body) {
  await budget();
  return call(null, 'POST', '/auth/login', body);
}
// Register dibatasi 5/menit/IP.
const regStamps = [];
async function registerCall(body) {
  const now = Date.now();
  while (regStamps.length && now - regStamps[0] > 60_000) regStamps.shift();
  if (regStamps.length >= 4) {
    await sleep(60_500 - (now - regStamps[0]));
    return registerCall(body);
  }
  regStamps.push(Date.now());
  return call(null, 'POST', '/auth/register', body);
}
const refreshCall = (refreshToken) => call(null, 'POST', '/auth/refresh', { refreshToken });

const stamp = Date.now();
const PASSWORD = 'Uji-Autentikasi-2026x';

// ── Register & kebijakan kata sandi ─────────────────────────────────────────
for (const [label, pw] of [
  ['admin123', 'admin123'],
  ['tanpa huruf besar', 'sandikuat2026'],
  ['tanpa angka', 'SandiKuatSekali'],
  ['terlalu pendek', 'Ab1'],
  ['lebih dari 72 byte', 'Aa1' + 'x'.repeat(80)],
]) {
  const r = await registerCall({
    businessName: 'Uji Sandi', industryTemplate: 'retail', ownerName: 'Uji', email: `pw-${stamp}@example.com`, password: pw,
  });
  check(`register menolak kata sandi lemah (${label}) -> 400`, r.status === 400, String(r.status));
}

const email = `auth-${stamp}@example.com`;
const reg = await registerCall({
  businessName: `Uji Auth ${stamp}`, industryTemplate: 'retail', ownerName: 'Uji Auth', email, password: PASSWORD,
});
check('register sukses mengembalikan accessToken+refreshToken+user', reg.status === 201 && reg.body?.accessToken && reg.body?.refreshToken && reg.body?.user?.email === email, JSON.stringify(reg.body)?.slice(0, 120));

// ── Kontrak login ───────────────────────────────────────────────────────────
const l1 = await loginCall({ email, password: PASSWORD });
check('login sukses 200 dengan bentuk respons lama', l1.status === 200 && typeof l1.body.accessToken === 'string' && typeof l1.body.refreshToken === 'string'
  && l1.body.user?.id && l1.body.user?.tenantId && l1.body.user?.role === 'owner' && l1.body.user?.tenantName && l1.body.user?.plan, JSON.stringify(l1.body)?.slice(0, 150));
check('refresh token buram (bukan JWT) dan panjang', !l1.body.refreshToken.includes('.') && l1.body.refreshToken.length >= 60);

const me = await call(l1.body.accessToken, 'GET', '/auth/me');
check('access token bekerja di /auth/me', me.status === 200 && me.body?.email === email, String(me.status));
const asRefresh = await call(l1.body.refreshToken, 'GET', '/auth/me');
check('refresh token tidak bisa dipakai sebagai access token', asRefresh.status === 401, String(asRefresh.status));

// ── Pesan error tidak membocorkan keberadaan email ──────────────────────────
const wrongPw = await loginCall({ email, password: 'Salah-Sandi-2026' });
const noUser = await loginCall({ email: `tidak-ada-${stamp}@example.com`, password: 'Salah-Sandi-2026' });
check('sandi salah -> 401', wrongPw.status === 401, String(wrongPw.status));
check('email tak terdaftar -> 401 dengan pesan identik', noUser.status === 401 && noUser.body?.message === wrongPw.body?.message, `${noUser.status} ${noUser.body?.message} vs ${wrongPw.body?.message}`);
const inactiveLike = await loginCall({ email, password: '' });
check('sandi kosong -> 400 (validasi)', inactiveLike.status === 400, String(inactiveLike.status));

// ── Rotasi refresh token ────────────────────────────────────────────────────
const r1 = l1.body.refreshToken;
const rot1 = await refreshCall(r1);
check('refresh pertama sukses dan menerbitkan token baru', rot1.status === 200 && rot1.body?.refreshToken && rot1.body.refreshToken !== r1 && rot1.body?.accessToken, `${rot1.status} ${JSON.stringify(rot1.body)?.slice(0, 100)}`);
check('respons refresh berbentuk sama dengan login (user.*)', rot1.body?.user?.email === email && rot1.body?.user?.tenantName);
const r2 = rot1.body.refreshToken;
const rot2 = await refreshCall(r2);
check('token hasil rotasi bisa dirotasi lagi', rot2.status === 200 && rot2.body.refreshToken !== r2, String(rot2.status));
const r3 = rot2.body.refreshToken;

// Reuse: r1 sudah terpakai -> tolak DAN cabut seluruh family (r3 yang sah ikut mati).
const reuse = await refreshCall(r1);
check('pemakaian ulang token lama -> 401', reuse.status === 401, String(reuse.status));
const afterReuse = await refreshCall(r3);
check('reuse mencabut seluruh family: token terbaru ikut tidak berlaku', afterReuse.status === 401, String(afterReuse.status));

// Sesi lain milik user yang sama tidak terdampak oleh reuse di family lain.
const other = await loginCall({ email, password: PASSWORD });
const otherRefresh = await refreshCall(other.body.refreshToken);
check('family lain tidak terpengaruh reuse', otherRefresh.status === 200, String(otherRefresh.status));

// Balapan: dua refresh bersamaan dengan token yang sama -> paling banyak satu menang.
const raceStart = await loginCall({ email, password: PASSWORD });
const [ra, rb] = await Promise.all([refreshCall(raceStart.body.refreshToken), refreshCall(raceStart.body.refreshToken)]);
check('dua refresh paralel dengan token sama: tidak boleh keduanya sukses', !(ra.status === 200 && rb.status === 200), `${ra.status}/${rb.status}`);

// Sampah
for (const bad of ['', 'bukan-token', 'a'.repeat(100), 'x.y.z']) {
  const r = await refreshCall(bad);
  check(`refresh dengan token sampah (${bad.slice(0, 12) || 'kosong'}) -> 400/401`, r.status === 401 || r.status === 400, String(r.status));
}

// ── Logout & logout-all ─────────────────────────────────────────────────────
const s1 = await loginCall({ email, password: PASSWORD });
const lo = await call(null, 'POST', '/auth/logout', { refreshToken: s1.body.refreshToken });
check('logout (tanpa access token) -> 200', lo.status === 200, String(lo.status));
const afterLogout = await refreshCall(s1.body.refreshToken);
check('refresh setelah logout -> 401', afterLogout.status === 401, String(afterLogout.status));
const loBogus = await call(null, 'POST', '/auth/logout', { refreshToken: 'tidak-dikenal-sama-sekali' });
check('logout token tak dikenal tetap 200 (idempoten, tidak membocorkan)', loBogus.status === 200, String(loBogus.status));

const a = await loginCall({ email, password: PASSWORD });
const b = await loginCall({ email, password: PASSWORD });
await sleep(1100); // iat berresolusi detik
const all = await call(a.body.accessToken, 'POST', '/auth/logout-all');
check('logout-all -> 200', all.status === 200, String(all.status));
check('logout-all: refresh token sesi A mati', (await refreshCall(a.body.refreshToken)).status === 401);
check('logout-all: refresh token sesi B mati', (await refreshCall(b.body.refreshToken)).status === 401);
const oldAccess = await call(b.body.accessToken, 'GET', '/auth/me');
check('logout-all: access token lama ditolak segera (401)', oldAccess.status === 401, String(oldAccess.status));
const reLogin = await loginCall({ email, password: PASSWORD });
check('login ulang setelah logout-all bekerja', reLogin.status === 200 && (await call(reLogin.body.accessToken, 'GET', '/auth/me')).status === 200);

// ── Akun nonaktif tidak bisa refresh ────────────────────────────────────────
{
  const ownerTok = reLogin.body.accessToken;
  const invEmail = `staf-${stamp}@example.com`;
  const mk = await call(ownerTok, 'POST', '/users', { name: 'Staf Uji', email: invEmail, role: 'staff' });
  check('owner membuat user staff', mk.status === 201 && mk.body?.temporaryPassword, String(mk.status));
  const staff = await loginCall({ email: invEmail, password: mk.body.temporaryPassword });
  check('user baru bisa login', staff.status === 200, String(staff.status));
  const off = await call(ownerTok, 'DELETE', `/users/${mk.body.user.id}`);
  check('owner menonaktifkan user', off.status === 200, String(off.status));
  check('refresh user nonaktif -> 401', (await refreshCall(staff.body.refreshToken)).status === 401);
  check('login user nonaktif -> 401 dengan pesan generik', (await loginCall({ email: invEmail, password: mk.body.temporaryPassword })).status === 401);
}

// ── Akun tanpa hash valid ('!pending-invite') tidak bisa login ──────────────
if (process.env.DATABASE_URL) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const tenantUser = await prisma.user.findFirstOrThrow({ where: { email } });
    const staffRole = await prisma.accessRole.findFirstOrThrow({ where: { tenantId: tenantUser.tenantId, key: 'staff' } });
    for (const [i, hash] of ['!pending-invite', '', '!'].entries()) {
      const pendingEmail = `pending-${stamp}-${i}@example.com`;
      await prisma.user.create({
        data: { tenantId: tenantUser.tenantId, name: 'Pending', email: pendingEmail, passwordHash: hash, role: 'staff', roleId: staffRole.id },
      });
      for (const attempt of [hash || 'x', '!pending-invite', PASSWORD]) {
        const r = await loginCall({ email: pendingEmail, password: attempt });
        check(`akun dengan passwordHash ${JSON.stringify(hash)} tidak bisa login (sandi ${JSON.stringify(attempt).slice(0, 18)})`, r.status === 401 && !r.body?.accessToken, String(r.status));
      }
    }
  } finally {
    await prisma.$disconnect();
  }
} else {
  console.log("  (lewati uji '!pending-invite' via DB: DATABASE_URL tidak diset; ada di auth.service.spec.ts)");
}

// ── 2FA: refresh tidak boleh melewati OTP ───────────────────────────────────
{
  const e2 = `mfa-${stamp}@example.com`;
  const r = await registerCall({ businessName: `MFA ${stamp}`, industryTemplate: 'retail', ownerName: 'MFA', email: e2, password: PASSWORD });
  const tok = r.body.accessToken;
  const oldRefresh = r.body.refreshToken; // sesi dibuka SEBELUM 2FA aktif
  const setup = await call(tok, 'POST', '/auth/2fa/setup', { password: PASSWORD, code: '000000' });
  check('2FA setup', setup.status === 201 && setup.body?.secret, String(setup.status));
  const enable = await call(tok, 'POST', '/auth/2fa/enable', { password: PASSWORD, code: authenticator.generate(setup.body.secret) });
  check('2FA enable', enable.status === 201 && enable.body?.enabled === true, `${enable.status} ${JSON.stringify(enable.body)}`);
  check('sesi lama (tanpa OTP) tidak bisa diperpanjang setelah 2FA aktif', (await refreshCall(oldRefresh)).status === 401);
  const noOtp = await loginCall({ email: e2, password: PASSWORD });
  check('login tanpa OTP -> 401', noOtp.status === 401 && !noOtp.body?.accessToken, String(noOtp.status));
  const badOtp = await loginCall({ email: e2, password: PASSWORD, otp: '000000' });
  check('login dengan OTP salah -> 401', badOtp.status === 401, String(badOtp.status));
  const goodOtp = await loginCall({ email: e2, password: PASSWORD, otp: authenticator.generate(setup.body.secret) });
  check('login dengan OTP benar -> 200', goodOtp.status === 200, String(goodOtp.status));
  const mfaRefresh = await refreshCall(goodOtp.body.refreshToken);
  check('sesi yang dibuka dengan OTP dapat di-refresh (tanpa login ulang tiap 15 menit)', mfaRefresh.status === 200, String(mfaRefresh.status));
}

// ── Brute force ─────────────────────────────────────────────────────────────
await freshWindow();
{
  const victim = `brute-${stamp}@example.com`;
  const bruteReg = await registerCall({ businessName: `Brute ${stamp}`, industryTemplate: 'retail', ownerName: 'Brute', email: victim, password: PASSWORD });
  check('akun korban brute force terdaftar', bruteReg.status === 201, String(bruteReg.status));

  const statuses = [];
  let lockedMsg;
  for (let i = 0; i < 20; i++) {
    const r = await call(null, 'POST', '/auth/login', { email: victim, password: `Tebakan-Salah-${i}x` });
    statuses.push(r.status);
    if (r.status === 429) lockedMsg ??= r.body;
  }
  check('20 percobaan salah beruntun: 5 pertama 401', statuses.slice(0, 5).every((s) => s === 401), statuses.join(','));
  check('20 percobaan salah beruntun: sisanya semua 429 (terkunci)', statuses.slice(5).every((s) => s === 429), statuses.join(','));
  const correct = await call(null, 'POST', '/auth/login', { email: victim, password: PASSWORD });
  check('sandi BENAR pun ditolak 429 saat terkunci', correct.status === 429 && !correct.body?.accessToken, String(correct.status));
  check('respons 429 tidak berisi token dan memuat pesan generik', typeof lockedMsg?.message === 'string' && !lockedMsg?.accessToken, JSON.stringify(lockedMsg));

  // 20+ request tadi juga menghabiskan throttle burst per-IP (20/menit); tunggu jendela baru.
  await sleep(61_000);
  stamps.length = 0;

  // Email yang tidak terdaftar harus berperilaku sama (tidak bisa dipakai membedakan akun).
  const ghost = `hantu-${stamp}@example.com`;
  const ghostStatuses = [];
  for (let i = 0; i < 8; i++) ghostStatuses.push((await call(null, 'POST', '/auth/login', { email: ghost, password: `Tebakan-Salah-${i}x` })).status);
  check('email tak terdaftar: pola 401 x5 lalu 429 identik dengan akun asli', ghostStatuses.slice(0, 5).every((s) => s === 401) && ghostStatuses.slice(5).every((s) => s === 429), ghostStatuses.join(','));

  // Kunci per akun+IP: akun lain dari IP yang sama tidak terkunci.
  const bystander = await call(null, 'POST', '/auth/login', { email, password: PASSWORD });
  check('akun lain dari IP yang sama tetap bisa login', bystander.status === 200, String(bystander.status));
}

// ── Throttle endpoint publik lain ───────────────────────────────────────────
await freshWindow();
{
  await sleep(Math.max(0, 61_000 - (Date.now() - (regStamps.at(-1) ?? 0))));
  const codes = [];
  for (let i = 0; i < 8; i++) {
    codes.push((await call(null, 'POST', '/auth/register', { businessName: 'x', industryTemplate: 'retail', ownerName: 'x', email: `burst-${stamp}-${i}@example.com`, password: 'lemah' })).status);
  }
  check('register dibatasi per IP (429 muncul setelah beberapa percobaan)', codes.includes(429), codes.join(','));
}

console.log(`\n(API ${API})`);
done();
