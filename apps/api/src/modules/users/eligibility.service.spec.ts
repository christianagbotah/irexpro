import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../audit/audit.service';
import { EligibilityService } from './eligibility.service';
import {
  EligibilityDisclosureKey,
  UserDisclosureConsent,
} from './entities/user-disclosure-consent.entity';
import {
  EligibilityReviewDecision,
  UserEligibilityReview,
} from './entities/user-eligibility-review.entity';
import { User, UserStatus } from './entities/user.entity';

describe('EligibilityService', () => {
  let service: EligibilityService;
  let module: TestingModule;
  let consentRows: UserDisclosureConsent[];
  let reviewRows: UserEligibilityReview[];
  let config: Record<string, string>;

  const user = {
    id: 'user-1',
    email: 'trader@example.com',
    countryCode: 'GH',
    status: UserStatus.ACTIVE,
    createdAt: new Date('2026-08-31T00:00:00Z'),
  } as User;

  const userRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const consentRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(),
  };
  const reviewRepo = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string) => config[key]),
  };
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    consentRows = [];
    reviewRows = [];
    config = {
      ELIGIBILITY_POLICY_VERSION: 'eligibility.2026-08',
      ELIGIBILITY_ALLOWED_COUNTRY_CODES: 'GH,GB',
      ELIGIBILITY_BLOCKED_COUNTRY_CODES: 'XX',
      ELIGIBILITY_REVIEW_COUNTRY_CODES: 'NG',
    };

    userRepo.findOne.mockResolvedValue(user);
    userRepo.find.mockResolvedValue([user]);
    consentRepo.find.mockImplementation(async () => [...consentRows]);
    consentRepo.findOne.mockImplementation(async ({ where }) =>
      consentRows.find(
        (row) =>
          row.userId === where.userId &&
          row.disclosureKey === where.disclosureKey &&
          row.disclosureVersion === where.disclosureVersion &&
          row.contentSha256 === where.contentSha256,
      ) ?? null,
    );
    consentRepo.save.mockImplementation(async (row) => {
      const saved = {
        ...row,
        id: `consent-${consentRows.length + 1}`,
        acceptedAt: row.acceptedAt ?? new Date('2026-08-31T01:00:00Z'),
        createdAt: new Date('2026-08-31T01:00:00Z'),
      } as UserDisclosureConsent;
      consentRows.push(saved);
      return saved;
    });
    reviewRepo.findOne.mockImplementation(async ({ where }) => {
      const matches = reviewRows.filter(
        (row) =>
          row.userId === where.userId &&
          row.countryCode === where.countryCode &&
          row.policyVersion === where.policyVersion,
      );
      return matches.at(-1) ?? null;
    });
    reviewRepo.save.mockImplementation(async (row) => {
      const saved = {
        ...row,
        id: `review-${reviewRows.length + 1}`,
        createdAt: new Date(`2026-08-31T0${reviewRows.length + 1}:30:00Z`),
      } as UserEligibilityReview;
      reviewRows.push(saved);
      return saved;
    });

    module = await Test.createTestingModule({
      providers: [
        EligibilityService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(UserDisclosureConsent), useValue: consentRepo },
        { provide: getRepositoryToken(UserEligibilityReview), useValue: reviewRepo },
        { provide: ConfigService, useValue: configService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(EligibilityService);
  });

  afterEach(async () => module.close());

  it('allows a policy-allowed jurisdiction only after every exact current disclosure is accepted', async () => {
    const initial = await service.getStatus(user.id);

    expect(initial.jurisdictionStatus).toBe('ELIGIBLE');
    expect(initial.decisionSource).toBe('POLICY');
    expect(initial.disclosures).toHaveLength(4);
    expect(initial.missingConsentKeys).toEqual([
      EligibilityDisclosureKey.AUTOMATED_TRADING_RISK,
      EligibilityDisclosureKey.NO_PROFIT_GUARANTEE,
      EligibilityDisclosureKey.BROKER_EXECUTION_AUTHORITY,
      EligibilityDisclosureKey.LEGAL_ELIGIBILITY_ATTESTATION,
    ]);
    expect(initial.canProceed).toBe(false);

    const accepted = await service.acceptDisclosures(user.id, {
      acceptances: initial.disclosures.map((item) => ({
        key: item.key,
        version: item.version,
        contentSha256: item.contentSha256,
      })),
    });

    expect(accepted.missingConsentKeys).toEqual([]);
    expect(accepted.consents).toHaveLength(4);
    expect(accepted.canProceed).toBe(true);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ELIGIBILITY_DISCLOSURES_ACCEPTED' }),
    );
  });

  it('rejects a stale, modified, or fabricated disclosure hash', async () => {
    const status = await service.getStatus(user.id);
    const disclosure = status.disclosures[0];

    await expect(
      service.acceptDisclosures(user.id, {
        acceptances: [
          {
            key: disclosure.key,
            version: disclosure.version,
            contentSha256: '0'.repeat(64),
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(consentRows).toHaveLength(0);
  });

  it('rejects duplicate keys inside one consent submission', async () => {
    const disclosure = (await service.getStatus(user.id)).disclosures[0];
    const acceptance = {
      key: disclosure.key,
      version: disclosure.version,
      contentSha256: disclosure.contentSha256,
    };

    await expect(
      service.acceptDisclosures(user.id, { acceptances: [acceptance, acceptance] }),
    ).rejects.toThrow(/Duplicate disclosure acceptance/);
  });

  it('is idempotent for already-recorded exact consent evidence', async () => {
    const disclosure = (await service.getStatus(user.id)).disclosures[0];
    const dto = {
      acceptances: [
        {
          key: disclosure.key,
          version: disclosure.version,
          contentSha256: disclosure.contentSha256,
        },
      ],
    };

    await service.acceptDisclosures(user.id, dto);
    await service.acceptDisclosures(user.id, dto);

    expect(consentRows).toHaveLength(1);
  });

  it('fails closed for an unclassified jurisdiction', async () => {
    userRepo.findOne.mockResolvedValue({ ...user, countryCode: 'ZZ' });

    const status = await service.getStatus(user.id);

    expect(status.jurisdictionStatus).toBe('REVIEW_REQUIRED');
    expect(status.reasonCode).toBe('UNCLASSIFIED_JURISDICTION');
    expect(status.canProceed).toBe(false);
  });

  it('fails closed when country information is missing', async () => {
    userRepo.findOne.mockResolvedValue({ ...user, countryCode: null });

    const status = await service.getStatus(user.id);

    expect(status.jurisdictionStatus).toBe('MISSING_PROFILE');
    expect(status.reasonCode).toBe('COUNTRY_REQUIRED');
    expect(status.canProceed).toBe(false);
  });

  it('never permits an admin review to override an explicitly blocked jurisdiction', async () => {
    userRepo.findOne.mockResolvedValue({ ...user, countryCode: 'XX' });

    await expect(
      service.reviewUser(user.id, 'admin-1', {
        decision: EligibilityReviewDecision.APPROVED,
        reasonCode: 'OVERRIDE_ATTEMPT',
      }),
    ).rejects.toThrow(/cannot be overridden/);

    expect(reviewRows).toHaveLength(0);
  });

  it('does not create redundant review evidence for policy-allowed countries', async () => {
    await expect(
      service.reviewUser(user.id, 'admin-1', {
        decision: EligibilityReviewDecision.APPROVED,
        reasonCode: 'NOT_NEEDED',
      }),
    ).rejects.toThrow(/already allowed/);
  });

  it('applies the latest matching immutable admin review only to the exact country and policy version', async () => {
    userRepo.findOne.mockResolvedValue({ ...user, countryCode: 'NG' });

    await service.reviewUser(user.id, 'admin-1', {
      decision: EligibilityReviewDecision.DENIED,
      reasonCode: 'REVIEW_DENIED',
    });
    expect((await service.getStatus(user.id)).jurisdictionStatus).toBe('INELIGIBLE');

    await service.reviewUser(user.id, 'admin-2', {
      decision: EligibilityReviewDecision.APPROVED,
      reasonCode: 'REVIEW_APPROVED',
    });
    const approved = await service.getStatus(user.id);
    expect(approved.jurisdictionStatus).toBe('ELIGIBLE');
    expect(approved.decisionSource).toBe('ADMIN_REVIEW');
    expect(approved.reasonCode).toBe('REVIEW_APPROVED');

    config.ELIGIBILITY_POLICY_VERSION = 'eligibility.2026-09';
    const afterPolicyChange = await service.getStatus(user.id);
    expect(afterPolicyChange.jurisdictionStatus).toBe('REVIEW_REQUIRED');
    expect(afterPolicyChange.decisionSource).toBe('POLICY');
  });

  it('queues only active users whose current jurisdiction requires review', async () => {
    const allowed = { ...user, id: 'allowed', countryCode: 'GH' };
    const review = { ...user, id: 'review', countryCode: 'NG' };
    const unknown = { ...user, id: 'unknown', countryCode: 'ZZ' };
    const suspended = {
      ...user,
      id: 'suspended',
      countryCode: 'NG',
      status: UserStatus.SUSPENDED,
    };
    userRepo.find.mockResolvedValue([allowed, review, unknown, suspended]);

    const queue = await service.listReviewQueue();

    expect(queue.map((item) => item.userId)).toEqual(['review', 'unknown']);
    expect(JSON.stringify(queue)).not.toMatch(/passwordHash|brokerConnectionId|providerAccountId/);
  });
});
