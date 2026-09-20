import { IsIn, IsString, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @Matches(/^\+[1-9]\d{7,14}$/)
  mobileNumber: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  code: string;

  @IsIn(['signup', 'login', 'reset_password'])
  purpose: 'signup' | 'login' | 'reset_password';
}
