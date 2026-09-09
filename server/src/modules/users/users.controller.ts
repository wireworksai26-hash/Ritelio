import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS } from '../../common/rbac/permissions';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users:manage')
  list(@Tenant() tenantId: string) {
    return this.users.list(tenantId);
  }

  // Matriks izin untuk UI manajemen user.
  // PENTING: dideklarasikan SEBELUM route ':id' agar tidak tertangkap sebagai id.
  @Get('permissions/matrix')
  @RequirePermissions('users:manage')
  permissionMatrix() {
    return { all: ALL_PERMISSIONS, byRole: ROLE_PERMISSIONS };
  }

  @Post()
  @RequirePermissions('users:manage')
  create(@Tenant() tenantId: string, @Body() dto: CreateUserDto) {
    return this.users.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions('users:manage')
  update(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('users:manage')
  remove(@Tenant() tenantId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.users.remove(tenantId, id, user);
  }
}
