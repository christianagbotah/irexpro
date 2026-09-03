import { RoleName } from '../../users/entities/role.entity';
import { User, UserStatus } from '../../users/entities/user.entity';
import { UserProfile } from '../../users/entities/user-profile.entity';
import { AuthUserDto } from './auth-user.dto';

describe('AuthUserDto', () => {
  it('exposes verification booleans without exposing verification material or secrets', () => {
    const user = {
      id: 'user-1',
      email: 'person@example.com',
      phone: '+233241234567',
      countryCode: 'GH',
      status: UserStatus.ACTIVE,
      mfaEnabled: true,
      mfaSecret: 'encrypted-server-only-secret',
      passwordHash: 'server-only-password-hash',
      emailVerifiedAt: new Date('2026-09-01T10:00:00.000Z'),
      phoneVerifiedAt: null,
      lastLoginAt: new Date('2026-09-02T10:00:00.000Z'),
      createdAt: new Date('2026-08-01T10:00:00.000Z'),
    } as User;
    const profile = {
      firstName: 'Ada',
      lastName: 'Mensah',
    } as UserProfile;

    const dto = AuthUserDto.fromUser(user, [RoleName.USER], profile);
    const serialized = dto as unknown as Record<string, unknown>;

    expect(dto.emailVerified).toBe(true);
    expect(dto.phoneVerified).toBe(false);
    expect(dto.mfaEnabled).toBe(true);
    expect(serialized).not.toHaveProperty('mfaSecret');
    expect(serialized).not.toHaveProperty('passwordHash');
    expect(serialized).not.toHaveProperty('emailVerifiedAt');
    expect(serialized).not.toHaveProperty('phoneVerifiedAt');
  });
});
