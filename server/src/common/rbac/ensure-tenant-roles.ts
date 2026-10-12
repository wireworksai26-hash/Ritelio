import type { Prisma } from '@prisma/client';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, ROLE_RANK, type Permission } from './permissions';

type RoleClient = Pick<Prisma.TransactionClient, 'permission' | 'accessRole' | 'rolePermission'>;

const ROLE_NAMES: Record<string, string> = {
  superadmin: 'Superadmin',
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  cashier: 'Kasir',
  staff: 'Staf',
};

/** Seed permission catalog and tenant-specific role templates idempotently. */
export async function ensureTenantRoles(db: RoleClient, tenantId: string): Promise<Record<string, string>> {
  for (const key of ALL_PERMISSIONS) {
    const [module, action] = key.split(':');
    await db.permission.upsert({
      where: { key },
      update: {},
      create: { key, module, action, description: `${module} ${action}` },
    });
  }

  const roleIds: Record<string, string> = {};
  for (const [key, rank] of Object.entries(ROLE_RANK)) {
    const role = await db.accessRole.upsert({
      where: { tenantId_key: { tenantId, key } },
      update: { name: ROLE_NAMES[key] ?? key, rank, isSystem: true },
      create: { tenantId, key, name: ROLE_NAMES[key] ?? key, rank, isSystem: true },
      select: { id: true },
    });
    roleIds[key] = role.id;

    const configured = ROLE_PERMISSIONS[key] ?? [];
    const allowed: Permission[] = key === 'owner' || key === 'superadmin' || configured.includes('*' as never)
      ? ALL_PERMISSIONS
      : configured;
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (allowed.length > 0) {
      await db.rolePermission.createMany({
        data: allowed.map((permissionKey) => ({ roleId: role.id, permissionKey, effect: 'allow' })),
        skipDuplicates: true,
      });
    }
  }
  return roleIds;
}
