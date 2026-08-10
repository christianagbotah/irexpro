import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';

const VALID_KEY = 'test-internal-key-12345678901234';

describe('MarketDataController — internal endpoint', () => {
  let module: TestingModule;
  let controller: MarketDataController;
  let marketDataService: jest.Mocked<Partial<MarketDataService>>;
  let guard: InternalApiKeyGuard;

  const mockResponse = {
    instrument: 'EURUSD',
    timeframe: 'H1',
    source: 'broker',
    count: 1,
    candles: [
      {
        timestamp: '2024-01-01T00:00:00.000Z',
        open: '1.10000',
        high: '1.10100',
        low: '1.09900',
        close: '1.10050',
        volume: '1000',
        instrument: 'EURUSD',
        timeframe: 'H1',
        source: 'broker',
      },
    ],
  };

  beforeEach(async () => {
    marketDataService = {
      getInternalOhlcv: jest.fn().mockResolvedValue(mockResponse),
    };

    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'internalApi.key') return VALID_KEY;
        return undefined;
      }),
    };

    module = await Test.createTestingModule({
      controllers: [MarketDataController],
      providers: [
        { provide: MarketDataService, useValue: marketDataService },
        { provide: ConfigService, useValue: configService },
        InternalApiKeyGuard,
      ],
    }).compile();

    controller = module.get(MarketDataController);
    guard = module.get(InternalApiKeyGuard);
  });

  afterEach(async () => {
    await module.close();
  });

  it('delegates to MarketDataService.getInternalOhlcv()', async () => {
    const query = {
      userId: '00000000-0000-0000-0000-000000000001',
      brokerConnectionId: '00000000-0000-0000-0000-000000000002',
      instrument: 'EURUSD',
      timeframe: 'H1',
      limit: 100,
    };

    const result = await controller.getInternalOhlcv(query);
    expect(marketDataService.getInternalOhlcv).toHaveBeenCalledWith(query);
    expect(result).toEqual(mockResponse);
  });

  describe('InternalApiKeyGuard', () => {
    const makeContext = (headerValue?: string) => ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: headerValue ? { 'x-irexpro-internal-api-key': headerValue } : {},
        }),
      }),
    });

    it('rejects missing API key header', () => {
      const ctx = makeContext(undefined) as any;
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('accepts valid API key', () => {
      const ctx = makeContext(VALID_KEY) as any;
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });
});
