import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';

export const INTERNAL_API_KEY_HEADER = 'x-irexpro-internal-api-key';

/**
 * InternalApiKeyGuard
 *
 * Protects endpoints intended for service-to-service communication only
 * (e.g., Python AI Engine → NestJS signal intake).
 *
 * Security rules:
 * - Validates x-irexpro-internal-api-key header using constant-time comparison
 * - Blocks the endpoint entirely if NESTJS_INTERNAL_API_KEY is not configured
 * - Never logs the key value
 * - Does not replace JWT authentication for user-facing endpoints
 */
@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(InternalApiKeyGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers[INTERNAL_API_KEY_HEADER] as string | undefined;

    const expectedKey = this.configService.get<string>('internalApi.key');

    if (!expectedKey) {
      this.logger.error(
        'NESTJS_INTERNAL_API_KEY is not configured — internal endpoint blocked',
      );
      throw new UnauthorizedException(
        'Internal API key not configured. Contact platform administrator.',
      );
    }

    if (!providedKey) {
      this.logger.warn(
        `Internal endpoint called without ${INTERNAL_API_KEY_HEADER} header — BLOCKED`,
      );
      throw new UnauthorizedException(
        `Missing required header: ${INTERNAL_API_KEY_HEADER}`,
      );
    }

    // Constant-time comparison to prevent timing attacks.
    // timingSafeEqual requires same-length buffers — pad/compare length first
    // then do the constant-time comparison to avoid length oracle.
    const providedBuf = Buffer.from(providedKey);
    const expectedBuf = Buffer.from(expectedKey);

    // Using a hash comparison to normalise lengths and prevent length-based timing
    const providedHash = crypto.createHmac('sha256', 'irexpro-key-compare').update(providedBuf).digest();
    const expectedHash = crypto.createHmac('sha256', 'irexpro-key-compare').update(expectedBuf).digest();

    const keysMatch = crypto.timingSafeEqual(providedHash, expectedHash);

    if (!keysMatch) {
      this.logger.warn('Internal endpoint called with invalid API key — BLOCKED');
      throw new UnauthorizedException('Invalid internal API key');
    }

    return true;
  }
}
