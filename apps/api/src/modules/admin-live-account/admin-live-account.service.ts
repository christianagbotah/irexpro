import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, MoreThanOrEqual, Repository } from 'typeorm';
import { BrokerAccount } from '../broker/entities/broker-account.entity';
import { BrokerConnection } from '../broker/entities/broker-connection.entity';
import { BrokerService } from '../broker/broker.service';
import { BrokerAuthorizationStatus } from '../broker/authorization/broker-authorization-status';
import { BrokerConnectionStatus, BrokerMode } from '../broker/interfaces/broker-adapter.interface';
import { BrokerProviderRegistryService } from '../broker/registry/broker-provider-registry.service';
import { TradingSession, TradingSessionStatus } from '../execution/entities/trading-session.entity';
import { ExecutionControlScope } from '../execution-control/entities/execution-control.entity';
import {
  ExecutionControlService,
  ExecutionControlView,
} from '../execution-control/execution-control.service';
import { ReconciliationRun } from '../execution/reconciliation/entities/reconciliation-run.entity';
import { ReconciliationDiscrepancy } from '../execution/reconciliation/entities/reconciliation-discrepancy.entity';
import {
  ReconciliationDiscrepancySeverity,
  ReconciliationDiscrepancyStatus,
} from '../execution/reconciliation/reconciliation.enums';
import { AuditLog, AuditSeverity } from '../audit/entities/audit-log.entity';
import {
  AdminAuditLogFilter,
  AdminConnectionFilter,
  AdminDiscrepancyFilter,
} from './dto/admin-live-account.enums';
import {
  AdminDiscrepancyCountsDto,
  AdminExecutionControlViewDto,
  AdminLiveOpsOverviewViewDto,
  AdminProviderRegistryEntryDto,
  AdminConnectionStateCountsDto,
} from './dto/admin-live-account-overview-response.dto';
import {
  AdminConnectionsPageDto,
  toAdminConnectionRowView,
} from './dto/admin-connections-response.dto';
import {
  AdminDiscrepanciesPageDto,
  deriveDiscrepancyDescription,
  toAdminDiscrepancyRowView,
} from './dto/admin-discrepancies-response.dto';
import { AdminAuditPageDto, toAdminAuditRowView } from './dto/admin-audit-response.dto';

// ─── Public constants (Directive-tuned thresholds) ──────────────────────────

/** Default page size for admin listings. */
export const ADMIN_LIVE_ACCOUNT_DEFAULT_PAGE_LIMIT = 50;
/** Maximum page size for admin listings. */
export const ADMIN_LIVE_ACCOUNT_MAX_PAGE_LIMIT = 100;
/** resolvedLast24h window on ReconciliationDiscrepancy.resolvedAt. */
export const ADMIN_RESOLVED_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Sanitized lastErrorMessage never exceeds this length. */
export const ADMIN_ERROR_MESSAGE_MAX_LENGTH = 200;
/** Sanitized discrepancy description never exceeds this length. */
export const ADMIN_DESCRIPTION_MAX_LENGTH = 300;
/** Sanitized control reason never exceeds this length (entity column max). */
export const ADMIN_CONTROL_REASON_MAX_LENGTH = 500;
/** BrokerId fallback for orphaned discrepancies (connection row gone). */
export const ADMIN_UNKNOWN_BROKER_ID = 'unknown';

/** Alphanumeric runs of 16+ chars are treated as key/token material (Directive §40). */
const SECRET_LIKE_RUN = /[A-Za-z0-9]{16,}/g;

/** Authorization states counted as "authorized" (grant past, not revoked). */
const AUTHORIZED_AUTHORIZATION_STATUSES: readonly BrokerAuthorizationStatus[] = [
  BrokerAuthorizationStatus.AUTHORIZED,
  BrokerAuthorizationStatus.READY,
  BrokerAuthorizationStatus.ACTIVE,
];

// ─── Pure helpers (exported for reuse by the controllers + tests) ───────────

export function clampPaginationLimit(limit: number): number {
  const truncated = Math.trunc(
    Number.isFinite(limit) ? limit : ADMIN_LIVE_ACCOUNT_DEFAULT_PAGE_LIMIT,
  );
  return Math.min(Math.max(truncated, 1), ADMIN_LIVE_ACCOUNT_MAX_PAGE_LIMIT);
}

