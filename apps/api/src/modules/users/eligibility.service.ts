import { createHash } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditService } from '../audit/audit.service';
import { AcceptEligibilityDisclosuresDto } from './dto/accept-eligibility-disclosures.dto';
import { ReviewUserEligibilityDto } from './dto/review-user-eligibility.dto';
import { ReviewUserKycDto } from './dto/review-user-kyc.dto';
import {
  EligibilityDisclosureKey,
  UserDisclosureConsent,
} from './entities/user-disclosure-consent.entity';
import {
  EligibilityReviewDecision,
  UserEligibilityReview,
} from './entities/user-eligibility-review.entity';
import { KycReviewDecision, UserKycReview } from './entities/user-kyc-review.entity';
import { KycStatus } from './entities/user-profile.entity';
import { User, UserStatus } from './entities/user.entity';

export type EligibilityJurisdictionStatus =
  | 'MISSING_PROFILE'
  | 'REVIEW_REQUIRED'
  | 'ELIGIBLE'
  | 'INELIGIBLE';

export type EligibilityDecisionSource = 'POLICY' | 'ADMIN_REVIEW';
export type EligibilityAgeStatus = 'MISSING_DOB' | 'INVALID_DOB' | 'UNDER_18' | 'ADULT';

export interface EligibilityDisclosureView {
  key: EligibilityDisclosureKey;
  version: string;
  title: string;
  body: string;
  contentSha256: string;
  required: true;
}

export interface EligibilityConsentEvidenceView {
  key: EligibilityDisclosureKey;
  version: string;
  contentSha256: string;
  acceptedAt: string;
}

export interface EligibilityStatusView {
  policyVersion: string;
  countryCode: string | null;
  jurisdictionStatus: EligibilityJurisdictionStatus;
  decisionSource: EligibilityDecisionSource;
  reasonCode: string;
  reviewedAt: string | null;
  ageStatus: EligibilityAgeStatus;
  kycStatus: KycStatus;
  identityReasonCode: string;
  disclosures: EligibilityDisclosureView[];
  consents: EligibilityConsentEvidenceView[];
  missingConsentKeys: EligibilityDisclosureKey[];
  canProceed: boolean;
}

export interface EligibilityReviewQueueItem {
  userId: string;
  email: string | null;
  countryCode: string;
  policyVersion: string;
  jurisdictionStatus: 'REVIEW_REQUIRED';
  reasonCode: string;
}

export interface KycReviewQueueItem {
  userId: string;
  email: string | null;
  countryCode: string | null;
  dateOfBirth: string;
  ageStatus: 'ADULT';
  kycStatus: KycStatus.NONE | KycStatus.PENDING;
  reasonCode: 'KYC_REQUIRED' | 'KYC_PENDING';
}

interface JurisdictionDecision {
  status: EligibilityJurisdictionStatus;
  source: EligibilityDecisionSource;
  reasonCode: string;
  reviewedAt: Date | null;
}

interface DisclosureDefinition {
  key: EligibilityDisclosureKey;
  version: string;
  title: string;
  body: string;
}

const DISCLOSURES: readonly DisclosureDefinition[] = [
  {
    key: EligibilityDisclosureKey.AUTOMATED_TRADING_RISK,
    version: '1.0',
    title: 'Automated trading risk',
    body: 'Automated trading can result in financial loss. Market conditions, broker availability, model errors, slippage, and execution failures can affect outcomes. Risk controls reduce exposure but cannot eliminate risk.',
  },
  {
    key: EligibilityDisclosureKey.NO_PROFIT_GUARANTEE,
    version: '1.0',
    title: 'No profit guarantee',
    body: 'Historical research, simulations, AI confidence scores, and prior trading results do not guarantee future profits or prevent future losses.',
  },
  {
    key: EligibilityDisclosureKey.BROKER_EXECUTION_AUTHORITY,
    version: '1.0',
    title: 'Broker execution authority',
    body: 'When live automated trading is separately enabled, approved signals may be submitted to the connected broker only through the platform risk and execution controls. The broker remains the venue that accepts or rejects orders.',
  },
  {
    key: EligibilityDisclosureKey.LEGAL_ELIGIBILITY_ATTESTATION,
    version: '1.0',
    title: 'Age and legal eligibility attestation',
    body: 'I confirm that I am at least 18 years old, have the legal capacity to enter into this agreement, and am legally permitted to use automated trading services in the jurisdiction associated with my account.',
  },
] as const;

