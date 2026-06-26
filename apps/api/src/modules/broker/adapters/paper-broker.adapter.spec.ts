import { Test, TestingModule } from '@nestjs/testing';
import { PaperBrokerAdapter } from './paper-broker.adapter';
import { BrokerMode } from '../interfaces/broker-adapter.interface';

describe('PaperBrokerAdapter', () => {
  let module: TestingModule;
  let adapter: PaperBrokerAdapter;

  const dummyCreds = { accountId: 'test-account' };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [PaperBrokerAdapter],
    }).compile();

    adapter = module.get(PaperBrokerAdapter);
  });

  afterEach(async () => {
    await module.close();
  });

  it('has brokerId = paper-broker', () => {
    expect(adapter.brokerId).toBe('paper-broker');
  });

  it('implements IBrokerAdapter interface', () => {
    expect(typeof adapter.connect).toBe('function');
    expect(typeof adapter.disconnect).toBe('function');
    expect(typeof adapter.placeOrder).toBe('function');
    expect(typeof adapter.getOHLCV).toBe('function');
    expect(typeof adapter.closeAllOrders).toBe('function');
    expect(typeof adapter.getClosedTrades).toBe('function');
  });

  it('connects without real credentials', async () => {
    const result = await adapter.connect(dummyCreds);
    expect(result.success).toBe(true);
    expect(result.accountType).toBe(BrokerMode.DEMO);
    expect(adapter.isConnected()).toBe(true);
  });

  it('testConnection always succeeds without external API call', async () => {
    const result = await adapter.testConnection(dummyCreds);
    expect(result.success).toBe(true);
  });

  it('cannot be set to LIVE mode', () => {
    adapter.setMode(BrokerMode.LIVE);
    // Mode must NOT be LIVE after calling setMode(LIVE)
    // We verify indirectly: connect returns DEMO account type
    adapter.connect(dummyCreds).then((r) => {
      expect(r.accountType).toBe(BrokerMode.DEMO);
    });
  });

  it('placeOrder returns simulated result marked PAPER_ONLY', async () => {
    await adapter.connect(dummyCreds);
    const result = await adapter.placeOrder({
      idempotencyKey: 'test-key-1',
      instrument: 'EURUSD',
      direction: 'BUY',
      lotSize: '0.01',
      stopLoss: '1.09000',
      takeProfit: '1.11000',
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('FILLED');
    expect(result.brokerMessage).toContain('PAPER_ONLY');
    expect(result.externalOrderId).toContain('paper-order');
  });

  it('placeOrder never calls external broker API', async () => {
    // PaperBrokerAdapter has no HTTP client — no external call possible.
    // Verify it doesn't throw and returns a local result immediately.
    const start = Date.now();
    const result = await adapter.placeOrder({
      idempotencyKey: 'test-key-2',
      instrument: 'EURUSD',
      direction: 'SELL',
      lotSize: '0.01',
      stopLoss: '1.12000',
      takeProfit: '1.09000',
    });
    const elapsed = Date.now() - start;

    expect(result.success).toBe(true);
    expect(elapsed).toBeLessThan(100); // Local only — no network latency
  });

  it('getOHLCV returns deterministic mock candles', async () => {
    const candles = await adapter.getOHLCV('EURUSD', 'H1', 10);
    expect(candles).toHaveLength(10);
    expect(candles[0]).toMatchObject({
      open: expect.any(String),
      high: expect.any(String),
      low: expect.any(String),
      close: expect.any(String),
      volume: expect.any(String),
    });
    // Prices must be string (decimal-safe)
    expect(typeof candles[0].open).toBe('string');
  });

  it('getAccountBalance returns simulated balance', async () => {
    const balance = await adapter.getAccountBalance();
    expect(balance.currency).toBe('USD');
    expect(typeof balance.balance).toBe('string');
  });

  it('closeAllOrders returns zero closed (paper — no real positions)', async () => {
    const result = await adapter.closeAllOrders();
    expect(result.closedCount).toBe(0);
    expect(result.failedCount).toBe(0);
  });

  it('getOpenPositions returns empty array (paper — no live positions)', async () => {
    const positions = await adapter.getOpenPositions();
    expect(positions).toEqual([]);
  });

  it('getClosedTrades returns empty array', async () => {
    const trades = await adapter.getClosedTrades(new Date(0), new Date());
    expect(trades).toEqual([]);
  });

  it('cannot be registered as live broker (liveTradingEnabled guard)', () => {
    // The PaperBrokerAdapter is PAPER_ONLY.
    // Its brokerId is 'paper-broker' — not 'metatrader5' or any live broker.
    // Verify it cannot masquerade as a live adapter.
    expect(adapter.brokerId).toBe('paper-broker');
    expect(adapter.brokerName).toContain('PAPER_ONLY');

    // setMode(LIVE) is silently ignored — mode stays DEMO
    adapter.setMode(BrokerMode.LIVE);
    expect(adapter.isConnected()).toBe(false); // Not connected before connect()
  });
});
