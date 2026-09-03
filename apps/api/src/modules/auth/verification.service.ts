import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditService } from '../audit/audit.service';
import { User, UserStatus } from '../users/entities/user.entity';
import { EmailVerificationDeliveryService } from './email-verification-delivery.service';
import {
  AuthVerificationToken,
  VerificationChannel,
} from './entities/auth-verification-token.entity';

@Injectable()
export class VerificationService {
  private static readonly EMAIL_TOKEN_TTL_MINUTES = 15;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AuthVerificationToken)
    private readonly tokenRepo: Repository<AuthVerificationToken>,
    private readonly emailDelivery: EmailVerificationDeliveryService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async requestEmailVerification(
    userId: string,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User session is no longer valid');
    if (!user.email)
      throw new BadRequestException('No email address is registered on this account');
    if (user.emailVerifiedAt) return;

    const webBaseUrl = this.configService.get<string>('app.webBaseUrl');
    if (!webBaseUrl || !this.emailDelivery.isConfigured()) {
      throw new ServiceUnavailableException('Email verification is temporarily unavailable');
    }

    const now = new Date();
    await this.tokenRepo.update(
      { userId: user.id, channel: VerificationChannel.EMAIL, usedAt: IsNull() },
      { usedAt: now },
    );

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hash(rawToken);
    const expiresAt = new Date(
      now.getTime() + VerificationService.EMAIL_TOKEN_TTL_MINUTES * 60 * 1000,
    );

    const record = this.tokenRepo.create({
      userId: user.id,
      tokenHash,
      channel: VerificationChannel.EMAIL,
      expiresAt,
      usedAt: null,
      requestedIp: context.ipAddress ?? null,
      userAgent: context.userAgent?.slice(0, 500) ?? null,
      attemptCount: 0,
    });
    await this.tokenRepo.save(record);

    const verificationLink = `${webBaseUrl.replace(/\/$/u, '')}/verify-email?token=${encodeURIComponent(rawToken)}`;
    const fromAddress = this.configService.get<string>('email.fromAddress', 'no-reply@irexpro.com');
    const delivered = await this.emailDelivery.send({
      to: user.email,
      verificationLink,
      fromAddress,
    });

    await this.auditService.log({
      actorUserId: user.id,
      action: AuditAction.USER_EMAIL_VERIFICATION_REQUESTED,
      resourceType: 'User',
      resourceId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        result: delivered ? 'sent' : 'delivery_failed',
        channel: 'email',
      },
    });

    if (!delivered) {
      throw new ServiceUnavailableException('Email verification is temporarily unavailable');
    }
  }

  async verifyEmail(rawToken: string, ipAddress?: string): Promise<void> {
    const tokenHash = this.hash(rawToken);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let verifiedUserId: string | null = null;
    try {
      const token = await queryRunner.manager.findOne(AuthVerificationToken, {
        where: {
          tokenHash,
          channel: VerificationChannel.EMAIL,
          usedAt: IsNull(),
        },
      });

      if (!token || token.expiresAt.getTime() <= Date.now()) {
        throw new UnauthorizedException('Invalid or expired verification token');
      }

      const consumed = await queryRunner.manager.update(
        AuthVerificationToken,
        { id: token.id, usedAt: IsNull() },
        { usedAt: new Date() },
      );
      if (consumed.affected !== 1) {
        throw new UnauthorizedException('Invalid or expired verification token');
      }

      const user = await queryRunner.manager.findOne(User, { where: { id: token.userId } });
      if (!user) throw new UnauthorizedException('Invalid or expired verification token');

      const userUpdate: Partial<User> = { emailVerifiedAt: new Date() };
      if (user.status === UserStatus.PENDING_VERIFICATION) {
        userUpdate.status = UserStatus.ACTIVE;
      }
      await queryRunner.manager.update(User, user.id, userUpdate);

      await queryRunner.commitTransaction();
      verifiedUserId = user.id;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    if (verifiedUserId) {
      await this.auditService.log({
        actorUserId: verifiedUserId,
        action: AuditAction.USER_EMAIL_VERIFIED,
        resourceType: 'User',
        resourceId: verifiedUserId,
        ipAddress,
        metadata: { result: 'success', channel: 'email' },
      });
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }
}
