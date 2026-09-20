import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { getSupabaseAdmin } from '../config/supabase.provider';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class PostsService {
  private async touchCommunityActivity(communityId: string) {
    const supabase = getSupabaseAdmin();
    await supabase
      .from('communities')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', communityId);
  }

  private async requireMembership(communityId: string, userId: string) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('community_members')
      .select('user_id')
      .eq('community_id', communityId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) {
      throw new ForbiddenException('Join this community before posting');
    }
  }

  async listByCommunity(communityId: string, limit = 20, before?: string) {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('posts')
      .select('id, community_id, author_id, title, body, comment_count, upvote_count, created_at')
      .eq('community_id', communityId)
      .eq('is_removed', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) query = query.lt('created_at', before);

    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async getById(postId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .eq('is_removed', false)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Post not found');
    return data;
  }

  async create(communityId: string, authorId: string, dto: CreatePostDto) {
    await this.requireMembership(communityId, authorId);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('posts')
      .insert({
        community_id: communityId,
        author_id: authorId,
        title: dto.title,
        body: dto.body,
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    await this.touchCommunityActivity(communityId);
    return data;
  }

  async deleteOwn(postId: string, userId: string) {
    const supabase = getSupabaseAdmin();
    const { data: post } = await supabase
      .from('posts')
      .select('author_id')
      .eq('id', postId)
      .maybeSingle();

    if (!post) throw new NotFoundException('Post not found');
    if (post.author_id !== userId) {
      throw new ForbiddenException('You can only delete your own posts');
    }

    const { error } = await supabase
      .from('posts')
      .update({ is_removed: true })
      .eq('id', postId);
    if (error) throw new BadRequestException(error.message);
    return { message: 'Post deleted' };
  }

  async listComments(postId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('comments')
      .select('id, post_id, author_id, body, created_at')
      .eq('post_id', postId)
      .eq('is_removed', false)
      .order('created_at', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async addComment(postId: string, authorId: string, dto: CreateCommentDto) {
    const post = await this.getById(postId);
    await this.requireMembership(post.community_id, authorId);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('comments')
      .insert({ post_id: postId, author_id: authorId, body: dto.body })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    await supabase
      .from('posts')
      .update({ comment_count: (post.comment_count ?? 0) + 1 })
      .eq('id', postId);

    await this.touchCommunityActivity(post.community_id);
    return data;
  }

  async deleteOwnComment(commentId: string, userId: string) {
    const supabase = getSupabaseAdmin();
    const { data: comment } = await supabase
      .from('comments')
      .select('author_id')
      .eq('id', commentId)
      .maybeSingle();

    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.author_id !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    const { error } = await supabase
      .from('comments')
      .update({ is_removed: true })
      .eq('id', commentId);
    if (error) throw new BadRequestException(error.message);
    return { message: 'Comment deleted' };
  }
}
