import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { MetaTraderAdapter } from './metatrader.adapter';
import { MetaApiClientService } from '../services/metaapi-client.service';
import { BrokerMode, RequiredMarginParams } from '../interfaces/broker-adapter.interface';

/**
 * Sprint 32 Gate 4 — MetaTraderAdapter.getRequiredMargin tests.
 *
 * Tests the provider-native MetaAPI calculate-margin mapping:
 *   BUY → ORDER_TYPE_BUY
 *   SELL → ORDER_TYPE_SELL
 *   volume → validated lot size
 *   openPrice → current broker price (ask for BUY, bid for SELL)
 *
 * Tests fail-closed behavior for all error cases.
 */

describe('MetaTraderAdapter — getRequiredMargin (Gate 4)', () => {
  let adapter: MetaTraderAdapter;
  let metaApiClient: {
    calculateMargin: jest.Mock;
    getOrCreateConnection: jest.Mock;
  };

  beforeEach(async () => {
    const mockConn = {
      subscribeToMarketData: jest.fn().mockResolvedValue(undefined),
      unsubscribeFromMarketData: jest.fn().mockResolvedValue(undefined),
      getSymbolPrice: jest.fn().mockResolvedValue({ bid: 1.084, ask: 1.085 }),
      calculateMargin: jest.fn(),
    };

    metaApiClient = {
      calculateMargin: jest.fn(),
      getOrCreateConnection: jest.fn().mockResolvedValue(mockConn),
    };

    // Store mockConn for per-test assertion access
    (metaApiClient as unknown as { _mockConn: typeof mockConn })._mockConn = mockConn;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaTraderAdapter,
        { provide: MetaApiClientService, useValue: metaApiClient },
        { provide: Logger, useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    adapter = module.get(MetaTraderAdapter);
    adapter.setMode(BrokerMode.LIVE);
    // Simulate a connected adapter
    (adapter as unknown as { currentAccountId: string }).currentAccountId = 'test-account-id';
  });

  // mock conn is stored in the metaApiClient mock for per-test access

  // ── Native order mapping ─────────────────────────────────────────────────

  it('maps BUY → ORDER_TYPE_BUY with correct volume + openPrice (ask)', async () => {
    metaApiClient.calculateMargin.mockResolvedValue('125.50');

    const params: RequiredMarginParams = {
      instrument: 'EURUSD',
      lotSize: '0.10',
      direction: 'BUY',
    };

    const result = await adapter.getRequiredMargin(params);

    expect(result).toBe('125.50');
    // Verify the MetaAPI calculateMargin was called with the correct mapping
    expect(metaApiClient.calculateMargin).toHaveBeenCalledWith(
      'test-account-id',
      expect.objectContaining({
        symbol: 'EURUSD',
        type: 'ORDER_TYPE_BUY',
        volume: 0.1,
        openPrice: 1.085, // ask price for BUY
      }),
    );
  });

  it('maps SELL → ORDER_TYPE_SELL with correct volume + openPrice (bid)', async () => {
    metaApiClient.calculateMargin.mockResolvedValue('125.50');

    const params: RequiredMarginParams = {
      instrument: 'EURUSD',
      lotSize: '0.10',
      direction: 'SELL',
    };

    const result = await adapter.getRequiredMargin(params);

    expect(result).toBe('125.50');
    expect(metaApiClient.calculateMargin).toHaveBeenCalledWith(
      'test-account-id',
      expect.objectContaining({
        symbol: 'EURUSD',
        type: 'ORDER_TYPE_SELL',
        volume: 0.1,
        openPrice: 1.084, // bid price for SELL
      }),
    );
  });

  // ── Fail-closed cases ─────────────────────────────────────────────────────

  it('returns null when MetaAPI calculateMargin returns null', async () => {
    metaApiClient.calculateMargin.mockResolvedValue(null);

    const result = await adapter.getRequiredMargin({
      instrument: 'EURUSD',
      lotSize: '0.10',
      direction: 'BUY',
    });

    expect(result).toBeNull();
  });

  it('returns null when MetaAPI calculateMargin returns undefined', async () => {
    metaApiClient.calculateMargin.mockResolvedValue(undefined);

    const result = await adapter.getRequiredMargin({
      instrument: 'EURUSD',
      lotSize: '0.10',
      direction: 'BUY',
    });

    expect(result).toBeNull();
  });

  it('returns null when MetaAPI calculateMargin throws (provider error)', async () => {
    metaApiClient.calculateMargin.mockRejectedValue(new Error('MetaAPI timeout'));

    const result = await adapter.getRequiredMargin({
      instrument: 'EURUSD',
      lotSize: '0.10',
      direction: 'BUY',
    });

    expect(result).toBeNull();
  });

  it('returns null when no accountId is set (not connected)', async () => {
    (adapter as unknown as { currentAccountId: string }).currentAccountId = '';

    const result = await adapter.getRequiredMargin({
      instrument: 'EURUSD',
      lotSize: '0.10',
      direction: 'BUY',
    });

    expect(result).toBeNull();
  });

  // ── Proof: no generic formula / no default contractSize ───────────────────

  it('does NOT call getInstrumentList for margin calculation (no generic formula)', async () => {
    metaApiClient.calculateMargin.mockResolvedValue('100.00');

    const spy = jest.spyOn(adapter, 'getInstrumentList');

    await adapter.getRequiredMargin({
      instrument: 'EURUSD',
      lotSize: '0.10',
      direction: 'BUY',
    });

    // getInstrumentList should NOT be called — we use native calculateMargin
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does NOT use a local leverage formula (calls MetaAPI native API)', async () => {
    metaApiClient.calculateMargin.mockResolvedValue('250.00');

    await adapter.getRequiredMargin({
      instrument: 'GBPUSD',
      lotSize: '0.50',
      direction: 'BUY',
    });

    // The result comes from metaApiClient.calculateMargin — NOT a local formula
    expect(metaApiClient.calculateMargin).toHaveBeenCalledTimes(1);
  });
});
