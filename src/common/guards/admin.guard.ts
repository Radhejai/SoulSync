import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { getSupabaseAdmin } from '../../config/supabase.provider';

/**
 * Must run AFTER JwtAuthGuard (relies on request.user.userId being set).
 * Looks up is_admin fresh on every request rather than trusting a JWT claim,
 * so revoking admin access takes effect immediately without waiting for
 * token expiry.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    if (!userId) throw new ForbiddenException('Not authenticated');

    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .maybeSingle();

    if (!data?.is_admin) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