export function clampPaginationOffset(offset: number): number {
  const truncated = Math.trunc(Number.isFinite(offset) ? offset : 0);
  return Math.max(truncated, 0);
}

/** Only exact enum values pass; anything else safely falls back to ALL. */
export function normalizeAdminConnectionFilter(
  filter: AdminConnectionFilter | string | null | undefined,
): AdminConnectionFilter {
  if (
    filter === AdminConnectionFilter.CONNECTED ||
    filter === AdminConnectionFilter.ERROR ||
    filter === AdminConnectionFilter.LIVE ||
    filter === AdminConnectionFilter.DEMO
  ) {
    return filter;
  }
  return AdminConnectionFilter.ALL;
}

export function normalizeAdminDiscrepancyFilter(
  filter: AdminDiscrepancyFilter | string | null | undefined,
): AdminDiscrepancyFilter {
  if (
    filter === AdminDiscrepancyFilter.OPEN ||
    filter === AdminDiscrepancyFilter.RESOLVED ||
    filter === AdminDiscrepancyFilter.CRITICAL ||
    filter === AdminDiscrepancyFilter.WARNING
  ) {
    return filter;
  }
  return AdminDiscrepancyFilter.ALL;
}

export function normalizeAdminAuditFilter(
  filter: AdminAuditLogFilter | string | null | undefined,
): AdminAuditLogFilter {
  if (filter === AdminAuditLogFilter.CRITICAL || filter === AdminAuditLogFilter.WARNING) {
    return filter;
  }
  return AdminAuditLogFilter.ALL;
}

/**
 * Scrub a free-text field for admin display: replace secret-like alphanumeric
 * runs with "…", then cap the length. Returns null for empty results.
 */
export function sanitizeAdminText(
  message: string | null | undefined,
  maxLength: number,
): string | null {
  if (!message) return null;
  const scrubbed = message.replace(SECRET_LIKE_RUN, '…');
  const trimmed = scrubbed.length > maxLength ? scrubbed.slice(0, maxLength) : scrubbed;
  return trimmed.trim().length > 0 ? trimmed : null;
}

/** Masked display for a scoped control target (last 4, "•••" prefix). */
export function maskControlScopeTarget(scopeKey: string | null): string | null {
  if (!scopeKey || scopeKey.length < 4) return null;
  return `•••${scopeKey.slice(-4)}`;
}

/**
 * AdminLiveAccountService — read-only ADMIN visibility over the live-account
 * architecture (Sprint 50 PR-6 — Directive PHASE L §39).
 *
 * ADMIN SCOPE: cross-user visibility is intentional (RBAC enforced at the
 * controllers). No client-supplied userId is ever accepted as an input —
 * audit-investigation filters (actorUserId / resourceType) are used ONLY as
 * equality filters and never for anything broader.
 *
 * SECURITY (read-only projection by construction): credential material
 * (encryptedCredentials, credentialIv, credentialTag, encryptionKeyId),
 * provider secrets, audit metadata blobs, IP addresses, and user agents never
 * enter any DTO. Account identifiers are masked to the last 4 characters.
 * `lastErrorMessage`, discrepancy descriptions, and control reasons are
 * sanitized (secret-like runs stripped) + truncated. The Sprint 50
 * fail-closed executable gate is REUSED via
 * BrokerService.isConnectionExecutable (never re-implemented).
 *
 * NO new tables — this module only aggregates existing PR-1..PR-5 state.
 */
@Injectable()
export class AdminLiveAccountService {
  constructor(
    @InjectRepository(BrokerConnection)
    private readonly connectionRepo: Repository<BrokerConnection>,
    @InjectRepository(BrokerAccount)
    private readonly accountRepo: Repository<BrokerAccount>,
    @InjectRepository(TradingSession)
    private readonly sessionRepo: Repository<TradingSession>,
    @InjectRepository(ReconciliationRun)
    private readonly runRepo: Repository<ReconciliationRun>,
    @InjectRepository(ReconciliationDiscrepancy)
    private readonly discrepancyRepo: Repository<ReconciliationDiscrepancy>,
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    private readonly executionControlService: ExecutionControlService,
    private readonly providerRegistry: BrokerProviderRegistryService,
    private readonly brokerService: BrokerService,
  ) {}

  // ─── GET /admin/live-account/overview ─────────────────────────────────────

