import { IsArray, IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';

export type CustomFieldType = 'text' | 'number' | 'date' | 'dropdown';

export class UpdateModuleConfigDto {
  @IsBoolean()
  isActive!: boolean;
}

export class CreateCustomFieldDto {
  @IsString()
  @Length(2, 60)
  label!: string;

  @IsIn(['text', 'number', 'date', 'dropdown'])
  type!: CustomFieldType;

  // Wajib minimal 2 item jika type = dropdown (dicek di service)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];
}
