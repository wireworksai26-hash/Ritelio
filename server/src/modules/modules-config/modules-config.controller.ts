import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { CreateCustomFieldDto, UpdateModuleConfigDto } from './dto/module-config.dto';
import { ModulesConfigService } from './modules-config.service';

@Controller('modules')
export class ModulesConfigController {
  constructor(private readonly modulesConfig: ModulesConfigService) {}

  // Semua role butuh daftar modul aktif untuk render navigasi — tanpa permission khusus.
  @Get()
  list(@Tenant() tenantId: string) {
    return this.modulesConfig.list(tenantId);
  }

  @Patch(':key')
  @RequirePermissions('settings:write')
  setActive(
    @Tenant() tenantId: string,
    @Param('key') key: string,
    @Body() dto: UpdateModuleConfigDto,
  ) {
    return this.modulesConfig.setActive(tenantId, key, dto.isActive);
  }

  // Daftar field kustom dibaca semua role yang merender form — tanpa permission khusus.
  @Get(':key/custom-fields')
  getCustomFields(@Tenant() tenantId: string, @Param('key') key: string) {
    return this.modulesConfig.getCustomFields(tenantId, key);
  }

  @Post(':key/custom-fields')
  @RequirePermissions('settings:write')
  addCustomField(
    @Tenant() tenantId: string,
    @Param('key') key: string,
    @Body() dto: CreateCustomFieldDto,
  ) {
    return this.modulesConfig.addCustomField(tenantId, key, dto);
  }

  @Delete(':key/custom-fields/:fieldId')
  @RequirePermissions('settings:write')
  removeCustomField(
    @Tenant() tenantId: string,
    @Param('key') key: string,
    @Param('fieldId') fieldId: string,
  ) {
    return this.modulesConfig.removeCustomField(tenantId, key, fieldId);
  }
}
