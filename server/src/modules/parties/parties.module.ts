import { Module } from '@nestjs/common';
import { PartyController } from './parties.controller';
import { PartyService } from './parties.service';

@Module({
  controllers: [PartyController],
  providers: [PartyService],
  exports: [PartyService],
})
export class PartiesModule {}