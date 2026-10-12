import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockOpService } from './stock-op.service';

@Module({
  imports: [AccountingModule],
  controllers: [InventoryController],
  providers: [InventoryService, StockOpService],
  exports: [InventoryService, StockOpService],
})
export class InventoryModule {}
