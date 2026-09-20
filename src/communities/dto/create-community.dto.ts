import { IsString, IsIn, MinLength, MaxLength, IsOptional } from 'class-validator';

const ALLOWED_CATEGORIES = [
  'lifestyle_values',
  'self_growth',
  'hobbies',
  'identity_based',
  'professional_niche',
] as const;

export class CreateCommunityDto {
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsIn(ALLOWED_CATEGORIES)
  category: (typeof ALLOWED_CATEGORIES)[number];
}
