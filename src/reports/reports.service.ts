import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { getSupabaseAdmin } from '../config/supabase.provider';
import { CreateReportDto } from './dto/create-report.dto';
import { ActionReportDto } from './dto/action-report.dto';

const STRIKE_THRESHOLD_FOR_BAN = 3;
// Pattern analysis: more independent reports on the same target within the
// review queue pushes its severity up, without ever auto-removing content —
// removal always requires an admin's explicit "strike" decision.
const MEDIUM_SEVERITY_REPORT_COUNT = 3;
const HIGH_SEVERITY_REPORT_COUNT = 7;

@Injectable()
export class ReportsService {
  async create(dto: CreateReportDto, reporterId: string) {
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from('reports')
      .select('id')
      .eq('reporter_id', reporterId)
      .eq('target_type', dto.targetType)
      .eq('target_id', dto.targetId)
      .eq('status', 'pending')
      .maybeSingle();
    if (existing) {
      throw new ConflictException('You already have a pending report on this item');
    }

    const { data: report, error } = await supabase
      .from('reports')
      .insert({
        reporter_id: reporterId,
        target_type: dto.targetType,
        target_id: dto.targetId,
        reason_category: dto.reasonCategory,
        description: dto.description ?? null,
      })
      .select('id, target_type, target_id, status, severity, created_at')
      .single();

    if (error) throw new BadRequestException(error.message);

    await this.reassessSeverity(dto.targetType, dto.targetId);

    return report;
  }

  /** Pattern analysis: escalates severity for ALL pending reports on a
   * target as independent report volume grows. Never removes content by
   * itself — escalation only affects queue priority for admin review. */
  private async reassessSeverity(targetType: string, targetId: string) {
    const supabase = getSupabaseAdmin();
    const { count } = await supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .eq('status', 'pending');

    let severity: 'low' | 'medium' | 'high' = 'low';
    if ((count ?? 0) >= HIGH_SEVERITY_REPORT_COUNT) severity = 'high';
    else if ((count ?? 0) >= MEDIUM_SEVERITY_REPORT_COUNT) severity = 'medium';

    if (severity !== 'low') {
      await supabase
        .from('reports')
        .update({ severity })
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .eq('status', 'pending');
    }
  }

  /** Admin-only queue. reporter_id is included here for internal
   * investigation purposes ONLY — never expose this field via any endpoint
   * the reported user or other members can reach. */
  async listQueue(status = 'pending', severity?: string) {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('reports')
      .select('*')
      .eq('status', status)
      .order('severity', { ascending: false })
      .order('created_at', { ascending: true });

    if (severity) query = query.eq('severity', severity);

    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  private async resolveTargetAuthor(
    targetType: string,
    targetId: string,
  ): Promise<string> {
    const supabase = getSupabaseAdmin();
    if (targetType === 'user') return targetId;

    const table = targetType === 'post' ? 'posts' : 'comments';
    const { data } = await supabase
      .from(table)
      .select('author_id')
      .eq('id', targetId)
      .maybeSingle();

    if (!data) throw new NotFoundException(`Reported ${targetType} no longer exists`);
    return data.author_id;
  }

  async actionReport(reportId: string, adminId: string, dto: ActionReportDto) {
    const supabase = getSupabaseAdmin();
    const { data: report } = await supabase
      .from('reports')
      .select('*')
      .eq('id', reportId)
      .maybeSingle();

    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== 'pending') {
      throw new BadRequestException('This report has already been reviewed');
    }

    if (dto.decision === 'dismiss') {
      await supabase
        .from('reports')
        .update({ status: 'dismissed', reviewed_by: adminId, reviewed_at: new Date().toISOString() })
        .eq('id', reportId);
      return { message: 'Report dismissed' };
    }

    // decision === 'strike': confirmed violation
    const authorId = await this.resolveTargetAuthor(report.target_type, report.target_id);

    if (report.target_type === 'post') {
      await supabase.from('posts').update({ is_removed: true }).eq('id', report.target_id);
    } else if (report.target_type === 'comment') {
      await supabase.from('comments').update({ is_removed: true }).eq('id', report.target_id);
    }
    // target_type === 'user': no content to remove, strike applies to the account directly.

    await supabase.from('strikes').insert({
      user_id: authorId,
      report_id: reportId,
      reason_category: report.reason_category,
      issued_by: adminId,
    });

    const { data: user } = await supabase
      .from('users')
      .select('strike_count')
      .eq('id', authorId)
      .single();

    const newStrikeCount = (user?.strike_count ?? 0) + 1;
    const shouldBan = newStrikeCount >= STRIKE_THRESHOLD_FOR_BAN;

    await supabase
      .from('users')
      .update({ strike_count: newStrikeCount, is_banned: shouldBan })
      .eq('id', authorId);

    await supabase
      .from('reports')
      .update({ status: 'actioned', reviewed_by: adminId, reviewed_at: new Date().toISOString() })
      .eq('id', reportId);

    return {
      message: shouldBan
        ? 'Content removed, strike issued, and account suspended (3-strike threshold reached)'
        : `Content removed and strike issued (${newStrikeCount}/${STRIKE_THRESHOLD_FOR_BAN} strikes)`,
    };
  }
}
