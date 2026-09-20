import { IsOptional, IsString, MaxLength } from 'class-validator';

export class JoinCommunityDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;
}
