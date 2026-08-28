import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortfolioAccountSnapshotResponseDto } from './dto/portfolio-account-snapshot-response.dto';
import { PortfolioReadService } from './services/portfolio-read.service';

/**
 * Frontend-safe Portfolio Truth API.
 *
 * This controller is read-only and deliberately independent from broker
 * credential/connection mutation routes. It exposes only authenticated-user
 * account metadata plus financial values that the server can tie to an
 * explicit currency and a broker synchronization timestamp.
 */
@ApiTags('Portfolio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioReadService: PortfolioReadService) {}

  @Get('accounts')
  @ApiOperation({
    summary: 'List frontend-safe broker account portfolio snapshots for the authenticated user',
  })
  @ApiResponse({ status: 200, type: PortfolioAccountSnapshotResponseDto, isArray: true })
  async listAccounts(
    @CurrentUserId() userId: string,
  ): Promise<PortfolioAccountSnapshotResponseDto[]> {
    return this.portfolioReadService.listAccounts(userId);
  }
}
