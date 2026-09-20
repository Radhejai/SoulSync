import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { getSupabaseAdmin } from '../config/supabase.provider';
import { SignupDto } from './dto/signup.dto';
import { OtpService } from './otp.service';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
  ) {}

  async signup(dto: SignupDto) {
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .or(`email.eq.${dto.email},mobile_number.eq.${dto.mobileNumber}`)
      .maybeSingle();

    if (existing) {
      throw new ConflictException('An account with these details already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email: dto.email,
        mobile_number: dto.mobileNumber,
        password_hash: passwordHash,
        email_verified: false,
        mobile_verified: false,
        verification_tier: 'unverified',
      })
      .select('id, email, mobile_number')
      .single();

    if (error) throw new BadRequestException(error.message);

    await this.otpService.requestOtp(dto.mobileNumber, 'signup');

    return {
      userId: user.id,
      message: 'Account created. Enter the OTP sent to your mobile number to continue.',
    };
  }

  async verifySignupOtp(mobileNumber: string, code: string) {
    const isValid = await this.otpService.verifyOtp(
      mobileNumber,
      'signup',
      code,
    );
    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const supabase = getSupabaseAdmin();
    const { data: user, error } = await supabase
      .from('users')
      .update({ mobile_verified: true, verification_tier: 'basic' })
      .eq('mobile_number', mobileNumber)
      .select('id, email, mobile_number, verification_tier')
      .single();

    if (error || !user) throw new BadRequestException('Could not verify user');

    return this.issueTokens(user.id);
  }

  async login(email: string, password: string) {
    const supabase = getSupabaseAdmin();
    const { data: user } = await supabase
      .from('users')
      .select('id, password_hash, mobile_verified')
      .eq('email', email)
      .maybeSingle();

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) throw new UnauthorizedException('Invalid credentials');

    if (!user.mobile_verified) {
      throw new UnauthorizedException('Please complete mobile verification first');
    }

    return this.issueTokens(user.id);
  }

  private issueTokens(userId: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId, type: 'access' },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_EXPIRY ?? '15m',
      },
    );
    const refreshToken = this.jwtService.sign(
      { sub: userId, type: 'refresh' },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRY ?? '7d',
      },
    );
    return { accessToken, refreshToken };
  }
}
