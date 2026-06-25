import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotImplementedException } from '@nestjs/common';
import { TradingService } from './trading.service';
import { BrokerService } from '../broker/broker.service';

describe('TradingService — Broker Gate', () => {
  let module: TestingModule;
  let service: TradingService;
  let brokerService: jest.Mocked<Partial<BrokerService>>;

  beforeEach(async () => {
    brokerService = {
      hasActiveConnection: jest.fn(),
    };

    module = await Test.createTestingModule({
      providers: [
        TradingService,
        { provide: BrokerService, useValue: brokerService },
      ],
    }).compile();

    service = module.get<TradingService>(TradingService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('assertBrokerGate()', () => {
    it('passes when user has an active broker connection', async () => {
      (brokerService.hasActiveConnection as jest.Mock).mockResolvedValue(true);
      await expect(service.assertBrokerGate('user-1')).resolves.not.toThrow();
    });

    it('throws ForbiddenException when no active broker connection', async () => {
      (brokerService.hasActiveConnection as jest.Mock).mockResolvedValue(false);
      await expect(service.assertBrokerGate('user-1')).rejects.toThrow(ForbiddenException);
    });

    it('ForbiddenException message instructs the user to connect a broker first', async () => {
      (brokerService.hasActiveConnection as jest.Mock).mockResolvedValue(false);
      await expect(service.assertBrokerGate('user-1')).rejects.toThrow(
        /No active broker connection/,
      );
    });
  });

  describe('startTradingSession()', () => {
    it('throws NotImplementedException (Sprint 3)', async () => {
      await expect(service.startTradingSession('user-1')).rejects.toThrow(NotImplementedException);
    });
  });

  describe('stopTradingSession()', () => {
    it('throws NotImplementedException (Sprint 3)', async () => {
      await expect(service.stopTradingSession('user-1')).rejects.toThrow(NotImplementedException);
    });
  });
});
