import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../rbac/permissions';

export const PERMISSIONS_KEY = 'requiredPermissions';
/** Wajibkan izin RBAC pada route. Contoh: @RequirePermissions('inventory:write') */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
