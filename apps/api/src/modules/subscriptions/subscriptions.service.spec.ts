import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { UserSubscription, SubscriptionStatus } from './entities/user-subscription.entity';
import { AuditService } from '../audit/audit.service';

const mockPlanRepo = { findOne: jest.fn(), find: jest.fn() };
const mockSubscriptionRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};
const mockAuditService = { log: jest.fn() };

describe('SubscriptionsService', () => {
  let module: TestingModule;
  let service: SubscriptionsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: getRepositoryToken(SubscriptionPlan), useValue: mockPlanRepo },
        { provide: getRepositoryToken(UserSubscription), useValue: mockSubscriptionRepo },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('canUserStartAiAutoTrading', () => {
    it('should return false when user has no subscription', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce(null);
      const result = await service.canUserStartAiAutoTrading('user-id');
      expect(result).toBe(false);
    });

    it('should return false when plan does not allow AI trading', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: SubscriptionStatus.ACTIVE,
        plan: { allowsAiAutoTrading: false },
        currentPeriodEnd: new Date(Date.now() + 86400000),
      });
      const result = await service.canUserStartAiAutoTrading('user-id');
      expect(result).toBe(false);
    });

    it('should return false when ACTIVE subscription has expired', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: SubscriptionStatus.ACTIVE,
        plan: { allowsAiAutoTrading: true },
        currentPeriodEnd: new Date(Date.now() - 86400000),
      });
      const result = await service.canUserStartAiAutoTrading('user-id');
      expect(result).toBe(false);
    });

    it('should return true for valid ACTIVE subscription with AI trading allowed', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: SubscriptionStatus.ACTIVE,
        plan: { allowsAiAutoTrading: true },
        currentPeriodEnd: new Date(Date.now() + 86400000),
      });
      const result = await service.canUserStartAiAutoTrading('user-id');
      expect(result).toBe(true);
    });

    it('should return true for valid TRIAL subscription within trial period', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: SubscriptionStatus.TRIAL,
        plan: { allowsAiAutoTrading: true },
        trialEndsAt: new Date(Date.now() + 86400000),
        currentPeriodEnd: null,
      });
      const result = await service.canUserStartAiAutoTrading('user-id');
      expect(result).toBe(true);
    });

    it('should return false for TRIAL subscription where trial has expired', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: SubscriptionStatus.TRIAL,
        plan: { allowsAiAutoTrading: true },
        trialEndsAt: new Date(Date.now() - 86400000),
        currentPeriodEnd: null,
      });
      const result = await service.canUserStartAiAutoTrading('user-id');
      expect(result).toBe(false);
    });

    it('should return false for CANCELLED subscription', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: SubscriptionStatus.CANCELLED,
        plan: { allowsAiAutoTrading: true },
        currentPeriodEnd: new Date(Date.now() + 86400000),
      });
      const result = await service.canUserStartAiAutoTrading('user-id');
      expect(result).toBe(false);
    });
  });

  describe('manualActivate', () => {
    it('should throw NotFoundException when plan not found', async () => {
      mockPlanRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.manualActivate('user-id', 'invalid-plan-id', 'admin-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create a new subscription when none exists', async () => {
      mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro' });
      mockSubscriptionRepo.findOne.mockResolvedValueOnce(null);
      const mockSaved = { id: 'sub-id', status: SubscriptionStatus.ACTIVE };
      mockSubscriptionRepo.create.mockReturnValue(mockSaved);
      mockSubscriptionRepo.save.mockResolvedValueOnce(mockSaved);

      const result = await service.manualActivate('user-id', 'plan-id', 'admin-id');
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUBSCRIPTION_MANUAL_ACTIVATED',
          metadata: expect.objectContaining({
            warning: expect.stringContaining('DEV/TEST only'),
          }),
        }),
      );
    });
  });
});
