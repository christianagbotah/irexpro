import { Test } from '@nestjs/testing';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';
import { MarketIntelligenceService } from './market-intelligence.service';

describe('MarketDataController — trader endpoint', () => {
  it('delegates the authenticated user and sanitized query to MarketIntelligenceService', async () => {
    const snapshot = {
      instrument: 'EURUSD',
      timeframe: 'H1',
      source: 'BROKER' as const,
      status: 'FRESH' as const,
      retrievedAt: '2026-08-30T20:00:30.000Z',
      latestCandleAt: '2026-08-30T20:00:00.000Z',
      quote: {
        bid: '1.17001',
        ask: '1.17013',
        spread: '0.00012',
        timestamp: '2026-08-30T20:00:15.000Z',
        freshness: 'FRESH' as const,
      },
      candles: [
        {
          timestamp: '2026-08-30T20:00:00.000Z',
          open: '1.16965',
          high: '1.17030',
          low: '1.16955',
          close: '1.17005',
          volume: '1200',
        },
      ],
    };
    const marketIntelligence = { getSnapshot: jest.fn().mockResolvedValue(snapshot) };
    const module = await Test.createTestingModule({
      controllers: [MarketDataController],
      providers: [
        { provide: MarketDataService, useValue: { getInternalOhlcv: jest.fn() } },
        { provide: MarketIntelligenceService, useValue: marketIntelligence },
      ],
    }).compile();

    const controller = module.get(MarketDataController);
    const query = { instrument: 'EURUSD', timeframe: 'H1' as const, limit: 80 };
    const result = await controller.getIntelligence(
      '00000000-0000-0000-0000-000000000001',
      query,
    );

    expect(result).toBe(snapshot);
    expect(marketIntelligence.getSnapshot).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
      query,
    );
    expect(JSON.stringify(result)).not.toContain('brokerConnectionId');

    await module.close();
  });
});
