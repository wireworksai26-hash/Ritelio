import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { AssetsService } from './assets.service';
import { CreateAssetDto, DisposeAssetDto, RunDepreciationDto } from './dto/asset.dto';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @RequirePermissions('finance:read')
  list(@Tenant() tenantId: string) {
    return this.assets.list(tenantId);
  }

  @Get(':id')
  @RequirePermissions('finance:read')
  get(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.assets.get(tenantId, id);
  }

  // Perlsx aset tetap (otomatis jurnal Dr Aset / Cr Kas)
  @Post()
  @RequirePermissions('finance:write')
  create(@Tenant() tenantId: string, @Body() dto: CreateAssetDto) {
    return this.assets.create(tenantId, dto);
  }

  // Jalankan penyusutan satu periode (idempoten)
  @Post('depreciation/run')
  @RequirePermissions('finance:write')
  runDepreciation(@Tenant() tenantId: string, @Body() dto: RunDepreciationDto) {
    return this.assets.runDepreciation(tenantId, dto);
  }

  // Penghapusan aset (otomatis jurnal hasil jual & hapus aset)
  @Post(':id/dispose')
  @RequirePermissions('finance:write')
  dispose(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: DisposeAssetDto,
  ) {
    return this.assets.dispose(tenantId, id, dto);
  }
}