  async getOverview(now: Date = new Date()): Promise<AdminLiveOpsOverviewViewDto> {
    const cutoff = new Date(now.getTime() - ADMIN_RESOLVED_WINDOW_MS);

    const [
      connections,
      openDiscrepancies,
      resolvedLast24h,
      activeControls,
      activeSessions,
      suspendedSessions,
    ] = await Promise.all([
      this.connectionRepo.find(),
      this.discrepancyRepo.find({
        where: { status: ReconciliationDiscrepancyStatus.OPEN },
      }),
      this.discrepancyRepo.count({
        where: {
          status: ReconciliationDiscrepancyStatus.RESOLVED,
          resolvedAt: MoreThanOrEqual(cutoff),
        },
      }),
      this.loadActiveControls(),
      this.sessionRepo.count({ where: { status: TradingSessionStatus.ACTIVE } }),
      this.sessionRepo.count({
        where: {
          status: In([
            TradingSessionStatus.SUSPENDED_RISK_LIMIT,
            TradingSessionStatus.SUSPENDED_BROKER,
          ]),
        },
      }),
    ]);

    const severityCounts = new Map<ReconciliationDiscrepancySeverity, number>();
    for (const discrepancy of openDiscrepancies) {
      severityCounts.set(discrepancy.severity, (severityCounts.get(discrepancy.severity) ?? 0) + 1);
    }

    const discrepancies: AdminDiscrepancyCountsDto = {
      open: openDiscrepancies.length,
      openCritical: severityCounts.get(ReconciliationDiscrepancySeverity.CRITICAL) ?? 0,
      openWarning: severityCounts.get(ReconciliationDiscrepancySeverity.WARNING) ?? 0,
      openInfo: severityCounts.get(ReconciliationDiscrepancySeverity.INFO) ?? 0,
      resolvedLast24h,
    };

    return {
      generatedAt: now.toISOString(),
      connections: this.countConnectionStates(connections),
      discrepancies,
      activeControls,
      providers: this.mapProviders(),
      automation: {
        activeSessions,
        suspendedSessions,
      },
    };
  }

  // ─── GET /admin/live-account/connections ──────────────────────────────────