@Injectable()
export class EligibilityService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserDisclosureConsent)
    private readonly consentRepo: Repository<UserDisclosureConsent>,
    @InjectRepository(UserEligibilityReview)
    private readonly reviewRepo: Repository<UserEligibilityReview>,
    @InjectRepository(UserKycReview)
    private readonly kycReviewRepo: Repository<UserKycReview>,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async getStatus(userId: string): Promise<EligibilityStatusView> {
    const user = await this.userRepo.findOne({ where: { id: userId }, relations: ['profile'] });
    if (!user) throw new NotFoundException('User not found.');
    return this.buildStatus(user);
  }

  async acceptDisclosures(
    userId: string,
    dto: AcceptEligibilityDisclosuresDto,
  ): Promise<EligibilityStatusView> {
    const user = await this.userRepo.findOne({ where: { id: userId }, relations: ['profile'] });
    if (!user) throw new NotFoundException('User not found.');

    const currentDefinitions = this.currentDisclosures();
    const definitionsByKey = new Map(currentDefinitions.map((item) => [item.key, item]));
    const seen = new Set<EligibilityDisclosureKey>();
    const accepted: Array<{ key: EligibilityDisclosureKey; version: string }> = [];

    for (const acceptance of dto.acceptances) {
      if (seen.has(acceptance.key)) {
        throw new BadRequestException(`Duplicate disclosure acceptance: ${acceptance.key}`);
      }
      seen.add(acceptance.key);

      const definition = definitionsByKey.get(acceptance.key);
      if (
        !definition ||
        definition.version !== acceptance.version ||
        definition.contentSha256 !== acceptance.contentSha256
      ) {
        throw new BadRequestException(
          `Disclosure ${acceptance.key} does not match the current required version. Refresh eligibility disclosures and try again.`,
        );
      }

      const existing = await this.consentRepo.findOne({
        where: {
          userId,
          disclosureKey: acceptance.key,
          disclosureVersion: acceptance.version,
          contentSha256: acceptance.contentSha256,
        },
      });

      if (!existing) {
        await this.consentRepo.save(
          this.consentRepo.create({
            userId,
            disclosureKey: acceptance.key,
            disclosureVersion: acceptance.version,
            contentSha256: acceptance.contentSha256,
            acceptedAt: new Date(),
          }),
        );
      }

      accepted.push({ key: acceptance.key, version: acceptance.version });
    }

    await this.auditService.log({
      actorUserId: userId,
      action: AuditAction.ELIGIBILITY_DISCLOSURES_ACCEPTED,
      resourceType: 'UserEligibility',
      resourceId: userId,
      metadata: { disclosures: accepted },
    });

    return this.buildStatus(user);
  }

  async listReviewQueue(): Promise<EligibilityReviewQueueItem[]> {
    const users = await this.userRepo.find({
      where: { status: UserStatus.ACTIVE },
      order: { createdAt: 'ASC' },
      take: 200,
    });

    const queue: EligibilityReviewQueueItem[] = [];
    for (const user of users) {
      if (user.status !== UserStatus.ACTIVE || !user.countryCode) continue;

      const decision = await this.evaluateJurisdiction(user.id, user.countryCode);
      if (decision.status !== 'REVIEW_REQUIRED') continue;

      queue.push({
        userId: user.id,
        email: user.email,
        countryCode: user.countryCode.toUpperCase(),
        policyVersion: this.policyVersion(),
        jurisdictionStatus: 'REVIEW_REQUIRED',
        reasonCode: decision.reasonCode,
      });
    }
    return queue;
  }

  async listKycReviewQueue(): Promise<KycReviewQueueItem[]> {
    const users = await this.userRepo.find({
      where: { status: UserStatus.ACTIVE },
      relations: ['profile'],
      order: { createdAt: 'ASC' },
      take: 200,
    });

    const queue: KycReviewQueueItem[] = [];
    for (const user of users) {
      const profile = user.profile;
      if (user.status !== UserStatus.ACTIVE || !profile?.dateOfBirth) continue;
      if (this.evaluateAge(profile.dateOfBirth) !== 'ADULT') continue;

      const kycStatus = await this.resolveKycStatus(
        user.id,
        profile.dateOfBirth,
        profile.kycStatus,
      );
      if (kycStatus !== KycStatus.NONE && kycStatus !== KycStatus.PENDING) continue;

      queue.push({
        userId: user.id,
        email: user.email,
        countryCode: user.countryCode?.toUpperCase() ?? null,
        dateOfBirth: profile.dateOfBirth,
        ageStatus: 'ADULT',
        kycStatus,
        reasonCode: kycStatus === KycStatus.PENDING ? 'KYC_PENDING' : 'KYC_REQUIRED',
      });
    }

    return queue;
  }

  async reviewUser(
    userId: string,
    reviewerUserId: string,
    dto: ReviewUserEligibilityDto,
  ): Promise<EligibilityStatusView> {
    const user = await this.userRepo.findOne({ where: { id: userId }, relations: ['profile'] });
    if (!user) throw new NotFoundException('User not found.');
    if (!user.countryCode) {
      throw new BadRequestException('The user must complete country information before review.');
    }

    const countryCode = user.countryCode.toUpperCase();
    const baseDecision = this.evaluatePolicy(countryCode);
    if (baseDecision.status === 'ELIGIBLE') {
      throw new BadRequestException('This jurisdiction is already allowed by the active policy.');
    }
    if (baseDecision.status === 'INELIGIBLE') {
      throw new BadRequestException(
        'This jurisdiction is explicitly blocked by the active policy and cannot be overridden by review.',
      );
    }

    const review = await this.reviewRepo.save(
      this.reviewRepo.create({
        userId,
        countryCode,
        policyVersion: this.policyVersion(),
        decision: dto.decision,
        reasonCode: dto.reasonCode.trim().toUpperCase(),
        reviewerUserId,
        reviewerNote: dto.reviewerNote?.trim() || null,
      }),
    );

    await this.auditService.log({
      actorUserId: reviewerUserId,
      action: AuditAction.ELIGIBILITY_REVIEW_RECORDED,
      resourceType: 'UserEligibilityReview',
      resourceId: review.id,
      metadata: {
        userId,
        countryCode,
        policyVersion: review.policyVersion,
        decision: review.decision,
        reasonCode: review.reasonCode,
      },
    });

    return this.buildStatus(user);
  }

  async reviewKyc(
    userId: string,
    reviewerUserId: string,
    dto: ReviewUserKycDto,
  ): Promise<EligibilityStatusView> {
    const user = await this.userRepo.findOne({ where: { id: userId }, relations: ['profile'] });
    if (!user) throw new NotFoundException('User not found.');
    if (!user.profile?.dateOfBirth) {
      throw new BadRequestException('The user must provide a date of birth before KYC review.');
    }

    const ageStatus = this.evaluateAge(user.profile.dateOfBirth);
    if (ageStatus !== 'ADULT') {
      throw new BadRequestException(
        'KYC approval is not available unless the adult-age requirement is met.',
      );
    }

    const review = await this.kycReviewRepo.save(
      this.kycReviewRepo.create({
        userId,
        dateOfBirth: user.profile.dateOfBirth,
        decision: dto.decision,
        reasonCode: dto.reasonCode.trim().toUpperCase(),
        reviewerUserId,
        reviewerNote: dto.reviewerNote?.trim() || null,
      }),
    );

    const reviewedAt = review.createdAt ?? new Date();
    user.profile.kycSubmittedAt = user.profile.kycSubmittedAt ?? reviewedAt;
    if (dto.decision === KycReviewDecision.APPROVED) {
      user.profile.kycStatus = KycStatus.APPROVED;
      user.profile.kycApprovedAt = reviewedAt;
    } else {
      user.profile.kycStatus = KycStatus.REJECTED;
      user.profile.kycApprovedAt = null;
    }
    await this.userRepo.save(user);

    await this.auditService.log({
      actorUserId: reviewerUserId,
      action: AuditAction.ADMIN_ACTION,
      resourceType: 'UserKycReview',
      resourceId: review.id,
      metadata: {
        actionType: 'KYC_REVIEW_RECORDED',
        userId,
        decision: review.decision,
        reasonCode: review.reasonCode,
      },
    });

    return this.buildStatus(user);
  }

  private async buildStatus(user: User): Promise<EligibilityStatusView> {
    const countryCode = user.countryCode?.toUpperCase() ?? null;
    const decision = await this.evaluateJurisdiction(user.id, countryCode);
    const disclosures = this.currentDisclosures();
    const consentRows = await this.consentRepo.find({
      where: { userId: user.id },
      order: { acceptedAt: 'ASC' },
    });

    const currentConsentByKey = new Map<EligibilityDisclosureKey, UserDisclosureConsent>();
    for (const disclosure of disclosures) {
      const match = consentRows.find(
        (row) =>
          row.disclosureKey === disclosure.key &&
          row.disclosureVersion === disclosure.version &&
          row.contentSha256 === disclosure.contentSha256,
      );
      if (match) currentConsentByKey.set(disclosure.key, match);
    }

    const missingConsentKeys = disclosures
      .filter((item) => !currentConsentByKey.has(item.key))
      .map((item) => item.key);

    const consents = disclosures.flatMap((item) => {
      const row = currentConsentByKey.get(item.key);
      return row
        ? [
            {
              key: row.disclosureKey,
              version: row.disclosureVersion,
              contentSha256: row.contentSha256,
              acceptedAt: row.acceptedAt.toISOString(),
            },
          ]
        : [];
    });

    const dateOfBirth = user.profile?.dateOfBirth ?? null;
    const ageStatus = this.evaluateAge(dateOfBirth);
    const kycStatus = await this.resolveKycStatus(
      user.id,
      dateOfBirth,
      user.profile?.kycStatus ?? KycStatus.NONE,
    );
    const identityReasonCode = this.identityReason(ageStatus, kycStatus);

    return {
      policyVersion: this.policyVersion(),
      countryCode,
      jurisdictionStatus: decision.status,
      decisionSource: decision.source,
      reasonCode: decision.reasonCode,
      reviewedAt: decision.reviewedAt?.toISOString() ?? null,
      ageStatus,
      kycStatus,
      identityReasonCode,
      disclosures,
      consents,
      missingConsentKeys,
      canProceed:
        decision.status === 'ELIGIBLE' &&
        ageStatus === 'ADULT' &&
        kycStatus === KycStatus.APPROVED &&
        missingConsentKeys.length === 0,
    };
  }

  private async resolveKycStatus(
    userId: string,
    dateOfBirth: string | null,
    profileStatus: KycStatus,
  ): Promise<KycStatus> {
    if (!dateOfBirth) return KycStatus.NONE;

    const review = await this.kycReviewRepo.findOne({
      where: { userId, dateOfBirth },
      order: { createdAt: 'DESC' },
    });

    if (!review) {
      // A mutable APPROVED flag without immutable evidence is never trusted.
      // Other non-approved states remain fail-closed and may continue through
      // the normal review workflow.
      return profileStatus === KycStatus.APPROVED ? KycStatus.NONE : profileStatus;
    }

    return review.decision === KycReviewDecision.APPROVED ? KycStatus.APPROVED : KycStatus.REJECTED;
  }

  private async evaluateJurisdiction(
    userId: string,
    countryCode: string | null,
  ): Promise<JurisdictionDecision> {
    if (!countryCode) {
      return {
        status: 'MISSING_PROFILE',
        source: 'POLICY',
        reasonCode: 'COUNTRY_REQUIRED',
        reviewedAt: null,
      };
    }

    const normalized = countryCode.toUpperCase();
    const policyDecision = this.evaluatePolicy(normalized);
    if (policyDecision.status !== 'REVIEW_REQUIRED') return policyDecision;

    const review = await this.reviewRepo.findOne({
      where: {
        userId,
        countryCode: normalized,
        policyVersion: this.policyVersion(),
      },
      order: { createdAt: 'DESC' },
    });

    if (!review) return policyDecision;
    return review.decision === EligibilityReviewDecision.APPROVED
      ? {
          status: 'ELIGIBLE',
          source: 'ADMIN_REVIEW',
          reasonCode: review.reasonCode,
          reviewedAt: review.createdAt,
        }
      : {
          status: 'INELIGIBLE',
          source: 'ADMIN_REVIEW',
          reasonCode: review.reasonCode,
          reviewedAt: review.createdAt,
        };
  }

  private evaluatePolicy(countryCode: string): JurisdictionDecision {
    const blocked = this.countrySet('ELIGIBILITY_BLOCKED_COUNTRY_CODES');
    if (blocked.has(countryCode)) {
      return {
        status: 'INELIGIBLE',
        source: 'POLICY',
        reasonCode: 'POLICY_BLOCKED',
        reviewedAt: null,
      };
    }

    const allowed = this.countrySet('ELIGIBILITY_ALLOWED_COUNTRY_CODES');
    if (allowed.has(countryCode)) {
      return {
        status: 'ELIGIBLE',
        source: 'POLICY',
        reasonCode: 'POLICY_ALLOWED',
        reviewedAt: null,
      };
    }

    const explicitlyReviewed = this.countrySet('ELIGIBILITY_REVIEW_COUNTRY_CODES');
    return {
      status: 'REVIEW_REQUIRED',
      source: 'POLICY',
      reasonCode: explicitlyReviewed.has(countryCode)
        ? 'POLICY_REVIEW_REQUIRED'
        : 'UNCLASSIFIED_JURISDICTION',
      reviewedAt: null,
    };
  }

  private evaluateAge(dateOfBirth: string | null): EligibilityAgeStatus {
    if (!dateOfBirth) return 'MISSING_DOB';

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
    if (!match) return 'INVALID_DOB';

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const dob = new Date(Date.UTC(year, month - 1, day));
    if (
      dob.getUTCFullYear() !== year ||
      dob.getUTCMonth() !== month - 1 ||
      dob.getUTCDate() !== day
    ) {
      return 'INVALID_DOB';
    }

    const now = new Date();
    let age = now.getUTCFullYear() - year;
    const monthDelta = now.getUTCMonth() - (month - 1);
    if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < day)) age -= 1;
    return age >= 18 ? 'ADULT' : 'UNDER_18';
  }

  private identityReason(ageStatus: EligibilityAgeStatus, kycStatus: KycStatus): string {
    if (ageStatus === 'MISSING_DOB') return 'DOB_REQUIRED';
    if (ageStatus === 'INVALID_DOB') return 'DOB_INVALID';
    if (ageStatus === 'UNDER_18') return 'AGE_REQUIREMENT_NOT_MET';
    if (kycStatus === KycStatus.APPROVED) return 'IDENTITY_APPROVED';
    if (kycStatus === KycStatus.PENDING) return 'KYC_PENDING';
    if (kycStatus === KycStatus.REJECTED) return 'KYC_REJECTED';
    return 'KYC_REQUIRED';
  }

  private currentDisclosures(): EligibilityDisclosureView[] {
    return DISCLOSURES.map((item) => ({
      ...item,
      contentSha256: createHash('sha256').update(item.body, 'utf8').digest('hex'),
      required: true as const,
    }));
  }

  private policyVersion(): string {
    return this.configService.get<string>('ELIGIBILITY_POLICY_VERSION')?.trim() || 'eligibility.v1';
  }

  private countrySet(key: string): Set<string> {
    const raw = this.configService.get<string>(key) ?? '';
    return new Set(
      raw
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter((item) => /^[A-Z]{2}$/.test(item)),
    );
  }
}
