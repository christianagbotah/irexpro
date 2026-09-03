import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditService } from '../audit/audit.service';
import { User } from '../users/entities/user.entity';
import { buildOtpAuthUri, generateBase32Secret, verifyTotp } from './utils/totp.util';

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async beginSetup(
    userId: string,
    ipAddress?: string,
  ): Promise<{ secret: string; otpauthUri: string }> {
    const user = await this.requireUser(userId);
    if (user.mfaEnabled) {
      throw new ConflictException('MFA is already enabled');
    }

    const secret = generateBase32Secret();
    const encryptedSecret = this.encryptSecret(secret);
    await this.userRepo.update(user.id, { mfaSecret: encryptedSecret });

    await this.auditService.log({
      actorUserId: user.id,
      action: AuditAction.USER_MFA_SETUP_STARTED,
      resourceType: 'User',
      resourceId: user.id,
      ipAddress,
      metadata: { result: 'pending_verification', method: 'totp' },
    });

    return {
      secret,
      otpauthUri: buildOtpAuthUri({
        secret,
        accountLabel: user.email ?? user.phone ?? user.id,
      }),
    };
  }

  async enable(userId: string, code: string, ipAddress?: string): Promise<void> {
    const user = await this.requireUser(userId);
    if (user.mfaEnabled) {
      throw new ConflictException('MFA is already enabled');
    }
    if (!user.mfaSecret) {
      throw new BadRequestException('Start MFA setup before enabling it');
    }

    const secret = this.decryptSecretOrFailClosed(user.mfaSecret);
    if (!verifyTotp(secret, code)) {
      await this.auditChallengeFailure(user.id, 'enable', ipAddress);
      throw new UnauthorizedException('MFA verification failed');
    }

    await this.userRepo.update(user.id, {
      mfaEnabled: true,
      sessionVersion: () => '"session_version" + 1',
    });

    await this.auditService.log({
      actorUserId: user.id,
      action: AuditAction.USER_MFA_ENABLED,
      resourceType: 'User',
      resourceId: user.id,
      ipAddress,
      metadata: { result: 'success', method: 'totp', revokedExistingSessions: true },
    });
  }

  async disable(
    userId: string,
    code: string,
    password: string,
    ipAddress?: string,
  ): Promise<void> {
    const user = await this.requireUser(userId);
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA is not enabled');
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);
    const secret = this.decryptSecretOrFailClosed(user.mfaSecret);
    const codeValid = verifyTotp(secret, code);
    if (!passwordValid || !codeValid) {
      await this.auditChallengeFailure(user.id, 'disable', ipAddress);
      throw new UnauthorizedException('MFA verification failed');
    }

    await this.userRepo.update(user.id, {
      mfaEnabled: false,
      mfaSecret: null,
      sessionVersion: () => '"session_version" + 1',
    });

    await this.auditService.log({
      actorUserId: user.id,
      action: AuditAction.USER_MFA_DISABLED,
      resourceType: 'User',
      resourceId: user.id,
      ipAddress,
      metadata: { result: 'success', method: 'totp', revokedExistingSessions: true },
    });
  }

  verifyLoginChallenge(user: User, code?: string): boolean {
    if (!user.mfaEnabled) return true;
    if (!code || !user.mfaSecret) return false;
    const secret = this.decryptSecretOrFailClosed(user.mfaSecret);
    return verifyTotp(secret, code);
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User session is no longer valid');
    return user;
  }

  private async auditChallengeFailure(
    userId: string,
    operation: 'enable' | 'disable',
    ipAddress?: string,
  ): Promise<void> {
    await this.auditService.log({
      actorUserId: userId,
      action: AuditAction.USER_MFA_CHALLENGE_FAILED,
      resourceType: 'User',
      resourceId: userId,
      ipAddress,
      metadata: { result: 'failed', operation, method: 'totp' },
    });
  }

  private encryptionKey(): Buffer {
    const configured = this.configService.get<string>('auth.mfaEncryptionKey');
    if (!configured || configured.length < 32) {
      throw new ServiceUnavailableException('MFA is temporarily unavailable');
    }
    return createHash('sha256').update(configured, 'utf8').digest();
  }

  private encryptSecret(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
  }

  private decryptSecretOrFailClosed(stored: string): string {
    try {
      const [version, ivValue, tagValue, ciphertextValue] = stored.split('.');
      if (version !== 'v1' || !ivValue || !tagValue || !ciphertextValue) {
        throw new Error('Unsupported MFA secret format');
      }

      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey(),
        Buffer.from(ivValue, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error('Stored MFA secret could not be decrypted; MFA verification failed closed.');
      throw new ServiceUnavailableException('MFA is temporarily unavailable');
    }
  }
}
