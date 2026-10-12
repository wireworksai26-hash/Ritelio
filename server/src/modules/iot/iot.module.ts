import { Module } from '@nestjs/common';
import { IotService } from './iot.service';

/** Sengaja tanpa controller: endpoint IoT dilayani CapabilitiesController. */
@Module({
  providers: [IotService],
  exports: [IotService],
})
export class IotModule {}