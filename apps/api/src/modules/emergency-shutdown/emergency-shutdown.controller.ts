import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { EmergencyShutdownService } from './emergency-shutdown.service';
import {
  ActivateEmergencyShutdownDto,
  DeactivateEmergencyShutdownDto,
} from './dto/emergency-shutdown.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleName } from '../users/entities/role.entity';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';

/**
 * EmergencyShutdownController
 *
 * Platform-wide emergency shutdown API.
 *
 * Access: SUPER_ADMIN only for activate/deactivate.
 * Authenticated users can check status (so the UI can display a banner).
 */
@Controller('api/v1/emergency-shutdown')
@UseGuards(RolesGuard)
export class EmergencyShutdownController {
  constructor(private readonly service: EmergencyShutdownService) {}

  /**
   * Check if the platform is in emergency shutdown.
   * Available to any authenticated user.
   */
  @Get('status')
  async getStatus() {
    const event = await this.service.getActiveEvent();
    return {
      isActive: event !== null,
      activatedAt: event?.activatedAt ?? null,
      reason: event?.reason ?? null,
      forceCloseExecuted: event?.forceCloseExecuted ?? false,
      positionsClosed: event?.positionsClosed ?? 0,
    };
  }

  /**
   * Activate the platform-wide emergency shutdown.
   * SUPER_ADMIN only.
   */
  @Post('activate')
  @Roles(RoleName.SUPER_ADMIN)
  async activate(@CurrentUserId() adminId: string, @Body() dto: ActivateEmergencyShutdownDto) {
    return this.service.activate(adminId, dto.reason, dto.forceClose);
  }

  /**
   * Deactivate the platform-wide emergency shutdown.
   * SUPER_ADMIN only.
   */
  @Post('deactivate')
  @Roles(RoleName.SUPER_ADMIN)
  async deactivate(@CurrentUserId() adminId: string, @Body() dto: DeactivateEmergencyShutdownDto) {
    return this.service.deactivate(adminId, dto.reason);
  }
}
