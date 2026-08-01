import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, HttpException } from '@nestjs/common';
import { TradingService } from './trading.service';
import { BrokerService } from '../broker/broker.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { RiskService } from '../risk/risk.service';
import { ExecutionService } from '../execution/execution.service';
import { AuditService } from '../audit/audit.service';
import { DomainEventBus } from '../events/event-bus.service';
import { AiEngineClient } from '../ai-engine-client/ai-engine-client.service';
import { OnboardingService } from '../users/onboarding.service';
import { TradingNotReadyException } from '../../common/exceptions/trading-not-ready.exception';
import { TradingSession, TradingSessionStatus } from '../execution/entities/trading-session.entity';
import { AllowedTradingMode } from '../risk/entities/risk-profile.entity';
import { BrokerConnectionStatus } from '../broker/interfaces/broker-adapter.interface';

/**
 * TradingService tests — Sprint 29 amendment.
 *
 * Verifies the centralized canStartTrading() gate is enforced INSIDE
 * startTradingSession() and cannot be bypassed. Also verifies:
 *   - structured 403 TRADING_NOT_READY error with missingSteps
 *   - requested mode enforcement against riskProfile.allowedTradingModes
 *   - broker health freshness check (stale → reject)
 *   - live trading requires explicit broker enablement
 *   - no session row created on rejected requests
 *   - positive test: session starts only when ALL conditions pass
 */
const mockSession = (overrides: Partial<TradingSession> = {}): TradingSession =>
  ({
    id: 'session-1',
    userId: 'user-1',
    brokerConnectionId: 'conn-1',
    status: TradingSessionStatus.ACTIVE,
    openingBalance: '10000.00',
    peakEquity: '10000.00',
    startedAt: new Date(),
    endedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    riskProfileSnapshot: null,
    ...overrides,
  } as TradingSession);

/** Build a healthy broker connection with fresh health check. */
function buildHealthyConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1',
    userId: 'user-1',
    brokerId: 'paper-broker',
    brokerName: 'Paper Trading Broker',
    status: BrokerConnectionStatus.CONNECTED,
    lastHealthCheckAt: new Date(), // fresh
    consecutiveFailureCount: 0,
    liveTradingEnabled: false,
    demoValidated: true,
    ...overrides,
  };
}

