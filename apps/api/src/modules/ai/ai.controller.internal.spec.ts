import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiSignalService } from './ai-signal.service';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';
import { InternalSignalDto } from './dto/internal-signal.dto';
import { StrategyResult } from '../strategy/interfaces/strategy.interface';

const VALID_KEY = 'test-internal-key-12345678901234';

const makeDto = (overrides: Partial<InternalSignalDto> = {}): InternalSignalDto => ({
  userId: 'user-abc',
  tradingSessionId: '00000000-0000-0000-0000-000000000001',
  brokerConnectionId: '00000000-0000-0000-0000-000000000002',
  instrument: 'EURUSD',
  direction: 'BUY',
  confidenceScore: 0.75,
  suggestedStopLoss: 1.075,
  suggestedTakeProfit: 1.095,
  suggestedVolume: 0.01,
  timeframe: 'H1',
  strategyCode: 'baseline-h1',
  modelVersion: 'baseline-xgboost-v0.1.0',
  ...overrides,
});

describe('AiController — internal endpoint', () => {
  let module: TestingModule;
  let controller: AiController;
  let aiSignalService: jest.Mocked<Partial<AiSignalService>>;
  let configService: jest.Mocked<Partial<ConfigService>>;
  let guard: InternalApiKeyGuard;

  const mockStrategyResult: StrategyResult = {
    outcome: 'RISK_REJECTED',
    signalId: 'sig-1',
    reason: 'No active session',
  };

  beforeEach(async () => {
    aiSignalService = {
      receiveSignal: jest.fn().mockResolvedValue(mockStrategyResult),
    };
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'internalApi.key') return VALID_KEY;
        if (key === 'app.env') return 'development';
        return undefined;
      }),
    };

    module = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        { provide: AiSignalService, useValue: aiSignalService },
        { provide: ConfigService, useValue: configService },
        InternalApiKeyGuard,
      ],
    }).compile();

    controller = module.get<AiController>(AiController);
    guard = module.get<InternalApiKeyGuard>(InternalApiKeyGuard);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('receiveInternalSignal()', () => {
    it('routes signal through AiSignalService.receiveSignal()', async () => {
      const dto = makeDto();
      const result = await controller.receiveInternalSignal(dto);
      expect(aiSignalService.receiveSignal).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockStrategyResult);
    });

    it('maps dto fields to AiSignalCandidate correctly', async () => {
      const dto = makeDto({ signalId: 'custom-sig-id' });
      await controller.receiveInternalSignal(dto);
      const passedCandidate = (aiSignalService.receiveSignal as jest.Mock).mock.calls[0][0];
      expect(passedCandidate.signalId).toBe('custom-sig-id');
      expect(passedCandidate.userId).toBe(dto.userId);
      expect(passedCandidate.instrument).toBe('EURUSD');
      expect(passedCandidate.confidenceScore).toBe(0.75);
      expect(passedCandidate.metadata.source).toBe('python-ai-engine');
    });

    it('auto-generates signalId when not provided', async () => {
      const dto = makeDto();
      delete dto.signalId;
      await controller.receiveInternalSignal(dto);
      const passedCandidate = (aiSignalService.receiveSignal as jest.Mock).mock.calls[0][0];
      expect(passedCandidate.signalId).toBeDefined();
      expect(passedCandidate.signalId.length).toBe(36); // UUID format
    });

    it('does NOT call ExecutionService directly', async () => {
      const dto = makeDto();
      await controller.receiveInternalSignal(dto);
      // AiSignalService.receiveSignal is called — not any execution service
      expect(aiSignalService.receiveSignal).toHaveBeenCalledTimes(1);
      // Verify the controller has no direct executionService dependency
      expect((controller as any).executionService).toBeUndefined();
    });
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

    it('rejects invalid API key', () => {
      const ctx = makeContext('wrong-key') as any;
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('accepts valid API key', () => {
      const ctx = makeContext(VALID_KEY) as any;
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('blocks endpoint when NESTJS_INTERNAL_API_KEY is not configured', () => {
      const unconfiguredConfig = {
        get: jest.fn().mockReturnValue(undefined),
      } as jest.Mocked<Partial<ConfigService>>;
      const unconfiguredGuard = new InternalApiKeyGuard(unconfiguredConfig as ConfigService);
      const ctx = makeContext(VALID_KEY) as any;
      expect(() => unconfiguredGuard.canActivate(ctx)).toThrow(UnauthorizedException);
    });
  });
});
