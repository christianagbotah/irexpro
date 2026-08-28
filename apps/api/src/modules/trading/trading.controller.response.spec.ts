import { TradingController } from './trading.controller';
import { TradingService } from './trading.service';
import { TradingSessionStatus } from '../execution/entities/trading-session.entity';

/**
 * Regression coverage for the browser-facing session contract.
 *
 * The TradingService owns the full persistence entity, but the controller must
 * never return internal identity, financial-session, or audit-snapshot fields
 * to frontend clients.
 */
describe('TradingController frontend-safe session response', () => {
  const USER_ID = '11111111-1111-4111-8111-111111111111';
  const SESSION_ID = '22222222-2222-4222-8222-222222222222';
  const BROKER_CONNECTION_ID = '33333333-3333-4333-8333-333333333333';
  const now = new Date('2026-08-28T18:00:00.000Z');

  const internalSession = {
    id: SESSION_ID,
    userId: USER_ID,
    brokerConnectionId: BROKER_CONNECTION_ID,
    status: TradingSessionStatus.ACTIVE,
    openingBalance: '10000.00',
    peakEquity: '10500.00',
    riskProfileSnapshot: {
      maxDailyLossPercent: '5',
      internalAuditMarker: 'must-not-leak',
    },
    startedAt: now,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  function buildController() {
    const tradingService = {
      startTradingSession: jest.fn().mockResolvedValue(internalSession),
      stopTradingSession: jest.fn().mockResolvedValue(undefined),
      getActiveSession: jest.fn().mockResolvedValue(internalSession),
      getSessionById: jest.fn().mockResolvedValue(internalSession),
    };

    return {
      controller: new TradingController(tradingService as unknown as TradingService),
      tradingService,
    };
  }

  function expectSafeSession(response: object) {
    expect(response).toEqual({
      id: SESSION_ID,
      brokerConnectionId: BROKER_CONNECTION_ID,
      status: TradingSessionStatus.ACTIVE,
      startedAt: now,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    expect(response).not.toHaveProperty('userId');
    expect(response).not.toHaveProperty('openingBalance');
    expect(response).not.toHaveProperty('peakEquity');
    expect(response).not.toHaveProperty('riskProfileSnapshot');
  }

  it('sanitizes the session returned by start', async () => {
    const { controller } = buildController();
    const response = await controller.startSession(USER_ID, {});
    expectSafeSession(response);
  });

  it('sanitizes the current active session', async () => {
    const { controller } = buildController();
    const response = await controller.getActive(USER_ID);
    expect(response).not.toBeNull();
    expectSafeSession(response!);
  });

  it('returns null when there is no active session', async () => {
    const tradingService = {
      getActiveSession: jest.fn().mockResolvedValue(null),
    };
    const controller = new TradingController(tradingService as unknown as TradingService);

    await expect(controller.getActive(USER_ID)).resolves.toBeNull();
  });

  it('sanitizes a session returned by id', async () => {
    const { controller } = buildController();
    const response = await controller.getById(USER_ID, SESSION_ID);
    expectSafeSession(response);
  });
});
