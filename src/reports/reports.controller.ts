import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ActionReportDto } from './dto/action-report.dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Body() dto: CreateReportDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.reportsService.create(dto, user.userId);
  }

  // Admin-only: queue view includes reporter_id for internal investigation.
  // Never build a public/user-facing endpoint that reuses this response shape.
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get()
  async listQueue(
    @Query('status') status?: string,
    @Query('severity') severity?: string,
  ) {
    return this.reportsService.listQueue(status, severity);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post(':id/action')
  async action(
    @Param('id') id: string,
    @Body() dto: ActionReportDto,
    @CurrentUser() admin: { userId: string },
  ) {
    return this.reportsService.actionReport(id, admin.userId, dto);
  }
}
