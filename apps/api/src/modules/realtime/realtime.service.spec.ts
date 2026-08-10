import { Test, TestingModule } from '@nestjs/testing';
import { RealtimeService } from './realtime.service';
import { DomainEventBus } from '../events/event-bus.service';
import { DomainEventType } from '../events/enums/domain-event-type.enum';
import { RealtimeEvent } from './events/realtime-event.enum';

describe('RealtimeService', () => {
  let module: TestingModule;
  let service: RealtimeService;
  let eventBus: DomainEventBus;
  let mockServer: { to: jest.Mock; emit: jest.Mock };
  let mockRoom: { emit: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [RealtimeService, DomainEventBus],
    }).compile();

    service = module.get<RealtimeService>(RealtimeService);
    eventBus = module.get<DomainEventBus>(DomainEventBus);

    mockRoom = { emit: jest.fn() };
    mockServer = { to: jest.fn().mockReturnValue(mockRoom), emit: jest.fn() };

    service.setServer(mockServer as never);
    service.onModuleInit();
  });

  afterEach(async () => {
    await module.close();
  });

  describe('emitToUser()', () => {
    it('emits event to user room', () => {
      service.emitToUser('user-1', RealtimeEvent.TRADE_OPENED, { tradeId: 't1' });
      expect(mockServer.to).toHaveBeenCalledWith('user:user-1');
      expect(mockRoom.emit).toHaveBeenCalledWith(RealtimeEvent.TRADE_OPENED, { tradeId: 't1' });
    });

    it('does not throw when server is not set', () => {
      service.setServer(null as never);
      expect(() => service.emitToUser('user-1', RealtimeEvent.TRADE_OPENED, {})).not.toThrow();
    });
  });

  describe('emitToTradingSession()', () => {
    it('emits event to session room', () => {
      service.emitToTradingSession('session-1', RealtimeEvent.TRADE_OPENED, { tradeId: 't1' });
      expect(mockServer.to).toHaveBeenCalledWith('trading-session:session-1');
      expect(mockRoom.emit).toHaveBeenCalledWith(RealtimeEvent.TRADE_OPENED, { tradeId: 't1' });
    });
  });

  describe('emitToAdmins()', () => {
    it('emits event to admin:global room', () => {
      service.emitToAdmins(RealtimeEvent.SYSTEM_NOTIFICATION, { title: 'Test' });
      expect(mockServer.to).toHaveBeenCalledWith('admin:global');
      expect(mockRoom.emit).toHaveBeenCalledWith(RealtimeEvent.SYSTEM_NOTIFICATION, {
        title: 'Test',
      });
    });
  });

  describe('DomainEventBus subscriptions', () => {
    it('forwards TRADING_SESSION_STARTED to user room', () => {
      eventBus.publish(DomainEventType.TRADING_SESSION_STARTED, 'user-1', {
        sessionId: 'sess-1',
        brokerConnectionId: 'conn-1',
        status: 'ACTIVE',
        startedAt: new Date(),
      });
      expect(mockServer.to).toHaveBeenCalledWith('user:user-1');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        RealtimeEvent.TRADING_SESSION_STARTED,
        expect.objectContaining({ sessionId: 'sess-1', status: 'ACTIVE' }),
      );
    });

    it('forwards TRADE_OPENED to user room (safe payload — no secrets)', () => {
      eventBus.publish(DomainEventType.TRADE_OPENED, 'user-1', {
        tradeId: 't-1',
        instrument: 'EURUSD',
        direction: 'BUY',
        volume: '0.05',
        entryPrice: '1.08500',
        status: 'OPEN',
      });
      const emittedPayload = mockRoom.emit.mock.calls[0][1] as Record<string, unknown>;
      expect(emittedPayload).toHaveProperty('tradeId');
      expect(emittedPayload).toHaveProperty('instrument');
      // Verify no sensitive fields
      expect(emittedPayload).not.toHaveProperty('encryptedCredentials');
      expect(emittedPayload).not.toHaveProperty('credentialIv');
      expect(emittedPayload).not.toHaveProperty('accessToken');
      expect(emittedPayload).not.toHaveProperty('refreshToken');
    });

    it('forwards RISK_SIGNAL_REJECTED to user room', () => {
      eventBus.publish(DomainEventType.RISK_SIGNAL_REJECTED, 'user-1', {
        userId: 'user-1',
        instrument: 'EURUSD',
        direction: 'BUY',
        decision: 'REJECTED',
        rejectionCode: 'KILL_SWITCH_ACTIVE',
        rejectionReason: 'Kill switch is active',
      });
      expect(mockRoom.emit).toHaveBeenCalledWith(
        RealtimeEvent.RISK_SIGNAL_REJECTED,
        expect.objectContaining({ decision: 'REJECTED', rejectionCode: 'KILL_SWITCH_ACTIVE' }),
      );
    });

    it('forwards BROKER_STATUS_CHANGED to user room', () => {
      eventBus.publish(DomainEventType.BROKER_STATUS_CHANGED, 'user-1', {
        userId: 'user-1',
        connectionId: 'conn-1',
        status: 'SUSPENDED',
        previousStatus: 'CONNECTED',
        reason: 'Health check failures',
      });
      expect(mockRoom.emit).toHaveBeenCalledWith(
        RealtimeEvent.BROKER_CONNECTION_STATUS_CHANGED,
        expect.objectContaining({ connectionId: 'conn-1', status: 'SUSPENDED' }),
      );
    });

    it('cleans up subscriptions on onModuleDestroy', () => {
      service.onModuleDestroy();
      mockRoom.emit.mockClear();
      eventBus.publish(DomainEventType.TRADING_SESSION_STARTED, 'user-1', {});
      expect(mockRoom.emit).not.toHaveBeenCalled();
    });
  });
});
