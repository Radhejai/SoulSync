import {
  IsEmail,
  IsString,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';

export class SignupDto {
  @IsEmail()
  email: string;

  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'mobileNumber must be in E.164 format, e.g. +919876543210',
  })
  mobileNumber: string;

  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters' })
  @MaxLength(128)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Password must include at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;
}
