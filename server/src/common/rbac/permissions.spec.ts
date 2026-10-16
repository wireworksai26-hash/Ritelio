import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, canAssignRole, roleHasPermission, sanitizePermissionOverrides } from './permissions';

describe('database RBAC helpers', () => {
  it('keeps role hierarchy from granting an equal or higher role to managed users', () => {
    expect(canAssignRole('admin', 'owner')).toBe(false);
    expect(canAssignRole('manager', 'cashier')).toBe(true);
  });

  it('applies deny overrides before role permissions', () => {
    expect(roleHasPermission('owner', { 'finance:write': false }, 'finance:write')).toBe(false);
    expect(roleHasPermission('cashier', {}, 'pos:write')).toBe(true);
    expect(roleHasPermission('cashier', {}, 'finance:read')).toBe(false);
  });

  it('drops unknown keys and non-boolean override values', () => {
    expect(sanitizePermissionOverrides({ 'pos:read': true, all: true, 'finance:read': 'yes' })).toEqual({
      'pos:read': true,
    });
  });
});

describe('approvals:decide', () => {
  it('ada di katalog izin dan diberikan ke manager serta owner', () => {
    expect(ALL_PERMISSIONS).toContain('approvals:decide');
    expect(roleHasPermission('manager', {}, 'approvals:decide')).toBe(true);
    expect(roleHasPermission('owner', {}, 'approvals:decide')).toBe(true);
  });

  it('manager tidak mendapat finance:write sebagai gantinya', () => {
    expect(roleHasPermission('manager', {}, 'finance:write')).toBe(false);
    expect(ROLE_PERMISSIONS.manager).not.toContain('finance:write');
  });

  it('cashier, staff, dan admin tidak boleh memutuskan approval', () => {
    for (const role of ['cashier', 'staff', 'admin']) {
      expect(roleHasPermission(role, {}, 'approvals:decide'), role).toBe(false);
    }
  });

  it('override deny mencabut izin dari manager', () => {
    expect(roleHasPermission('manager', { 'approvals:decide': false }, 'approvals:decide')).toBe(false);
  });
});