  async getConnections(
    filter: AdminConnectionFilter | string | null | undefined = AdminConnectionFilter.ALL,
    limit: number = ADMIN_LIVE_ACCOUNT_DEFAULT_PAGE_LIMIT,
    offset: number = 0,
  ): Promise<AdminConnectionsPageDto> {
    const safeFilter = normalizeAdminConnectionFilter(filter);
    const safeLimit = clampPaginationLimit(limit);
    const safeOffset = clampPaginationOffset(offset);

    const where: FindOptionsWhere<BrokerConnection> | undefined =
      safeFilter === AdminConnectionFilter.CONNECTED
        ? { status: BrokerConnectionStatus.CONNECTED }
        : safeFilter === AdminConnectionFilter.ERROR
          ? { status: BrokerConnectionStatus.ERROR }
          : safeFilter === AdminConnectionFilter.LIVE
            ? { accountType: BrokerMode.LIVE }
            : safeFilter === AdminConnectionFilter.DEMO
              ? { accountType: BrokerMode.DEMO }
              : undefined;

    const [connections, total, openDiscrepancyCounts] = await Promise.all([
      this.connectionRepo.find({
        ...(where ? { where } : {}),
        order: { createdAt: 'DESC' },
        take: safeLimit,
        skip: safeOffset,
      }),
      this.connectionRepo.count(where ? { where } : {}),
      this.countOpenDiscrepanciesByConnection(),
    ]);

    return {
      connections: connections.map((connection) =>
        toAdminConnectionRowView(
          connection,
          this.isExecutable(connection),
          sanitizeAdminText(connection.lastErrorMessage, ADMIN_ERROR_MESSAGE_MAX_LENGTH),
          openDiscrepancyCounts.get(connection.id) ?? 0,
        ),
      ),
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  // ─── GET /admin/live-account/reconciliation/discrepancies ─────────────────

  async getDiscrepancies(
    filter: AdminDiscrepancyFilter | string | null | undefined = AdminDiscrepancyFilter.ALL,
    limit: number = ADMIN_LIVE_ACCOUNT_DEFAULT_PAGE_LIMIT,
    offset: number = 0,
  ): Promise<AdminDiscrepanciesPageDto> {
    const safeFilter = normalizeAdminDiscrepancyFilter(filter);
    const safeLimit = clampPaginationLimit(limit);
    const safeOffset = clampPaginationOffset(offset);

    // Severity filters imply OPEN rows of that severity.
    const where: FindOptionsWhere<ReconciliationDiscrepancy> | undefined =
      safeFilter === AdminDiscrepancyFilter.OPEN
        ? { status: ReconciliationDiscrepancyStatus.OPEN }
        : safeFilter === AdminDiscrepancyFilter.RESOLVED
          ? { status: ReconciliationDiscrepancyStatus.RESOLVED }
          : safeFilter === AdminDiscrepancyFilter.CRITICAL
            ? {
                severity: ReconciliationDiscrepancySeverity.CRITICAL,
                status: ReconciliationDiscrepancyStatus.OPEN,
              }
            : safeFilter === AdminDiscrepancyFilter.WARNING
              ? {
                  severity: ReconciliationDiscrepancySeverity.WARNING,
                  status: ReconciliationDiscrepancyStatus.OPEN,
                }
              : undefined;

    const [discrepancies, total] = await Promise.all([
      this.discrepancyRepo.find({
        ...(where ? { where } : {}),
        order: { firstDetectedAt: 'DESC' },
        take: safeLimit,
        skip: safeOffset,
      }),
      this.discrepancyRepo.count(where ? { where } : {}),
    ]);

    const brokerIds = await this.loadBrokerIds(discrepancies.map((d) => d.brokerConnectionId));

    return {
      discrepancies: discrepancies.map((discrepancy) =>
        toAdminDiscrepancyRowView(
          discrepancy,
          brokerIds.get(discrepancy.brokerConnectionId) ?? ADMIN_UNKNOWN_BROKER_ID,
          sanitizeAdminText(
            deriveDiscrepancyDescription(discrepancy),
            ADMIN_DESCRIPTION_MAX_LENGTH,
          ) ?? discrepancy.type,
        ),
      ),
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  // ─── GET /admin/audit/logs ────────────────────────────────────────────────

  async getAuditLogs(
    filter: AdminAuditLogFilter | string | null | undefined = AdminAuditLogFilter.ALL,
    actorUserId: string | null | undefined = null,
    resourceType: string | null | undefined = null,
    limit: number = ADMIN_LIVE_ACCOUNT_DEFAULT_PAGE_LIMIT,
    offset: number = 0,
  ): Promise<AdminAuditPageDto> {
    const safeFilter = normalizeAdminAuditFilter(filter);
    const safeLimit = clampPaginationLimit(limit);
    const safeOffset = clampPaginationOffset(offset);

    // Investigation filters are equality-only and only applied when they are
    // non-empty strings — never trusted for anything broader.
    const where: FindOptionsWhere<AuditLog> = {};
    if (safeFilter === AdminAuditLogFilter.CRITICAL) {
      where.severity = AuditSeverity.CRITICAL;
    } else if (safeFilter === AdminAuditLogFilter.WARNING) {
      where.severity = AuditSeverity.WARNING;
    }
    const actor = typeof actorUserId === 'string' ? actorUserId.trim() : '';
    if (actor.length > 0) where.actorUserId = actor;
    const resource = typeof resourceType === 'string' ? resourceType.trim() : '';
    if (resource.length > 0) where.resourceType = resource;

    const [logs, total] = await Promise.all([
      this.auditRepo.find({
        where,
        order: { createdAt: 'DESC' },
        take: safeLimit,
        skip: safeOffset,
      }),
      this.auditRepo.count({ where }),
    ]);

    return {
      logs: logs.map(toAdminAuditRowView),
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /** Bucket all connections into the admin state-count matrix. */
  private countConnectionStates(connections: BrokerConnection[]): AdminConnectionStateCountsDto {
    const counts: AdminConnectionStateCountsDto = {
      total: connections.length,
      connected: 0,
      connecting: 0,
      error: 0,
      disconnected: 0,
      authorized: 0,
      authorizationRequired: 0,
      revoked: 0,
      suspended: 0,
      demo: 0,
      live: 0,
    };

    for (const connection of connections) {
      if (connection.status === BrokerConnectionStatus.CONNECTED) counts.connected += 1;
      else if (connection.status === BrokerConnectionStatus.CONNECTING) counts.connecting += 1;
      else if (connection.status === BrokerConnectionStatus.ERROR) counts.error += 1;
      else if (connection.status === BrokerConnectionStatus.DISCONNECTED) counts.disconnected += 1;
      // BrokerConnectionStatus.SUSPENDED has no dedicated bucket in the
      // frozen contract — it still counts toward `total`.

      if (AUTHORIZED_AUTHORIZATION_STATUSES.includes(connection.authorizationStatus)) {
        counts.authorized += 1;
      } else if (
        connection.authorizationStatus === BrokerAuthorizationStatus.AUTHORIZATION_REQUIRED
      ) {
        counts.authorizationRequired += 1;
      } else if (connection.authorizationStatus === BrokerAuthorizationStatus.REVOKED) {
        counts.revoked += 1;
      } else if (connection.authorizationStatus === BrokerAuthorizationStatus.SUSPENDED) {
        counts.suspended += 1;
      }

      if (connection.accountType === BrokerMode.DEMO) counts.demo += 1;
      else if (connection.accountType === BrokerMode.LIVE) counts.live += 1;
    }

    return counts;
  }

  /**
   * REUSED active-control inventory — delegates to
   * ExecutionControlService.listActiveControls() and maps to the admin view
   * (normalized scope target + sanitized reason + ISO dates).
   */
  private async loadActiveControls(): Promise<AdminExecutionControlViewDto[]> {
    const controls: ExecutionControlView[] =
      await this.executionControlService.listActiveControls();
    return controls.map((control) => ({
      id: control.id,
      scope: control.scope,
      scopeTarget: this.normalizeControlScopeTarget(control.scope, control.scopeKey),
      reason: sanitizeAdminText(control.reason, ADMIN_CONTROL_REASON_MAX_LENGTH),
      activatedBy: control.activatedByUserId ?? null,
      activatedAt: control.activatedAt.toISOString(),
      expiresAt: control.expiresAt ? control.expiresAt.toISOString() : null,
    }));
  }

  /** Normalized display target: broker id / masked user or connection / null. */
  private normalizeControlScopeTarget(
    scope: ExecutionControlScope,
    scopeKey: string | null,
  ): string | null {
    if (scopeKey === null) return null;
    switch (scope) {
      case ExecutionControlScope.GLOBAL:
        return null;
      case ExecutionControlScope.PROVIDER:
        // Provider scope keys are public registry ids — displayed as-is.
        return scopeKey;
      case ExecutionControlScope.USER:
        return maskControlScopeTarget(scopeKey);
      case ExecutionControlScope.BROKER_CONNECTION:
        return maskControlScopeTarget(scopeKey);
      default:
        return maskControlScopeTarget(scopeKey);
    }
  }

  /** Registry catalog → admin provider entries (no adapter internals). */
  private mapProviders(): AdminProviderRegistryEntryDto[] {
    return this.providerRegistry.getCatalog().map((entry) => ({
      brokerId: entry.id,
      brokerName: entry.name,
      capabilities: [...entry.capabilities],
      supportsDemo: entry.environments.includes('DEMO'),
      supportsLive: entry.environments.includes('LIVE'),
    }));
  }

  /**
   * Single grouped count query over OPEN discrepancies by connectionId
   * (projection: brokerConnectionId only; counts grouped in memory).
   */
  private async countOpenDiscrepanciesByConnection(): Promise<Map<string, number>> {
    const rows = await this.discrepancyRepo.find({
      where: { status: ReconciliationDiscrepancyStatus.OPEN },
      select: ['brokerConnectionId'],
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.brokerConnectionId, (counts.get(row.brokerConnectionId) ?? 0) + 1);
    }
    return counts;
  }

  /** brokerConnectionId → brokerId enrichment (single connection query). */
  private async loadBrokerIds(brokerConnectionIds: string[]): Promise<Map<string, string>> {
    if (brokerConnectionIds.length === 0) return new Map();
    const uniqueIds = [...new Set(brokerConnectionIds)];
    const connections = await this.connectionRepo.find({
      where: { id: In(uniqueIds) },
      select: ['id', 'brokerId'],
    });
    return new Map(connections.map((connection) => [connection.id, connection.brokerId]));
  }

  /**
   * REUSED Sprint 50 fail-closed gate (Directive §14/§48) — delegated to
   * BrokerService.isConnectionExecutable. Never re-implemented here; a
   * throwing gate is treated as NOT executable.
   */
  private isExecutable(connection: BrokerConnection): boolean {
    try {
      return this.brokerService.isConnectionExecutable(connection) === true;
    } catch {
      return false;
    }
  }
}
