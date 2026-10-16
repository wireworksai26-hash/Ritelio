import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePositionDto {
  @IsString()
  @Length(2, 32)
  code!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  baseSalary?: number;
}

const EMPLOYMENT_TYPES = ['permanent', 'contract', 'intern'] as const;

export class CreateEmployeeDto {
  @IsString()
  @Length(2, 32)
  employeeNo!: string;

  @IsString()
  @Length(2, 160)
  fullName!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 160)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(0, 40)
  phone?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  positionId?: string;

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES)
  employmentType?: (typeof EMPLOYMENT_TYPES)[number];

  @IsDateString()
  hireDate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  baseSalary?: number;

  @IsOptional()
  @IsString()
  @Length(0, 40)
  bankAccount?: string;

  @IsOptional()
  @IsString()
  @Length(0, 40)
  taxId?: string;
}

const ATTENDANCE_STATUSES = ['present', 'absent', 'leave', 'half_day'] as const;

export class CreateAttendanceDto {
  @IsString()
  employeeId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsIn(ATTENDANCE_STATUSES)
  status?: (typeof ATTENDANCE_STATUSES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  overtimeHours?: number;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  note?: string;
}

export class DecideLeaveDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  reason?: string;
}

export class PayrollOverrideDto {
  @IsString()
  employeeId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  overtimeAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  bonusAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  otherEarning?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  otherDeduction?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  bpjsKesehatan?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  bpjsKetenagakerjaan?: number;
}

export class CreatePayrollDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'Format periode harus YYYY-MM.' })
  period!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PayrollOverrideDto)
  overrides?: PayrollOverrideDto[];
}

export class TerminateEmployeeDto {
  @IsDateString()
  date!: string;
}

export class CreateDepartmentDto {
  @IsString()
  @Length(2, 32)
  code!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class AttendanceQueryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'Format periode harus YYYY-MM.' })
  month!: string;
}

export class LeaveRequestDto {
  @IsString()
  employeeId!: string;

  @IsString()
  @IsDateString()
  startDate!: string;

  @IsString()
  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  reason?: string;
}

export class ListLeavesQueryDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'cancelled'])
  status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
}

export class ListEmployeeQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}


/** Absen masuk/pulang. Waktu opsional dipakai untuk koreksi oleh HR. */
export class ClockDto {
  @IsOptional()
  @IsDateString()
  at?: string;
}
