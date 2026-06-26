import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RoleName } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { PerformanceFeeService } from './services/performance-fee.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { CalculateAssessmentDto } from './dto/calculate-assessment.dto';
import { CreateLedgerEntryDto } from './dto/create-ledger-entry.dto';

/**
 * PerformanceFeesController
 *
 * Provides admin/internal endpoints for the performance fee engine.
 *
 * Access rules:
 * - GET /me/summary — authenticated user (own data only)
 * - All other endpoints — ADMIN or SUPER_ADMIN only
 *
 * IMPORTANT:
 * - No automatic charging occurs here.
 * - Invoicing creates a pending invoice; payment happens via verified webhook.
 * - No broker withdrawals. No live trading activation.
 */
@Controller('api/v1/performance-fees')
@UseGuards(RolesGuard)
export class PerformanceFeesController {
  constructor(private readonly svc: PerformanceFeeService) {}

  // ── Policy endpoints (admin only) ──────────────────────────────────────────

  @Get('policies')
  @Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
  getPolicies() {
    return this.svc.getPolicies();
  }

  @Post('policies')
  @Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
  createPolicy(@Body() dto: CreatePolicyDto, @CurrentUser() admin: User) {
    return this.svc.createPolicy(dto, admin.id);
  }

  // ── User summary (own data) ────────────────────────────────────────────────

  @Get('me/summary')
  getMyPerformanceSummary(@CurrentUser() user: User) {
    return this.svc.getUserSummary(user.id);
  }

  // ── Assessment endpoints ───────────────────────────────────────────────────

  @Get('assessments')
  @Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
  getAssessments(@Query('userId') userId?: string) {
    return this.svc.getAssessments(userId);
  }

  @Post('assessments/calculate')
  @Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
  calculateAssessment(@Body() dto: CalculateAssessmentDto, @CurrentUser() admin: User) {
    return this.svc.calculateAssessment(
      dto.userId,
      dto.brokerConnectionId ?? null,
      dto.currency,
      new Date(dto.periodStart),
      new Date(dto.periodEnd),
      admin.id,
    );
  }

  @Post('assessments/:id/invoice')
  @Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
  invoiceAssessment(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: User) {
    return this.svc.invoiceAssessment(id, admin.id);
  }

  // ── Ledger entry endpoint (admin only) ────────────────────────────────────

  @Post('ledger-entries')
  @Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
  createLedgerEntry(@Body() dto: CreateLedgerEntryDto, @CurrentUser() admin: User) {
    return this.svc.recordLedgerEntry(dto, admin.id);
  }
}
