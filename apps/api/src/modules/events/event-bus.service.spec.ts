import { Test, TestingModule } from '@nestjs/testing';
import { DomainEventBus } from './event-bus.service';
import { DomainEventType } from './enums/domain-event-type.enum';

describe('DomainEventBus', () => {
  let module: TestingModule;
  let eventBus: DomainEventBus;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [DomainEventBus],
    }).compile();

    eventBus = module.get<DomainEventBus>(DomainEventBus);
  });

  afterEach(async () => {
    await module.close();
  });

  it('publishes and receives an event', (done) => {
    const payload = { sessionId: 'session-1', userId: 'user-1', status: 'ACTIVE' };

    eventBus.subscribe(DomainEventType.TRADING_SESSION_STARTED, (event) => {
      expect(event.type).toBe(DomainEventType.TRADING_SESSION_STARTED);
      expect(event.userId).toBe('user-1');
      expect(event.payload).toMatchObject(payload);
      expect(event.timestamp).toBeInstanceOf(Date);
      done();
    });

    eventBus.publish(DomainEventType.TRADING_SESSION_STARTED, 'user-1', payload);
  });

  it('unsubscribes correctly and stops receiving events', () => {
    const handler = jest.fn();
    const unsub = eventBus.subscribe(DomainEventType.TRADE_OPENED, handler);

    eventBus.publish(DomainEventType.TRADE_OPENED, 'u1', { tradeId: 't1' });
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    eventBus.publish(DomainEventType.TRADE_OPENED, 'u1', { tradeId: 't2' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('supports multiple subscribers for the same event', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    eventBus.subscribe(DomainEventType.RISK_SIGNAL_REJECTED, handler1);
    eventBus.subscribe(DomainEventType.RISK_SIGNAL_REJECTED, handler2);

    eventBus.publish(DomainEventType.RISK_SIGNAL_REJECTED, 'u1', { rejectionCode: 'KILL_SWITCH' });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('events for one type do not trigger handlers for another type', () => {
    const tradeHandler = jest.fn();
    const riskHandler = jest.fn();

    eventBus.subscribe(DomainEventType.TRADE_OPENED, tradeHandler);
    eventBus.subscribe(DomainEventType.RISK_SIGNAL_APPROVED, riskHandler);

    eventBus.publish(DomainEventType.TRADE_OPENED, 'u1', {});

    expect(tradeHandler).toHaveBeenCalledTimes(1);
    expect(riskHandler).not.toHaveBeenCalled();
  });

  it('cleans up all listeners on onModuleDestroy', () => {
    const handler = jest.fn();
    eventBus.subscribe(DomainEventType.BROKER_STATUS_CHANGED, handler);

    eventBus.onModuleDestroy();

    eventBus.publish(DomainEventType.BROKER_STATUS_CHANGED, 'u1', {});
    expect(handler).not.toHaveBeenCalled();
  });
});
