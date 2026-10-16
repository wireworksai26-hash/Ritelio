import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Role } from '../../types';
import {
  NAV_ITEMS,
  activeGroupKey,
  groupNav,
  isCollapsibleGroup,
  isNavItemActive,
  navForRole,
  rolesForPath,
  splitForBottomNav,
} from './nav';
import { isGroupOpen } from '../../stores/navStore';

const everything = () => true;
const ROLES: Role[] = ['superadmin', 'owner', 'admin', 'manager', 'cashier', 'staff'];
const byTo = (to: string) => NAV_ITEMS.find((i) => i.to === to)!;

describe('splitForBottomNav', () => {
  it('role dengan <=5 menu menampilkan semuanya tanpa tombol Menu', () => {
    const items = navForRole('cashier', everything);
    expect(items.length).toBeLessThanOrEqual(5);
    expect(splitForBottomNav(items)).toEqual({ primary: items, hasMore: false });
  });

  it('role dengan banyak menu: maksimal 4 slot + tombol Menu', () => {
    const items = navForRole('owner', everything);
    expect(items.length).toBeGreaterThan(5);
    const { primary, hasMore } = splitForBottomNav(items);
    expect(hasMore).toBe(true);
    expect(primary.length).toBeLessThanOrEqual(4);
    expect(primary.every((i) => i.pin)).toBe(true);
  });

  it('setiap role tetap punya minimal satu menu', () => {
    for (const role of ROLES) expect(navForRole(role, everything).length).toBeGreaterThan(0);
  });
});

describe('akses per role', () => {
  it('kasir hanya POS + notifikasi, tanpa modul keuangan/SDM', () => {
    const paths = navForRole('cashier', everything).map((i) => i.to);
    expect(paths).toEqual(['/app/pos', '/app/notifications']);
  });

  it('modul keuangan tidak terlihat oleh manager/staff', () => {
    for (const role of ['manager', 'staff'] as Role[]) {
      const paths = navForRole(role, everything).map((i) => i.to);
      expect(paths).not.toContain('/app/accounting');
      expect(paths).not.toContain('/app/banking');
    }
  });

  it('rolesForPath selalu menyertakan superadmin dan sesuai menu', () => {
    expect(rolesForPath('/app/accounting')).toContain('superadmin');
    expect(rolesForPath('/app/accounting')).toContain('owner');
    expect(rolesForPath('/app/accounting')).not.toContain('cashier');
    expect(rolesForPath('/app/tidak-ada')).toEqual(['superadmin']);
  });

  it('modul yang dimatikan tidak muncul di menu', () => {
    const off = (key: string) => key !== 'finance';
    expect(navForRole('owner', off).map((i) => i.to)).not.toContain('/app/finance');
  });
});

describe('dropdown grup menu', () => {
  it('semua item punya group dan setiap item muncul tepat sekali di groupNav', () => {
    const items = navForRole('owner', everything);
    const grouped = groupNav(items).flatMap((g) => g.items.map((i) => i.to));
    expect(grouped.sort()).toEqual(items.map((i) => i.to).sort());
  });

  it('grup "utama" dan grup satu item tidak bisa dilipat', () => {
    expect(isCollapsibleGroup('utama', 5)).toBe(false);
    expect(isCollapsibleGroup('keuangan', 1)).toBe(false);
    expect(isCollapsibleGroup('keuangan', 2)).toBe(true);
  });

  it('item aktif: end=true cocok persis, selain itu cocok awalan segmen (bukan awalan kata)', () => {
    expect(isNavItemActive(byTo('/app'), '/app')).toBe(true);
    expect(isNavItemActive(byTo('/app'), '/app/crm')).toBe(false);
    expect(isNavItemActive(byTo('/app/crm'), '/app/crm/leads')).toBe(true);
    expect(isNavItemActive(byTo('/app/crm'), '/app/crmx')).toBe(false);
  });

  it('activeGroupKey menunjuk grup halaman aktif', () => {
    const items = navForRole('owner', everything);
    expect(activeGroupKey(items, '/app/banking')).toBe('keuangan');
    expect(activeGroupKey(items, '/app/procurement')).toBe('gudang');
    expect(activeGroupKey(items, '/nowhere')).toBeUndefined();
  });

  it('isGroupOpen: pilihan pengguna menang atas default, default = grup aktif', () => {
    expect(isGroupOpen({}, 'keuangan', 'keuangan')).toBe(true);
    expect(isGroupOpen({}, 'sdm', 'keuangan')).toBe(false);
    expect(isGroupOpen({ keuangan: false }, 'keuangan', 'keuangan')).toBe(false);
    expect(isGroupOpen({ sdm: true }, 'sdm', 'keuangan')).toBe(true);
  });
});

describe('konsistensi rute dan menu', () => {
  it('setiap rute <Guarded path="..."> di App.tsx punya entri menu (guard role tidak jatuh ke superadmin saja)', () => {
    const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
    const guarded = [...app.matchAll(/<Guarded path="([^"]+)"/g)].map((m) => m[1]);
    expect(guarded.length).toBeGreaterThan(10);
    const missing = guarded.filter((p) => !NAV_ITEMS.some((i) => i.to === p));
    expect(missing).toEqual([]);
  });

  it('setiap entri menu punya rute di App.tsx', () => {
    const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
    const routed = new Set([...app.matchAll(/<Guarded path="([^"]+)"/g)].map((m) => m[1]));
    routed.add('/app'); // index route
    const orphans = NAV_ITEMS.map((i) => i.to).filter((to) => !routed.has(to));
    expect(orphans).toEqual([]);
  });
});
