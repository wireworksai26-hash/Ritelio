import { BUSINESSES, SUPERADMIN, ownerEmailOf, staffEmailOf } from './businesses.data';
import { deriveSeedPassword, resolveMasterSecret } from './seed-passwords';

/**
 * Mencetak tabel akun seed dari SEED_MASTER_SECRET saja, tanpa menyentuh database.
 * Kata sandi diturunkan secara deterministik, jadi hasilnya sama dengan yang dipakai seed.
 *
 *   SEED_MASTER_SECRET="..." npm run seed:credentials
 */
export interface CredentialRow {
  business: string;
  role: string;
  email: string;
  password: string;
}

export function credentialRows(secret: string): CredentialRow[] {
  const rows: CredentialRow[] = [];
  for (const b of BUSINESSES) {
    const owner = ownerEmailOf(b);
    rows.push({ business: b.businessName, role: 'owner', email: owner, password: deriveSeedPassword(secret, owner) });
    for (const s of b.staff) {
      const email = staffEmailOf(b, s);
      rows.push({ business: b.businessName, role: s.role, email, password: deriveSeedPassword(secret, email) });
    }
  }
  rows.push({
    business: '(platform)',
    role: 'superadmin',
    email: SUPERADMIN.email,
    password: deriveSeedPassword(secret, SUPERADMIN.email),
  });
  return rows;
}

function main(): void {
  const given = process.env.SEED_MASTER_SECRET?.trim();
  if (!given) {
    console.error('SEED_MASTER_SECRET wajib diisi: kata sandi diturunkan dari nilai ini.');
    process.exit(1);
  }
  const { secret } = resolveMasterSecret(process.env);
  const rows = credentialRows(secret);
  const w = {
    biz: Math.max(...rows.map((r) => r.business.length)),
    role: Math.max(...rows.map((r) => r.role.length)),
    email: Math.max(...rows.map((r) => r.email.length)),
  };
  for (const r of rows) {
    console.log(`${r.business.padEnd(w.biz)}  ${r.role.padEnd(w.role)}  ${r.email.padEnd(w.email)}  ${r.password}`);
  }
}

if (require.main === module) main();
