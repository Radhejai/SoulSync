import {
  Body,
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';

@Controller()
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get('communities/:communityId/posts')
  async listByCommunity(
    @Param('communityId') communityId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.postsService.listByCommunity(
      communityId,
      limit ? Number(limit) : 20,
      before,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('communities/:communityId/posts')
  async create(
    @Param('communityId') communityId: string,
    @Body() dto: CreatePostDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.postsService.create(communityId, user.userId, dto);
  }

  @Get('posts/:postId')
  async getOne(@Param('postId') postId: string) {
    return this.postsService.getById(postId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('posts/:postId')
  async deleteOwn(
    @Param('postId') postId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.postsService.deleteOwn(postId, user.userId);
  }

  @Get('posts/:postId/comments')
  async listComments(@Param('postId') postId: string) {
    return this.postsService.listComments(postId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('posts/:postId/comments')
  async addComment(
    @Param('postId') postId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.postsService.addComment(postId, user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('comments/:commentId')
  async deleteOwnComment(
    @Param('commentId') commentId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.postsService.deleteOwnComment(commentId, user.userId);
  }
}
