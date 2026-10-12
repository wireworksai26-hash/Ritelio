import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
// PENTING: DTO di-import sebagai nilai (bukan `import type`).
// Nest membaca `design:paramtypes` dari decorator untuk menentukan kelas DTO
// pada @Body/@Query. `import type` membuat metadata itu hilang, sehingga
// ValidationPipe melewati request tanpa validasi apa pun.
import {
  AdjustStockDto,
  CreateCategoryDto,
  CreateProductDto,
  CreateWarehouseDto,
  MovementQueryDto,
  ProductLookupQueryDto,
  ProductQueryDto,
  StockQueryDto,
  ListWarehouseQueryDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateWarehouseDto,
} from './dto/inventory.dto';
import {
  CloseStockOpDto,
  CountStockOpLinesDto,
  CreateStockOpDto,
  ListStockOpQueryDto,
} from './dto/stock-op.dto';
import { InventoryService } from './inventory.service';
import { StockOpService } from './stock-op.service';

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly stockOps: StockOpService,
  ) {}

  // ============================== PRODUK ==============================

  @Get('products')
  @RequirePermissions('inventory:read')
  listProducts(@Tenant() tenantId: string, @Query() query: ProductQueryDto) {
    return this.inventory.listProducts(tenantId, query);
  }

  @Post('products')
  @RequirePermissions('inventory:write')
  createProduct(@Tenant() tenantId: string, @CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.inventory.createProduct(tenantId, dto, user.sub);
  }

  // PENTING: route statis 'products/lookup' harus sebelum 'products/:id'
  @Get('products/lookup')
  @RequirePermissions('inventory:read')
  lookupProduct(@Tenant() tenantId: string, @Query() query: ProductLookupQueryDto) {
    return this.inventory.lookupProduct(tenantId, query);
  }

  @Get('products/:id')
  @RequirePermissions('inventory:read')
  getProduct(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.inventory.getProduct(tenantId, id);
  }

  @Patch('products/:id')
  @RequirePermissions('inventory:write')
  updateProduct(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.inventory.updateProduct(tenantId, id, dto);
  }

  @Delete('products/:id')
  @RequirePermissions('inventory:write')
  removeProduct(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.inventory.removeProduct(tenantId, id);
  }

  // ============================== KATEGORI ==============================

  @Get('categories')
  @RequirePermissions('inventory:read')
  listCategories(@Tenant() tenantId: string) {
    return this.inventory.listCategories(tenantId);
  }

  @Post('categories')
  @RequirePermissions('inventory:write')
  createCategory(@Tenant() tenantId: string, @Body() dto: CreateCategoryDto) {
    return this.inventory.createCategory(tenantId, dto);
  }

  @Patch('categories/:id')
  @RequirePermissions('inventory:write')
  updateCategory(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.inventory.updateCategory(tenantId, id, dto);
  }

  @Delete('categories/:id')
  @RequirePermissions('inventory:write')
  removeCategory(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.inventory.removeCategory(tenantId, id);
  }

  // ============================== GUDANG ==============================

  @Get('warehouses')
  @RequirePermissions('inventory:read')
  listWarehouses(@Tenant() tenantId: string, @Query() query: ListWarehouseQueryDto) {
    return this.inventory.listWarehouses(tenantId, query.isActive);
  }

  @Post('warehouses')
  @RequirePermissions('inventory:write')
  createWarehouse(@Tenant() tenantId: string, @Body() dto: CreateWarehouseDto) {
    return this.inventory.createWarehouse(tenantId, dto);
  }

  @Patch('warehouses/:id')
  @RequirePermissions('inventory:write')
  updateWarehouse(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.inventory.updateWarehouse(tenantId, id, dto);
  }

  // ============================== STOK ==============================

  // Route 'stock/low' dideklarasikan sebelum 'stock' agar tidak tertangkap param lain
  @Get('stock/low')
  @RequirePermissions('inventory:read')
  lowStock(@Tenant() tenantId: string) {
    return this.inventory.lowStock(tenantId);
  }

  @Get('stock')
  @RequirePermissions('inventory:read')
  listStock(@Tenant() tenantId: string, @Query() query: StockQueryDto) {
    return this.inventory.listStock(tenantId, query);
  }

  @Post('stock/adjust')
  @RequirePermissions('inventory:write')
  adjustStock(@Tenant() tenantId: string, @CurrentUser() user: AuthUser, @Body() dto: AdjustStockDto) {
    return this.inventory.adjustStock(tenantId, dto, user.sub);
  }

  // ============================== STOCK OP (opening/closing) ==============================

  @Get('stock-ops')
  @RequirePermissions('inventory:read')
  listStockOps(@Tenant() tenantId: string, @Query() query: ListStockOpQueryDto) {
    return this.stockOps.list(tenantId, query);
  }

  @Post('stock-ops')
  @RequirePermissions('inventory:write')
  openStockOp(@Tenant() tenantId: string, @Body() dto: CreateStockOpDto) {
    return this.stockOps.open(tenantId, dto);
  }

  @Get('stock-ops/:id')
  @RequirePermissions('inventory:read')
  getStockOp(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.stockOps.get(tenantId, id);
  }

  @Post('stock-ops/:id/count')
  @RequirePermissions('inventory:write')
  countStockOp(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CountStockOpLinesDto,
  ) {
    return this.stockOps.countLines(tenantId, id, dto.lines);
  }

  @Post('stock-ops/:id/close')
  @RequirePermissions('inventory:write')
  closeStockOp(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CloseStockOpDto,
  ) {
    return this.stockOps.close(tenantId, id, dto, user.sub);
  }

  // ============================== PERGERAKAN STOK ==============================

  @Get('movements')
  @RequirePermissions('inventory:read')
  listMovements(@Tenant() tenantId: string, @Query() query: MovementQueryDto) {
    return this.inventory.listMovements(tenantId, query);
  }
}
