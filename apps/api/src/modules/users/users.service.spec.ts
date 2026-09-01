import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { KycStatus, UserProfile } from './entities/user-profile.entity';
import { User, UserStatus } from './entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService Sprint 45 DOB/KYC invariants', () => {
  let service: UsersService;
  let module: TestingModule;

  const userRepo = {
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    save: jest.fn(async (value) => value),
  };
  const profileRepo = {
    findOne: jest.fn(),
    save: jest.fn(async (value) => value),
  };
  const roleRepo = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(UserProfile), useValue: profileRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  afterEach(async () => module.close());

  it('resets approved KYC whenever the stored date of birth changes', async () => {
    const user = {
      id: 'user-1',
      status: UserStatus.ACTIVE,
      profile: {
        userId: 'user-1',
        dateOfBirth: '1990-01-01',
        kycStatus: KycStatus.APPROVED,
        kycSubmittedAt: new Date('2026-08-01T00:00:00Z'),
        kycApprovedAt: new Date('2026-08-02T00:00:00Z'),
      },
    } as User;

    userRepo.findOne.mockResolvedValueOnce(user).mockResolvedValueOnce(user);

    const updated = await service.updateMyProfile(user.id, { dateOfBirth: '1991-02-03' });

    expect(profileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        dateOfBirth: '1991-02-03',
        kycStatus: KycStatus.NONE,
        kycSubmittedAt: null,
        kycApprovedAt: null,
      }),
    );
    expect(updated.profile.kycStatus).toBe(KycStatus.NONE);
  });

  it('rejects invalid or future calendar dates before persistence', async () => {
    const user = {
      id: 'user-1',
      status: UserStatus.ACTIVE,
      profile: {
        userId: 'user-1',
        dateOfBirth: null,
        kycStatus: KycStatus.NONE,
      },
    } as User;
    userRepo.findOne.mockResolvedValue(user);

    await expect(
      service.updateMyProfile(user.id, { dateOfBirth: '2026-02-31' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const future = tomorrow.toISOString().slice(0, 10);
    await expect(service.updateMyProfile(user.id, { dateOfBirth: future })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(profileRepo.save).not.toHaveBeenCalled();
  });
});
