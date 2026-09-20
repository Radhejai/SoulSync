import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const TARGET_TYPES = ['post', 'comment', 'user'] as const;
const REASON_CATEGORIES = [
  'harassment',
  'hate_speech',
  'spam',
  'misinformation',
  'inappropriate_content',
  'impersonation',
  'other',
] as const;

export class CreateReportDto {
  @IsIn(TARGET_TYPES)
  targetType: (typeof TARGET_TYPES)[number];

  @IsUUID()
  targetId: string;

  @IsIn(REASON_CATEGORIES)
  reasonCategory: (typeof REASON_CATEGORIES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
