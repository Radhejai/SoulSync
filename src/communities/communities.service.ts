import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { getSupabaseAdmin } from '../config/supabase.provider';
import { CreateCommunityDto } from './dto/create-community.dto';

const LOCAL_GROUP_THRESHOLD = 88;

@Injectable()
export class CommunitiesService {
  private normalizeCity(city: string): string {
    return city.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  async list(category?: string) {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('communities')
      .select('id, name, description, category, member_count, created_at')
      .eq('is_archived', false)
      .order('member_count', { ascending: false });

    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async getById(communityId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('communities')
      .select('*')
      .eq('id', communityId)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Community not found');
    return data;
  }

  async create(dto: CreateCommunityDto, creatorId: string) {
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from('communities')
      .select('id')
      .ilike('name', dto.name)
      .maybeSingle();
    if (existing) throw new ConflictException('A community with this name already exists');

    const { data, error } = await supabase
      .from('communities')
      .insert({
        name: dto.name,
        description: dto.description ?? null,
        category: dto.category,
        creator_id: creatorId,
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async join(communityId: string, userId: string, city?: string) {
    const supabase = getSupabaseAdmin();
    await this.getById(communityId);

    const normalizedCity = city ? this.normalizeCity(city) : null;

    const { data: existingMembership } = await supabase
      .from('community_members')
      .select('user_id')
      .eq('community_id', communityId)
      .eq('user_id', userId)
      .maybeSingle();
    if (existingMembership) {
      throw new ConflictException('Already a member of this community');
    }

    const { error: insertError } = await supabase.from('community_members').insert({
      user_id: userId,
      community_id: communityId,
      normalized_city: normalizedCity,
    });
    if (insertError) throw new BadRequestException(insertError.message);

    const { data: community } = await supabase
      .from('communities')
      .select('member_count')
      .eq('id', communityId)
      .single();
    await supabase
      .from('communities')
      .update({
        member_count: (community?.member_count ?? 0) + 1,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', communityId);

    if (normalizedCity) {
      await this.checkAndCreateLocalGroup(communityId, normalizedCity);
    }

    return { message: 'Joined community' };
  }

  private async checkAndCreateLocalGroup(communityId: string, normalizedCity: string) {
    const supabase = getSupabaseAdmin();

    const { count } = await supabase
      .from('community_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('community_id', communityId)
      .eq('normalized_city', normalizedCity);

    if (!count || count <= LOCAL_GROUP_THRESHOLD) return;

    const { data: existingGroup } = await supabase
      .from('local_groups')
      .select('id')
      .eq('community_id', communityId)
      .eq('normalized_city', normalizedCity)
      .maybeSingle();

    if (existingGroup) {
      await supabase
        .from('local_groups')
        .update({ member_count: count })
        .eq('id', existingGroup.id);
      return;
    }

    const { data: newGroup, error } = await supabase
      .from('local_groups')
      .insert({
        community_id: communityId,
        normalized_city: normalizedCity,
        member_count: count,
      })
      .select('id')
      .single();

    if (error || !newGroup) return;

    await supabase
      .from('community_members')
      .update({ local_group_id: newGroup.id })
      .eq('community_id', communityId)
      .eq('normalized_city', normalizedCity);
  }

  async leave(communityId: string, userId: string) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('community_members')
      .delete()
      .eq('community_id', communityId)
      .eq('user_id', userId);

    if (error) throw new BadRequestException(error.message);
    return { message: 'Left community' };
  }
}
