import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export type NotificationTypeValue = 'low_stock' | 'insight_digest' | 'approval' | 'sync_conflict';

const NOTIFICATION_TYPES: NotificationTypeValue[] = [
  'low_stock',
  'insight_digest',
  'approval',
  'sync_conflict',
];

export class RegisterPushSubscriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  subscriptionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceType?: string;

  @IsOptional()
  @IsBoolean()
  permissionGranted?: boolean;

  @IsOptional()
  @IsObject()
  tags?: Record<string, string>;
}

export class TestPushDto {
  @IsOptional()
  @IsString()
  @MaxLength(140)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  link?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  subscriptionId?: string;
}

export class BroadcastPushDto {
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  title!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  body!: string;

  @IsOptional()
  @IsIn(NOTIFICATION_TYPES)
  type?: NotificationTypeValue;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  link?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetTenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  targetRole?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];
}

export class UpdateOneSignalConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  appId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  restApiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  safariWebId?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  channels?: {
    lowStock?: boolean;
    approval?: boolean;
    aiDigest?: boolean;
    syncConflict?: boolean;
    broadcast?: boolean;
  };
}
