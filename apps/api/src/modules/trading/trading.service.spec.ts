import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TradingService } from './trading.service';
import { BrokerService } from '../broker/broker.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { RiskService } from '../risk/risk.service';
import { ExecutionService } from '../execution/execution.service';
import { AuditService } from '../audit/audit.service';
import { DomainEventBus } from '../events/event-bus.service';
import { TradingSession, TradingSessionStatus } from '../execution/entities/trading-session.entity';

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

describe('TradingService', () => {
  let module: TestingModule;
  let service: TradingService;
  let brokerService: jest.Mocked<Partial<BrokerService>>;
  let subscriptionsService: jest.Mocked<Partial<SubscriptionsService>>;
  let riskService: jest.Mocked<Partial<RiskService>>;
  let executionService: jest.Mocked<Partial<ExecutionService>>;
  let auditService: jest.Mocked<Partial<AuditService>>;
  let eventBus: jest.Mocked<Partial<DomainEventBus>>;

  beforeEach(async () => {
    jest.clearAllMocks();

    brokerService = {
      hasActiveConnection: jest.fn().mockResolvedValue(true),
      findActiveConnectionForUser: jest.fn().mockResolvedValue({ id: 'conn-1' }),
      getBrokerAccountState: jest.fn().mockResolvedValue({ balance: '10000.00', equity: '10000.00', freeMargin: '9000.00', currency: 'USD' }),
    };

    subscriptionsService = {
      canUserStartAiAutoTrading: jest.fn().mockResolvedValue(true),
    };

    riskService = {
      isKillSwitchActive: jest.fn().mockResolvedValue(false),
      getOrCreateProfile: jest.fn().mockResolvedValue({ id: 'profile-1', userId: 'user-1' }),
    };

    executionService = {
      startSession: jest.fn().mockResolvedValue(mockSession()),
      endSession: jest.fn().mockResolvedValue(undefined),
      getActiveSession: jest.fn().mockResolvedValue(mockSession()),
      findSessionById: jest.fn().mockResolvedValue(mockSession()),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    eventBus = {
      publish: jest.fn(),
      subscribe: jest.fn().mockReturnValue(() => {}),
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
      ],
    }).compile();

    service = module.get<TradingService>(TradingService);
  });

  afterEach(async () => {
    await module.close();
  });

  // ─── assertBrokerGate() ──────────────────────────────────────────────────────

  describe('assertBrokerGate()', () => {
    it('passes when user has an active broker connection', async () => {
      await expect(service.assertBrokerGate('user-1')).resolves.not.toThrow();
    });

    it('throws ForbiddenException when no active broker connection', async () => {
      (brokerService.hasActiveConnection as jest.Mock).mockResolvedValue(false);
      await expect(service.assertBrokerGate('user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── startTradingSession() ──────────────────────────────────────────────────

  describe('startTradingSession()', () => {
    it('creates a session when all gates pass', async () => {
      const session = await service.startTradingSession('user-1');
      expect(session.id).toBe('session-1');
      expect(executionService.startSession).toHaveBeenCalledWith('user-1', 'conn-1', '10000.00');
    });

    it('emits TRADING_SESSION_STARTED domain event', async () => {
      await service.startTradingSession('user-1');
      expect(eventBus.publish).toHaveBeenCalledWith(
        'trading.session.started',
        'user-1',
        expect.objectContaining({ sessionId: 'session-1' }),
      );
    });

    it('rejects when subscription does not allow AI auto trading', async () => {
      (subscriptionsService.canUserStartAiAutoTrading as jest.Mock).mockResolvedValue(false);
      await expect(service.startTradingSession('user-1')).rejects.toThrow(ForbiddenException);
    });

    it('rejects when no active broker connection', async () => {
      (brokerService.hasActiveConnection as jest.Mock).mockResolvedValue(false);
      await expect(service.startTradingSession('user-1')).rejects.toThrow(ForbiddenException);
    });

    it('rejects when kill switch is active', async () => {
      (riskService.isKillSwitchActive as jest.Mock).mockResolvedValue(true);
      await expect(service.startTradingSession('user-1')).rejects.toThrow(ForbiddenException);
    });

    it('audit-logs the session start', async () => {
      await service.startTradingSession('user-1');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actorUserId: 'user-1', action: 'AI_TRADING_ENABLED' }),
      );
    });
  });

  // ─── stopTradingSession() ───────────────────────────────────────────────────

  describe('stopTradingSession()', () => {
    it('stops the active session', async () => {
      await service.stopTradingSession('user-1', 'session-1');
      expect(executionService.endSession).toHaveBeenCalledWith('user-1', TradingSessionStatus.ENDED);
    });

    it('emits TRADING_SESSION_STOPPED domain event', async () => {
      await service.stopTradingSession('user-1', 'session-1');
      expect(eventBus.publish).toHaveBeenCalledWith(
        'trading.session.stopped',
        'user-1',
        expect.objectContaining({ sessionId: 'session-1' }),
      );
    });

    it('throws NotFoundException when no active session', async () => {
      (executionService.getActiveSession as jest.Mock).mockResolvedValue(null);
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

  // ─── getActiveSession() ─────────────────────────────────────────────────────

  describe('getActiveSession()', () => {
    it('returns the active session', async () => {
      const session = await service.getActiveSession('user-1');
      expect(session?.id).toBe('session-1');
    });

    it('returns null when no session', async () => {
      (executionService.getActiveSession as jest.Mock).mockResolvedValue(null);
      const session = await service.getActiveSession('user-1');
      expect(session).toBeNull();
    });
  });

  // ─── getSessionById() ───────────────────────────────────────────────────────

  describe('getSessionById()', () => {
    it('returns session owned by user', async () => {
      const session = await service.getSessionById('user-1', 'session-1');
      expect(session?.id).toBe('session-1');
    });

    it('returns null for session owned by a different user', async () => {
      (executionService.findSessionById as jest.Mock).mockResolvedValue(
        mockSession({ userId: 'other-user' }),
      );
      const session = await service.getSessionById('user-1', 'session-1');
      expect(session).toBeNull();
    });
  });
});
