import { describe, expect, it } from 'vitest';
import { canAssignRole, roleHasPermission, sanitizePermissionOverrides } from './permissions';

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
