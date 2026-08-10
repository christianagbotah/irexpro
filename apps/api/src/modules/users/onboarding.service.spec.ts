import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OnboardingService } from './onboarding.service';
import { User, UserStatus } from './entities/user.entity';
import { UserProfile, TradingExperienceLevel } from './entities/user-profile.entity';
import { RiskProfile } from '../risk/entities/risk-profile.entity';
import { BrokerConnection } from '../broker/entities/broker-connection.entity';
import { BrokerConnectionStatus } from '../broker/interfaces/broker-adapter.interface';
import { AuditService } from '../audit/audit.service';

/**
 * OnboardingService tests — Sprint 29.
 *
 * Verifies:
 *   - onboarding status for a new user (all steps incomplete)
 *   - profile completion true/false
 *   - risk profile completion true/false (requires acknowledgement)
 *   - broker connected true/false
 *   - canStartTrading false when profile missing
 *   - canStartTrading false when risk profile missing
 *   - canStartTrading false when broker missing
 *   - canStartTrading false when kill switch active
 *   - canStartTrading true only when ALL conditions are met
 *   - broker credentials are NOT returned (select safe fields only)
 *   - audit logs called for trading readiness when ready
 */
describe('OnboardingService (Sprint 29)', () => {
  let service: OnboardingService;
  let module: TestingModule;

  const mockUserRepo = {
    findOne: jest.fn(),
  };
  const mockProfileRepo = { findOne: jest.fn() };
  const mockRiskProfileRepo = { findOne: jest.fn() };
  // The onboarding service uses createQueryBuilder for broker connections.
  // We mock the chain: createQueryBuilder → select → where → andWhere → getOne
  const mockBrokerQb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
  };
  const mockBrokerConnectionRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(mockBrokerQb),
  };
  const mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockBrokerQb.getOne.mockResolvedValue(null);

    module = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(UserProfile), useValue: mockProfileRepo },
        { provide: getRepositoryToken(RiskProfile), useValue: mockRiskProfileRepo },
        { provide: getRepositoryToken(BrokerConnection), useValue: mockBrokerConnectionRepo },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  afterEach(async () => {
    await module.close();
  });

  /** Helper: build a fully-complete user (profile + user fields). */
  function buildCompleteUser(): User {
    return {
      id: 'user-complete',
      email: 'complete@example.com',
      phone: null,
      passwordHash: 'hash',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      lastLoginAt: null,
      countryCode: 'GH',
      timezone: 'Africa/Accra',
      preferredCurrency: 'USD',
      mfaEnabled: false,
      mfaSecret: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      profile: {
        id: 'profile-1',
        userId: 'user-complete',
        firstName: 'John',
        lastName: 'Doe',
        displayName: null,
        dateOfBirth: null,
        addressLine1: null,
        addressLine2: null,
        addressCity: null,
        addressState: null,
        addressPostalCode: null,
        addressCountry: null,
        kycStatus: 'NONE' as never,
        kycSubmittedAt: null,
        kycApprovedAt: null,
        riskDisclosureAccepted: false,
        riskDisclosureAcceptedAt: null,
        tradingExperienceLevel: TradingExperienceLevel.INTERMEDIATE,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as UserProfile,
      userRoles: [],
    } as unknown as User;
  }

  /** Helper: build a risk profile with acknowledgement accepted. */
  function buildCompleteRiskProfile(): RiskProfile {
    return {
      id: 'risk-1',
      userId: 'user-complete',
      killSwitchActive: false,
      killSwitchReason: null,
      maxDailyLossPercent: '5.00',
      maxDrawdownPercent: '10.00',
      maxOpenTrades: 3,
      maxDailyTrades: 10,
      maxPositionSizeLot: '0.1000',
      minStopLossPips: '5.00',
      allowedInstruments: null,
      maxVolatilityScore: '0.85',
      rejectLowLiquidity: true,
      riskAcknowledgementAccepted: true,
      riskAcknowledgementAcceptedAt: new Date(),
      maxTradeRiskPercent: '2.00',
      maxLeverageAllowed: 30,
      allowedTradingModes: 'PAPER_ONLY' as never,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as RiskProfile;
  }

  /** Helper: build a connected broker connection (safe fields only). */
  function buildConnectedBroker(): Partial<BrokerConnection> {
    return {
      id: 'broker-1',
      brokerId: 'paper-broker',
      brokerName: 'Paper Trading Broker',
      status: BrokerConnectionStatus.CONNECTED,
      accountType: 'DEMO' as never,
      demoValidated: true,
      liveTradingEnabled: false,
    };
  }

  describe('getOnboardingStatus', () => {
    it('should return all steps incomplete for a new user with no profile/risk/broker', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 'new-user',
        status: UserStatus.ACTIVE,
        countryCode: null,
        timezone: null,
        preferredCurrency: null,
        profile: { firstName: null, lastName: null, tradingExperienceLevel: null },
      });
      mockRiskProfileRepo.findOne.mockResolvedValue(null);
      mockBrokerQb.getOne.mockResolvedValue(null);

      const status = await service.getOnboardingStatus('new-user');

      expect(status.profileCompleted).toBe(false);
      expect(status.riskProfileCompleted).toBe(false);
      expect(status.brokerConnected).toBe(false);
      expect(status.canStartTrading).toBe(false);
      expect(status.missingSteps).toEqual(['PROFILE', 'RISK_PROFILE', 'BROKER_CONNECTION']);
      expect(status.nextStep).toBe('PROFILE');
    });

    it('should return profileCompleted=true when all profile fields are set', async () => {
      mockUserRepo.findOne.mockResolvedValue(buildCompleteUser());
      mockRiskProfileRepo.findOne.mockResolvedValue(null);
      mockBrokerQb.getOne.mockResolvedValue(null);

      const status = await service.getOnboardingStatus('user-complete');

      expect(status.profileCompleted).toBe(true);
      expect(status.riskProfileCompleted).toBe(false);
      expect(status.brokerConnected).toBe(false);
      expect(status.canStartTrading).toBe(false);
      expect(status.missingSteps).toEqual(['RISK_PROFILE', 'BROKER_CONNECTION']);
      expect(status.nextStep).toBe('RISK_PROFILE');
    });

    it('should return riskProfileCompleted=false when risk profile exists but acknowledgement NOT accepted', async () => {
      mockUserRepo.findOne.mockResolvedValue(buildCompleteUser());
      const riskProfile = buildCompleteRiskProfile();
      riskProfile.riskAcknowledgementAccepted = false;
      mockRiskProfileRepo.findOne.mockResolvedValue(riskProfile);
      mockBrokerQb.getOne.mockResolvedValue(null);

      const status = await service.getOnboardingStatus('user-complete');

      expect(status.riskProfileCompleted).toBe(false);
      expect(status.canStartTrading).toBe(false);
      expect(status.missingSteps).toContain('RISK_PROFILE');
    });

    it('should return riskProfileCompleted=true when risk profile + acknowledgement accepted', async () => {
      mockUserRepo.findOne.mockResolvedValue(buildCompleteUser());
      mockRiskProfileRepo.findOne.mockResolvedValue(buildCompleteRiskProfile());
      mockBrokerQb.getOne.mockResolvedValue(null);

      const status = await service.getOnboardingStatus('user-complete');

      expect(status.riskProfileCompleted).toBe(true);
      expect(status.brokerConnected).toBe(false);
      expect(status.canStartTrading).toBe(false);
      expect(status.missingSteps).toEqual(['BROKER_CONNECTION']);
      expect(status.nextStep).toBe('BROKER_CONNECTION');
    });

    it('should return brokerConnected=true when a CONNECTED broker exists', async () => {
      mockUserRepo.findOne.mockResolvedValue(buildCompleteUser());
      mockRiskProfileRepo.findOne.mockResolvedValue(buildCompleteRiskProfile());
      mockBrokerQb.getOne.mockResolvedValue(buildConnectedBroker());

      const status = await service.getOnboardingStatus('user-complete');

      expect(status.brokerConnected).toBe(true);
      expect(status.brokerConnectionStatus).toBe(BrokerConnectionStatus.CONNECTED);
      expect(status.canStartTrading).toBe(true);
      expect(status.missingSteps).toEqual([]);
      expect(status.nextStep).toBe('READY');
    });

    it('should return canStartTrading=false when kill switch is active', async () => {
      mockUserRepo.findOne.mockResolvedValue(buildCompleteUser());
      const riskProfile = buildCompleteRiskProfile();
      riskProfile.killSwitchActive = true;
      mockRiskProfileRepo.findOne.mockResolvedValue(riskProfile);
      mockBrokerQb.getOne.mockResolvedValue(buildConnectedBroker());

      const status = await service.getOnboardingStatus('user-complete');

      expect(status.canStartTrading).toBe(false);
      expect(status.missingSteps).toEqual([]);
      // nextStep is READY because all steps are complete, but canStartTrading is false due to kill switch
      expect(status.nextStep).toBe('READY');
    });

    it('should return canStartTrading=false when user is SUSPENDED', async () => {
      const user = buildCompleteUser();
      user.status = UserStatus.SUSPENDED;
      mockUserRepo.findOne.mockResolvedValue(user);
      mockRiskProfileRepo.findOne.mockResolvedValue(buildCompleteRiskProfile());
      mockBrokerQb.getOne.mockResolvedValue(buildConnectedBroker());

      const status = await service.getOnboardingStatus('user-complete');

      expect(status.canStartTrading).toBe(false);
    });

    it('should return canStartTrading=true only when ALL conditions are met', async () => {
      mockUserRepo.findOne.mockResolvedValue(buildCompleteUser());
      mockRiskProfileRepo.findOne.mockResolvedValue(buildCompleteRiskProfile());
      mockBrokerQb.getOne.mockResolvedValue(buildConnectedBroker());

      const status = await service.getOnboardingStatus('user-complete');

      expect(status.profileCompleted).toBe(true);
      expect(status.riskProfileCompleted).toBe(true);
      expect(status.brokerConnected).toBe(true);
      expect(status.canStartTrading).toBe(true);
      expect(status.missingSteps).toEqual([]);
      expect(status.nextStep).toBe('READY');
    });

    it('should audit TRADING_READINESS_CHECKED when user is fully ready', async () => {
      mockUserRepo.findOne.mockResolvedValue(buildCompleteUser());
      mockRiskProfileRepo.findOne.mockResolvedValue(buildCompleteRiskProfile());
      mockBrokerQb.getOne.mockResolvedValue(buildConnectedBroker());

      await service.getOnboardingStatus('user-complete');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'user-complete',
          action: 'TRADING_READINESS_CHECKED',
          metadata: expect.objectContaining({ canStartTrading: true }),
        }),
      );
    });

    it('should NOT audit when user is not ready (avoids audit spam on dashboard polls)', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 'incomplete-user',
        status: UserStatus.ACTIVE,
        countryCode: null,
        timezone: null,
        preferredCurrency: null,
        profile: { firstName: null, lastName: null, tradingExperienceLevel: null },
      });
      mockRiskProfileRepo.findOne.mockResolvedValue(null);
      mockBrokerQb.getOne.mockResolvedValue(null);

      await service.getOnboardingStatus('incomplete-user');

      expect(mockAuditService.log).not.toHaveBeenCalled();
    });

    it('should NOT return broker credentials (selects only safe fields via query builder)', async () => {
      mockUserRepo.findOne.mockResolvedValue(buildCompleteUser());
      mockRiskProfileRepo.findOne.mockResolvedValue(buildCompleteRiskProfile());
      mockBrokerQb.getOne.mockResolvedValue(buildConnectedBroker());

      const status = await service.getOnboardingStatus('user-complete');

      // The status object must not contain any credential fields
      const serialized = JSON.stringify(status);
      expect(serialized).not.toContain('encryptedCredentials');
      expect(serialized).not.toContain('credentialIv');
      expect(serialized).not.toContain('credentialTag');
      expect(serialized).not.toContain('apiKey');
      expect(serialized).not.toContain('apiSecret');
    });

    it('should handle non-existent user safely (all steps incomplete)', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      const status = await service.getOnboardingStatus('nonexistent');

      expect(status.profileCompleted).toBe(false);
      expect(status.riskProfileCompleted).toBe(false);
      expect(status.brokerConnected).toBe(false);
      expect(status.canStartTrading).toBe(false);
      expect(status.nextStep).toBe('PROFILE');
    });

    // ── Hotfix: broker schema reconciliation + resilience ───────────────────

    it('should return brokerConnectionStatus=NONE when user has no broker connection', async () => {
      mockUserRepo.findOne.mockResolvedValue(buildCompleteUser());
      mockRiskProfileRepo.findOne.mockResolvedValue(buildCompleteRiskProfile());
      mockBrokerQb.getOne.mockResolvedValue(null);

      const status = await service.getOnboardingStatus('user-complete');

      expect(status.brokerConnected).toBe(false);
      expect(status.brokerConnectionStatus).toBe('NONE');
      expect(status.canStartTrading).toBe(false);
      expect(status.missingSteps).toContain('BROKER_CONNECTION');
      expect(status.nextStep).toBe('BROKER_CONNECTION');
    });

    it('should NOT produce HTTP 500 when broker query fails (DB error → null, fail-closed)', async () => {
      mockUserRepo.findOne.mockResolvedValue(buildCompleteUser());
      mockRiskProfileRepo.findOne.mockResolvedValue(buildCompleteRiskProfile());
      // Simulate a DB error (e.g. missing column) — the query builder throws
      mockBrokerQb.getOne.mockRejectedValue(new Error('column conn.last_sync_at does not exist'));

      const status = await service.getOnboardingStatus('user-complete');

      // Must NOT throw — returns fail-closed status
      expect(status.brokerConnected).toBe(false);
      expect(status.brokerConnectionStatus).toBe('NONE');
      expect(status.canStartTrading).toBe(false);
      expect(status.missingSteps).toContain('BROKER_CONNECTION');
    });

    it('should select ONLY readiness fields (not credentials, not sync metadata, not accountId)', async () => {
      mockUserRepo.findOne.mockResolvedValue(buildCompleteUser());
      mockRiskProfileRepo.findOne.mockResolvedValue(buildCompleteRiskProfile());
      mockBrokerQb.getOne.mockResolvedValue(buildConnectedBroker());

      await service.getOnboardingStatus('user-complete');

      // Verify the select() was called with ONLY the 5 readiness fields
      const selectCall = mockBrokerQb.select.mock.calls[0][0];
      expect(selectCall).toEqual([
        'conn.id',
        'conn.status',
        'conn.lastHealthCheckAt',
        'conn.consecutiveFailureCount',
        'conn.liveTradingEnabled',
      ]);
      // Explicitly verify credential fields are NOT selected
      expect(selectCall).not.toContain('conn.encryptedCredentials');
      expect(selectCall).not.toContain('conn.credentialIv');
      expect(selectCall).not.toContain('conn.credentialTag');
      expect(selectCall).not.toContain('conn.encryptionKeyId');
      // Also verify sync/account fields are NOT selected (not needed for readiness)
      expect(selectCall).not.toContain('conn.lastSyncAt');
      expect(selectCall).not.toContain('conn.accountId');
      expect(selectCall).not.toContain('conn.brokerId');
    });

    it('should return liveTradingEnabled=false when the broker connection has it false', async () => {
      mockUserRepo.findOne.mockResolvedValue(buildCompleteUser());
      mockRiskProfileRepo.findOne.mockResolvedValue(buildCompleteRiskProfile());
      mockBrokerQb.getOne.mockResolvedValue({
        ...buildConnectedBroker(),
        liveTradingEnabled: false,
      });

      const status = await service.getOnboardingStatus('user-complete');

      // liveTradingEnabled defaults to false — user can start PAPER_ONLY but not FULL_AUTO
      expect(status.brokerConnected).toBe(true);
      expect(status.canStartTrading).toBe(true); // canStartTrading doesn't check liveTradingEnabled
    });
  });

  describe('canStartTrading', () => {
    it('should return allowed=false with missingSteps when profile incomplete', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 'user-1',
        status: UserStatus.ACTIVE,
        countryCode: null,
        timezone: null,
        preferredCurrency: null,
        profile: { firstName: null, lastName: null, tradingExperienceLevel: null },
      });
      mockRiskProfileRepo.findOne.mockResolvedValue(null);
      mockBrokerQb.getOne.mockResolvedValue(null);

      const result = await service.canStartTrading('user-1');

      expect(result.allowed).toBe(false);
      expect(result.missingSteps).toContain('PROFILE');
      expect(result.missingSteps).toContain('RISK_PROFILE');
      expect(result.missingSteps).toContain('BROKER_CONNECTION');
    });

    it('should return allowed=true when all conditions are met', async () => {
      mockUserRepo.findOne.mockResolvedValue(buildCompleteUser());
      mockRiskProfileRepo.findOne.mockResolvedValue(buildCompleteRiskProfile());
      mockBrokerQb.getOne.mockResolvedValue(buildConnectedBroker());

      const result = await service.canStartTrading('user-complete');

      expect(result.allowed).toBe(true);
      expect(result.missingSteps).toEqual([]);
    });
  });

  describe('profile completion edge cases', () => {
    it('should return profileCompleted=false when profile is null', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 'user-1',
        status: UserStatus.ACTIVE,
        countryCode: 'GH',
        timezone: 'Africa/Accra',
        preferredCurrency: 'USD',
        profile: null,
      });
      mockRiskProfileRepo.findOne.mockResolvedValue(null);
      mockBrokerQb.getOne.mockResolvedValue(null);

      const status = await service.getOnboardingStatus('user-1');

      expect(status.profileCompleted).toBe(false);
    });

    it('should return profileCompleted=false when tradingExperienceLevel is null', async () => {
      const user = buildCompleteUser();
      user.profile!.tradingExperienceLevel = null;
      mockUserRepo.findOne.mockResolvedValue(user);
      mockRiskProfileRepo.findOne.mockResolvedValue(null);
      mockBrokerQb.getOne.mockResolvedValue(null);

      const status = await service.getOnboardingStatus('user-complete');

      expect(status.profileCompleted).toBe(false);
    });

    it('should return profileCompleted=false when timezone is null', async () => {
      const user = buildCompleteUser();
      user.timezone = null;
      mockUserRepo.findOne.mockResolvedValue(user);
      mockRiskProfileRepo.findOne.mockResolvedValue(null);
      mockBrokerQb.getOne.mockResolvedValue(null);

      const status = await service.getOnboardingStatus('user-complete');

      expect(status.profileCompleted).toBe(false);
    });
  });
});
