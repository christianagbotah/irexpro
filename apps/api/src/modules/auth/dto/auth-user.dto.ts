import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from '../../users/entities/user.entity';
import { UserProfile } from '../../users/entities/user-profile.entity';
import { RoleName } from '../../users/entities/role.entity';

/**
 * Frontend-safe AuthUser DTO — returned by GET /auth/me.
 *
 * Sprint 25 hardening: this DTO replaces the previous approach of returning
 * the raw User entity minus passwordHash/mfaSecret. It explicitly allowlists
 * ONLY the fields the frontend needs, and includes roles (from the JWT payload
 * via request.user.roles) + firstName/lastName (from the UserProfile relation).
 *
 * Sensitive fields that are NEVER included:
 *   - passwordHash
 *   - mfaSecret
 *   - deletedAt
 *   - userRoles (the raw join-entity array with nested role objects)
 *   - profile (the raw UserProfile entity with PII like address, DOB, KYC)
 *   - any provider secrets, broker secrets, or internal security fields
 */
export class AuthUserDto {
  @ApiProperty({ example: 'a1b2c3d4-...' })
  id: string;

  @ApiPropertyOptional({
    example: 'user@example.com',
    description: 'Null if registered with phone only',
  })
  email: string | null;

  @ApiPropertyOptional({
    example: '+233241234567',
    description: 'Null if registered with email only',
  })
  phone: string | null;

  @ApiPropertyOptional({ example: 'John' })
  firstName: string | null;

  @ApiPropertyOptional({ example: 'Doe' })
  lastName: string | null;

  @ApiPropertyOptional({ example: 'GH' })
  countryCode: string | null;

  @ApiProperty({
    example: 'ACTIVE',
    enum: ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'PERMANENTLY_LOCKED', 'CLOSED'],
  })
  status: string;

  @ApiProperty({ example: ['USER'], isArray: true, enum: RoleName })
  roles: RoleName[];

  @ApiPropertyOptional({ example: false })
  mfaEnabled: boolean;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  lastLoginAt: string | null;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: string;

  /**
   * Build an AuthUserDto from a User entity + roles array.
   * The roles come from the JWT payload (request.user.roles), which is set
   * by JwtStrategy.validate() from the user's assigned roles at token-sign
   * time. The profile relation is optionally loaded to extract firstName/lastName.
   */
  static fromUser(user: User, roles: RoleName[], profile?: UserProfile | null): AuthUserDto {
    const dto = new AuthUserDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.phone = user.phone;
    dto.firstName = profile?.firstName ?? null;
    dto.lastName = profile?.lastName ?? null;
    dto.countryCode = user.countryCode;
    dto.status = user.status;
    dto.roles = roles;
    dto.mfaEnabled = user.mfaEnabled;
    dto.lastLoginAt = user.lastLoginAt ? user.lastLoginAt.toISOString() : null;
    dto.createdAt = user.createdAt ? user.createdAt.toISOString() : new Date(0).toISOString();
    return dto;
  }
}