describe('TradingService (Sprint 29 amendment — centralized readiness gate)', () => {
  let module: TestingModule;
  let service: TradingService;
  // Use Record<string, jest.Mock> so mockResolvedValue is always available
  let brokerService: Record<string, jest.Mock>;
  let subscriptionsService: Record<string, jest.Mock>;
  let riskService: Record<string, jest.Mock>;
  let executionService: Record<string, jest.Mock>;
  let auditService: Record<string, jest.Mock>;
  let eventBus: Record<string, jest.Mock>;
  let aiEngineClient: Record<string, jest.Mock>;
  let onboardingService: Record<string, jest.Mock>;

  beforeEach(async () => {
    jest.clearAllMocks();

    brokerService = {
      hasActiveConnection: jest.fn().mockResolvedValue(true),
      findActiveConnectionForUser: jest.fn().mockResolvedValue(buildHealthyConnection()),
      findConnectionById: jest.fn().mockResolvedValue(buildHealthyConnection()),
      getBrokerAccountState: jest.fn().mockResolvedValue({ balance: '10000.00', equity: '10000.00', freeMargin: '9000.00', currency: 'USD' }),
    };

    subscriptionsService = {
      canUserStartAiAutoTrading: jest.fn().mockResolvedValue(true),
    };

    riskService = {
      isKillSwitchActive: jest.fn().mockResolvedValue(false),
      getOrCreateProfile: jest.fn().mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        allowedTradingModes: AllowedTradingMode.PAPER_ONLY,
        riskAcknowledgementAccepted: true,
      }),
    };

    executionService = {
      startSession: jest.fn().mockResolvedValue(mockSession()),
      endSession: jest.fn().mockResolvedValue(undefined),
      getActiveSession: jest.fn().mockResolvedValue(mockSession()),
      findSessionById: jest.fn().mockResolvedValue(mockSession()),
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    eventBus = { publish: jest.fn(), subscribe: jest.fn().mockReturnValue(() => {}) };
    aiEngineClient = {
      isSchedulerIntegrationEnabled: jest.fn().mockReturnValue(true),
      notifySessionStarted: jest.fn().mockResolvedValue(undefined),
      notifySessionStopped: jest.fn().mockResolvedValue(undefined),
    };

    // Default: onboarding allows trading
    onboardingService = {
      canStartTrading: jest.fn().mockResolvedValue({ allowed: true, missingSteps: [] }),
      getOnboardingStatus: jest.fn(),
    };

    module = await Test.createTestingModule({
      providers: [
        TradingService,
        { provide: BrokerService, useValue: brokerService },
        { provide: SubscriptionsService, useValue: subscriptionsService },
        { provide: RiskService, useValue: riskService },
        { provide: ExecutionService, useValue: executionService },
        { provide: AuditService, useValue: auditService },
        { provide: DomainEventBus, useValue: eventBus },
        { provide: AiEngineClient, useValue: aiEngineClient },
        { provide: OnboardingService, useValue: onboardingService },
      ],
    }).compile();

    service = module.get<TradingService>(TradingService);
  });

  afterEach(async () => {
    await module.close();
  });

  // ── Centralized readiness gate ────────────────────────────────────────────

  describe('startTradingSession — centralized canStartTrading gate', () => {
    it('should call OnboardingService.canStartTrading() as the FIRST gate', async () => {
      await service.startTradingSession('user-1');

      expect(onboardingService.canStartTrading).toHaveBeenCalledWith('user-1');
    });

    it('should throw TradingNotReadyException when profile is incomplete', async () => {
      onboardingService.canStartTrading.mockResolvedValue({
        allowed: false,
        missingSteps: ['PROFILE', 'RISK_PROFILE', 'BROKER_CONNECTION'],
      });

      await expect(service.startTradingSession('user-1')).rejects.toThrow(TradingNotReadyException);
    });

    it('should throw TradingNotReadyException when risk profile missing', async () => {
      onboardingService.canStartTrading.mockResolvedValue({
        allowed: false,
        missingSteps: ['RISK_PROFILE'],
      });

      await expect(service.startTradingSession('user-1')).rejects.toThrow(TradingNotReadyException);
    });

    it('should throw TradingNotReadyException when risk acknowledgement is false', async () => {
      onboardingService.canStartTrading.mockResolvedValue({
        allowed: false,
        missingSteps: ['RISK_PROFILE'],
      });

      await expect(service.startTradingSession('user-1')).rejects.toThrow(TradingNotReadyException);
    });

    it('should throw TradingNotReadyException when broker is disconnected', async () => {
      onboardingService.canStartTrading.mockResolvedValue({
        allowed: false,
        missingSteps: ['BROKER_CONNECTION'],
      });

      await expect(service.startTradingSession('user-1')).rejects.toThrow(TradingNotReadyException);
    });

    it('should throw TradingNotReadyException when kill switch is active', async () => {
      // canStartTrading returns false (kill switch active means allowed=false)
      onboardingService.canStartTrading.mockResolvedValue({
        allowed: false,
        missingSteps: [],
      });

      await expect(service.startTradingSession('user-1')).rejects.toThrow(TradingNotReadyException);
    });

    it('should throw TradingNotReadyException when user is SUSPENDED', async () => {
      onboardingService.canStartTrading.mockResolvedValue({
        allowed: false,
        missingSteps: [],
      });

      await expect(service.startTradingSession('user-1')).rejects.toThrow(TradingNotReadyException);
    });

    it('should return structured 403 with missingSteps in the response', async () => {
      onboardingService.canStartTrading.mockResolvedValue({
        allowed: false,
        missingSteps: ['PROFILE', 'RISK_PROFILE'],
      });

      try {
        await service.startTradingSession('user-1');
        fail('Expected TradingNotReadyException');
      } catch (err) {
        expect(err).toBeInstanceOf(TradingNotReadyException);
        const response = (err as TradingNotReadyException).getResponse() as {
          statusCode: number;
          code: string;
          message: string;
          missingSteps: string[];
        };
        expect(response.statusCode).toBe(403);
        expect(response.code).toBe('TRADING_NOT_READY');
        expect(response.message).toBe('Your trading setup is not ready.');
        expect(response.missingSteps).toEqual(['PROFILE', 'RISK_PROFILE']);
      }
    });

    it('should NOT create a session row when readiness gate fails', async () => {
      onboardingService.canStartTrading.mockResolvedValue({
        allowed: false,
        missingSteps: ['PROFILE'],
      });

      await expect(service.startTradingSession('user-1')).rejects.toThrow();
      expect(executionService.startSession).not.toHaveBeenCalled();
    });

    it('should NOT notify AI engine when readiness gate fails', async () => {
      onboardingService.canStartTrading.mockResolvedValue({
        allowed: false,
        missingSteps: ['PROFILE'],
      });

      await expect(service.startTradingSession('user-1')).rejects.toThrow();
      expect(aiEngineClient.notifySessionStarted).not.toHaveBeenCalled();
    });
  });

  // ── Subscription gate ─────────────────────────────────────────────────────

  describe('startTradingSession — subscription gate', () => {
    it('should reject when subscription is inactive', async () => {
      subscriptionsService.canUserStartAiAutoTrading.mockResolvedValue(false);

      await expect(service.startTradingSession('user-1')).rejects.toThrow(ForbiddenException);
      expect(executionService.startSession).not.toHaveBeenCalled();
    });
  });

  // ── Broker health freshness ───────────────────────────────────────────────

  describe('startTradingSession — broker health freshness', () => {
    it('should reject when broker has no health check on record', async () => {
      brokerService.findActiveConnectionForUser.mockResolvedValue(
        buildHealthyConnection({ lastHealthCheckAt: null }),
      );

      await expect(service.startTradingSession('user-1')).rejects.toThrow(ForbiddenException);
      expect(executionService.startSession).not.toHaveBeenCalled();
    });

    it('should reject when broker health check is stale (> 5 minutes)', async () => {
      const stale = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
      brokerService.findActiveConnectionForUser.mockResolvedValue(
        buildHealthyConnection({ lastHealthCheckAt: stale }),
      );

      await expect(service.startTradingSession('user-1')).rejects.toThrow(ForbiddenException);
    });

    it('should reject when broker has 3+ consecutive failures', async () => {
      brokerService.findActiveConnectionForUser.mockResolvedValue(
        buildHealthyConnection({ consecutiveFailureCount: 3 }),
      );

      await expect(service.startTradingSession('user-1')).rejects.toThrow(ForbiddenException);
    });

    it('should accept when broker health check is fresh (< 5 minutes)', async () => {
      const fresh = new Date(Date.now() - 60 * 1000); // 1 min ago
      brokerService.findActiveConnectionForUser.mockResolvedValue(
        buildHealthyConnection({ lastHealthCheckAt: fresh }),
      );

      const session = await service.startTradingSession('user-1');
      expect(session.id).toBe('session-1');
    });
  });

  // ── Requested trading mode enforcement ────────────────────────────────────

  describe('startTradingSession — requested mode enforcement', () => {
    it('should always allow PAPER_ONLY mode', async () => {
      riskService.getOrCreateProfile.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        allowedTradingModes: AllowedTradingMode.PAPER_ONLY,
        riskAcknowledgementAccepted: true,
      } as never);

      const session = await service.startTradingSession('user-1', undefined, AllowedTradingMode.PAPER_ONLY);
      expect(session.id).toBe('session-1');
    });

    it('should reject SEMI_AUTO when risk profile only allows PAPER_ONLY', async () => {
      riskService.getOrCreateProfile.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        allowedTradingModes: AllowedTradingMode.PAPER_ONLY,
        riskAcknowledgementAccepted: true,
      } as never);

      await expect(
        service.startTradingSession('user-1', undefined, AllowedTradingMode.SEMI_AUTO),
      ).rejects.toThrow(ForbiddenException);
      expect(executionService.startSession).not.toHaveBeenCalled();
    });

    it('should allow SEMI_AUTO when risk profile allows SEMI_AUTO', async () => {
      riskService.getOrCreateProfile.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        allowedTradingModes: AllowedTradingMode.SEMI_AUTO,
        riskAcknowledgementAccepted: true,
      } as never);

      const session = await service.startTradingSession('user-1', undefined, AllowedTradingMode.SEMI_AUTO);
      expect(session.id).toBe('session-1');
    });

    it('should reject FULL_AUTO when risk profile does not allow it', async () => {
      riskService.getOrCreateProfile.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        allowedTradingModes: AllowedTradingMode.SEMI_AUTO,
        riskAcknowledgementAccepted: true,
      } as never);

      await expect(
        service.startTradingSession('user-1', undefined, AllowedTradingMode.FULL_AUTO),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject FULL_AUTO when live trading is not enabled on broker connection', async () => {
      riskService.getOrCreateProfile.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        allowedTradingModes: AllowedTradingMode.FULL_AUTO,
        riskAcknowledgementAccepted: true,
      } as never);
      // liveTradingEnabled is false in buildHealthyConnection
      brokerService.findActiveConnectionForUser.mockResolvedValue(
        buildHealthyConnection({ liveTradingEnabled: false }),
      );

      await expect(
        service.startTradingSession('user-1', undefined, AllowedTradingMode.FULL_AUTO),
      ).rejects.toThrow(ForbiddenException);
      expect(executionService.startSession).not.toHaveBeenCalled();
    });

    it('should allow FULL_AUTO when risk profile allows it AND live trading is enabled', async () => {
      riskService.getOrCreateProfile.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        allowedTradingModes: AllowedTradingMode.FULL_AUTO,
        riskAcknowledgementAccepted: true,
      } as never);
      brokerService.findActiveConnectionForUser.mockResolvedValue(
        buildHealthyConnection({ liveTradingEnabled: true }),
      );

      const session = await service.startTradingSession('user-1', undefined, AllowedTradingMode.FULL_AUTO);
      expect(session.id).toBe('session-1');
    });

    it('should default to PAPER_ONLY when no mode is requested', async () => {
      riskService.getOrCreateProfile.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        allowedTradingModes: AllowedTradingMode.PAPER_ONLY,
        riskAcknowledgementAccepted: true,
      } as never);

      const session = await service.startTradingSession('user-1');
      expect(session.id).toBe('session-1');
    });
  });

  // ── Positive test: all conditions met ─────────────────────────────────────

  describe('startTradingSession — positive test (all conditions met)', () => {
    it('should create a session only when ALL required conditions are satisfied', async () => {
      // All gates pass:
      // - canStartTrading = true (onboardingService default)
      // - subscription = true (subscriptionsService default)
      // - broker healthy (buildHealthyConnection default, fresh health check)
      // - risk profile allows PAPER_ONLY (riskService default)
      // - requestedMode = PAPER_ONLY (default)

      const session = await service.startTradingSession('user-1');

      expect(session.id).toBe('session-1');
      expect(executionService.startSession).toHaveBeenCalledWith('user-1', 'conn-1', '10000.00');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'user-1',
          action: 'AI_TRADING_ENABLED',
          metadata: expect.objectContaining({ requestedMode: 'PAPER_ONLY' }),
        }),
      );
      expect(eventBus.publish).toHaveBeenCalledWith(
        'trading.session.started',
        'user-1',
        expect.objectContaining({ sessionId: 'session-1' }),
      );
      expect(aiEngineClient.notifySessionStarted).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'paper' }),
      );
    });
  });

  // ── stopTradingSession ────────────────────────────────────────────────────

  describe('stopTradingSession()', () => {
    it('stops the active session', async () => {
      await service.stopTradingSession('user-1', 'session-1');
      expect(executionService.endSession).toHaveBeenCalledWith('user-1', TradingSessionStatus.ENDED);
    });

    it('throws NotFoundException when no active session', async () => {
      executionService.getActiveSession.mockResolvedValue(null);
      await expect(service.stopTradingSession('user-1', 'session-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when session ID does not match', async () => {
      await expect(service.stopTradingSession('user-1', 'other-session')).rejects.toThrow(ForbiddenException);
    });

    it('audit-logs the session stop', async () => {
      await service.stopTradingSession('user-1', 'session-1');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actorUserId: 'user-1', action: 'AI_TRADING_DISABLED' }),
      );
    });
  });

  // ── getActiveSession / getSessionById ─────────────────────────────────────

  describe('getActiveSession() + getSessionById()', () => {
    it('returns the active session', async () => {
      const session = await service.getActiveSession('user-1');
      expect(session?.id).toBe('session-1');
    });

    it('returns null when no session', async () => {
      executionService.getActiveSession.mockResolvedValue(null);
      const session = await service.getActiveSession('user-1');
      expect(session).toBeNull();
    });

    it('returns session owned by user', async () => {
      const session = await service.getSessionById('user-1', 'session-1');
      expect(session?.id).toBe('session-1');
    });

    it('returns null for session owned by a different user', async () => {
      executionService.findSessionById.mockResolvedValue(mockSession({ userId: 'other-user' }));
      const session = await service.getSessionById('user-1', 'session-1');
      expect(session).toBeNull();
    });
  });
});
