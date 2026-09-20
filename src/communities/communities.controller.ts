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
import { CommunitiesService } from './communities.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { JoinCommunityDto } from './dto/join-community.dto';

@Controller('communities')
export class CommunitiesController {
  constructor(private readonly communitiesService: CommunitiesService) {}

  @Get()
  async list(@Query('category') category?: string) {
    return this.communitiesService.list(category);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.communitiesService.getById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Body() dto: CreateCommunityDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.communitiesService.create(dto, user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/join')
  async join(
    @Param('id') id: string,
    @Body() dto: JoinCommunityDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.communitiesService.join(id, user.userId, dto.city);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/leave')
  async leave(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.communitiesService.leave(id, user.userId);
  }
}
