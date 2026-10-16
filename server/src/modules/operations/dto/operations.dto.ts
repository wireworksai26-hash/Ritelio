import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @Length(2, 32)
  code!: string;

  @IsString()
  @Length(2, 160)
  name!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  budget?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;
}

export class AddMilestoneDto {
  @IsString()
  @Length(2, 160)
  name!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class CreateTimesheetDto {
  @IsString()
  projectId!: string;

  @IsString()
  employeeId!: string;

  @IsDateString()
  workDate!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.25, { message: 'Jam kerja minimal 0.25.' })
  @Max(24)
  hours!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  hourlyRate?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  billable?: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;
}

export class ShipmentItemDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999_999_999.999)
  qty!: number;
}

export class CreateShipmentDto {
  @IsOptional()
  @IsString()
  outletId?: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsString()
  @Length(2, 160)
  destination!: string;

  @IsOptional()
  @IsString()
  @Length(0, 160)
  origin?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ShipmentItemDto)
  items!: ShipmentItemDto[];
}

export class UpdateShipmentStatusDto {
  @IsIn(['pending', 'in_transit', 'delivered', 'cancelled'])
  status!: 'pending' | 'in_transit' | 'delivered' | 'cancelled';

  @IsOptional()
  @IsString()
  @Length(0, 120)
  receiverName?: string;
}

export class CreateVehicleDto {
  @IsString()
  @Length(3, 20)
  plateNumber!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 40)
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  capacityKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  odometerKm?: number;
}

export class RecordFuelDto {
  @IsDateString()
  date!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000)
  liters!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000_000)
  pricePerLiter!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  odometerKm?: number;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  station?: string;
}

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export class CreateWorkOrderDto {
  @IsString()
  @Length(2, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  assetRef?: string;

  @IsOptional()
  @IsString()
  vehicleRef?: string;

  @IsOptional()
  @IsString()
  maintenancePlanId?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: (typeof PRIORITIES)[number];

  @IsOptional()
  @IsDateString()
  scheduledFor?: string;
}

export class UpdateWorkOrderDto {
  @IsOptional()
  @IsIn(['open', 'in_progress', 'completed', 'closed'])
  status?: 'open' | 'in_progress' | 'completed' | 'closed';

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: (typeof PRIORITIES)[number];

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  laborCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  partsCost?: number;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  resolution?: string;
}

export class CreateMaintenancePlanDto {
  @IsString()
  @Length(1, 80)
  assetRef!: string;

  @IsString()
  @Length(2, 200)
  description!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  intervalDays!: number;

  @IsOptional()
  @IsString()
  vehicleRefId?: string;

  /** Jatuh tempo pertama; bila kosong dihitung hari ini + interval. */
  @IsOptional()
  @IsDateString()
  firstDueAt?: string;
}

export class ListTimesheetsDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsIn(['draft', 'submitted', 'approved'])
  status?: 'draft' | 'submitted' | 'approved';

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
}

export class CreateMilestoneDto {
  @IsString()
  @Length(2, 160)
  name!: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /** Id milestone yang harus selesai lebih dulu. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  dependsOn?: string[];
}

export class UpdateMilestoneDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  note?: string;
}

export class CompleteMilestoneDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;
}