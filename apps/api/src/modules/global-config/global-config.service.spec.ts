import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { GlobalConfigService } from './global-config.service';
import { CountryConfig } from './entities/country-config.entity';

const ghConfig: Partial<CountryConfig> = {
  id: 'cfg-gh',
  countryCode: 'GH',
  countryName: 'Ghana',
  defaultCurrency: 'GHS',
  isActive: true,
  isBlocked: false,
  enabledPaymentProviders: ['hubtel', 'paystack'],
  enabledSmsProviders: ['hubtel_sms', 'arkesel'],
};

const mockRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
};

describe('GlobalConfigService', () => {
  let module: TestingModule;
  let service: GlobalConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        GlobalConfigService,
        { provide: getRepositoryToken(CountryConfig), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<GlobalConfigService>(GlobalConfigService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByCountryCode', () => {
    it('should return country config for valid code', async () => {
      mockRepo.findOne.mockResolvedValueOnce(ghConfig);
      const result = await service.findByCountryCode('GH');
      expect(result.countryCode).toBe('GH');
      expect(result.enabledPaymentProviders).toContain('hubtel');
      expect(result.enabledSmsProviders).toContain('arkesel');
    });

    it('should throw NotFoundException for unknown country code', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.findByCountryCode('XX')).rejects.toThrow(NotFoundException);
    });
  });

  describe('isCountrySupported', () => {
    it('should return true for active, non-blocked country', async () => {
      mockRepo.findOne.mockResolvedValueOnce(ghConfig);
      expect(await service.isCountrySupported('GH')).toBe(true);
    });

    it('should return false for unknown country', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);
      expect(await service.isCountrySupported('XX')).toBe(false);
    });

    it('should return false for blocked country', async () => {
      mockRepo.findOne.mockResolvedValueOnce({ ...ghConfig, isBlocked: true });
      expect(await service.isCountrySupported('GH')).toBe(false);
    });
  });
});
