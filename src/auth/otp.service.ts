import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { getSupabaseAdmin } from '../config/supabase.provider';

interface OtpProvider {
  send(mobileNumber: string, code: string): Promise<void>;
}

class StubOtpProvider implements OtpProvider {
  private readonly logger = new Logger('StubOtpProvider');
  async send(mobileNumber: string, code: string): Promise<void> {
    this.logger.warn(
      `[DEV ONLY — no real SMS sent] OTP for ${mobileNumber}: ${code}`,
    );
  }
}

@Injectable()
export class OtpService {
  private readonly OTP_TTL_MINUTES = 10;
  private readonly MAX_ATTEMPTS = 5;

  private getProvider(): OtpProvider {
    return new StubOtpProvider();
  }

  private generateCode(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  private hashCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  async requestOtp(mobileNumber: string, purpose: string): Promise<void> {
    const code = this.generateCode();
    const codeHash = this.hashCode(code);
    const expiresAt = new Date(
      Date.now() + this.OTP_TTL_MINUTES * 60 * 1000,
    ).toISOString();

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('otp_requests').upsert(
      {
        mobile_number: mobileNumber,
        purpose,
        code_hash: codeHash,
        expires_at: expiresAt,
        attempts: 0,
      },
      { onConflict: 'mobile_number,purpose' },
    );
    if (error) throw new Error(`Failed to store OTP request: ${error.message}`);

    await this.getProvider().send(mobileNumber, code);
  }

  async verifyOtp(
    mobileNumber: string,
    purpose: string,
    submittedCode: string,
  ): Promise<boolean> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('otp_requests')
      .select('*')
      .eq('mobile_number', mobileNumber)
      .eq('purpose', purpose)
      .single();

    if (error || !data) return false;
    if (new Date(data.expires_at).getTime() < Date.now()) return false;
    if (data.attempts >= this.MAX_ATTEMPTS) return false;

    const submittedHash = this.hashCode(submittedCode);
    const isMatch = crypto.timingSafeEqual(
      Buffer.from(submittedHash),
      Buffer.from(data.code_hash),
    );

    if (!isMatch) {
      await supabase
        .from('otp_requests')
        .update({ attempts: data.attempts + 1 })
        .eq('mobile_number', mobileNumber)
        .eq('purpose', purpose);
      return false;
    }

    await supabase
      .from('otp_requests')
      .delete()
      .eq('mobile_number', mobileNumber)
      .eq('purpose', purpose);
    return true;
  }
}
