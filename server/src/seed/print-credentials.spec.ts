import { describe, expect, it } from 'vitest';
import { BUSINESSES } from './businesses.data';
import { credentialRows } from './print-credentials';
import { deriveSeedPassword } from './seed-passwords';

const MASTER = 'kunci-induk-untuk-tes-ini-123';

describe('credentialRows', () => {
  it('mencakup semua akun: owner + staf tiap usaha + superadmin', () => {
    const expected = BUSINESSES.reduce((n, b) => n + 1 + b.staff.length, 0) + 1;
    expect(credentialRows(MASTER)).toHaveLength(expected);
  });

  it('kata sandi persis sama dengan yang diturunkan seed untuk email yang sama', () => {
    for (const r of credentialRows(MASTER)) expect(r.password).toBe(deriveSeedPassword(MASTER, r.email));
  });

  it('kunci induk berbeda menghasilkan kata sandi berbeda untuk semua akun', () => {
    const a = credentialRows(MASTER);
    const b = credentialRows('kunci-induk-lain-yang-juga-panjang');
    a.forEach((r, i) => expect(r.password).not.toBe(b[i].password));
  });
});
