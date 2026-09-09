import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class ChatDto {
  @IsString()
  @Length(1, 500, { message: 'Pertanyaan harus 1-500 karakter.' })
  question!: string;
}

export class FeedbackDto {
  @IsInt()
  @IsIn([1, -1], { message: 'Feedback harus 1 (membantu) atau -1 (kurang).' })
  feedback!: number;
}

export class CashflowForecastQuery {
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(90)
  days?: number = 30;
}
