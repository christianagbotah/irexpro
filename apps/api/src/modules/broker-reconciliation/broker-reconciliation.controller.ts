import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RoleName } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { BrokerTradeReconciliationService } from './services/broker-trade-reconciliation.service';
import { RunReconciliationDto } from './dto/run-reconciliation.dto';

/** The JWT strategy attaches `roles: RoleName[]` to the request user object. */
type RequestUser = User & { roles?: RoleName[] };

/**
 * BrokerReconciliationController
 *
 * API surface for broker trade reconciliation.
 *
 * Access rules:
 * - POST /run  — ADMIN / SUPER_ADMIN only.
 * - GET /runs  — ADMIN / SUPER_ADMIN (all); USER (own data only).
 * - GET /reconciled-trades — ADMIN / SUPER_ADMIN (any userId); USER (own only).
 *
 * SAFETY RULES (enforced by this controller):
 * - Normal users can only view their own reconciliation data.
 * - Normal users cannot trigger reconciliation for another user.
 * - No broker withdrawals or auto-charges occur here.
 * - No performance-fee assessments or invoices are created here.
 * - No credentials, secrets, or raw broker payloads in any response.
 */
@Controller('api/v1/broker-reconciliation')
@UseGuards(RolesGuard)
export class BrokerReconciliationController {
  constructor(private readonly svc: BrokerTradeReconciliationService) {}

  /**
   * Trigger a broker trade reconciliation run.
   * Admin / super-admin only.
   */
  @Post('closed-trades/run')
  @Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
  runReconciliation(
    @Body() dto: RunReconciliationDto,
    @CurrentUser() actor: RequestUser,
    @Request() req: { ip?: string },
  ) {
    return this.svc.runReconciliation(
      dto.userId,
      dto.brokerConnectionId,
      new Date(dto.fromTime),
      new Date(dto.toTime),
      actor.id,
      req.ip,
    );
  }

  /**
   * List reconciliation runs.
   * - Admin: can filter by any userId query param.
   * - Normal user: always filtered to own userId regardless of query param.
   */
  @Get('runs')
  getRuns(
    @CurrentUser() currentUser: RequestUser,
    @Query('userId') queryUserId?: string,
  ) {
    const isAdmin = currentUser.roles?.some(
      (r) => r === RoleName.ADMIN || r === RoleName.SUPER_ADMIN,
    );

    const effectiveUserId = isAdmin ? queryUserId : currentUser.id;
    return this.svc.getRuns(effectiveUserId);
  }

  /**
   * List reconciled trades.
   * - Admin: can filter by any userId and brokerConnectionId.
   * - Normal user: always filtered to own userId.
   */
  @Get('reconciled-trades')
  getReconciledTrades(
    @CurrentUser() currentUser: RequestUser,
    @Query('userId') queryUserId?: string,
    @Query('brokerConnectionId') brokerConnectionId?: string,
  ) {
    const isAdmin = currentUser.roles?.some(
      (r) => r === RoleName.ADMIN || r === RoleName.SUPER_ADMIN,
    );

    // Non-admin users attempting to view another user's data get a 403
    if (!isAdmin && queryUserId && queryUserId !== currentUser.id) {
      throw new ForbiddenException('You can only view your own reconciliation data');
    }

    const effectiveUserId = isAdmin ? queryUserId : currentUser.id;
    return this.svc.getReconciledTrades(effectiveUserId, brokerConnectionId);
  }
}
