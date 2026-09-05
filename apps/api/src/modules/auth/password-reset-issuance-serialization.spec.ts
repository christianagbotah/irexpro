import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { User, UserStatus } from '../users/entities/user.entity';
import { PasswordResetDeliveryService } from './password-reset-delivery.service';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { PasswordResetService } from './password-reset.service';

const PEPPER = 'reset-issuance-test-pepper-at-least-32-characters';

describe('PasswordResetService reset-token issuance serialization', () => {
  const resetTokenRepo = {
    findOne: jest.fn(),
    create: jest.fn((data) => ({ ...data, id: 'new-reset-token' })),
    update: jest.fn(),
    save: jest.fn(async (entity) => entity),
  };
  const userRepo = { findOne: jest.fn() };
  const auditService = { log: jest.fn() };
  const deliveryService = { deliver: jest.fn().mockResolvedValue(true) };
  const configService = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'auth.verificationPepper') return PEPPER;
      if (key === 'auth.argon2MemoryCost') return 1024;
      if (key === 'auth.argon2TimeCost') return 2;
      if (key === 'auth.argon2Parallelism') return 1;
      return fallback;
    }),
  };
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      findOne: jest.fn(),
      getRepository: jest.fn(),
      update: jest.fn(),
    },
  };
  const dataSource = { createQueryRunner: jest.fn(() => queryRunner) };

  let module: TestingModule;
  let service: PasswordResetService;

  beforeEach(async () => {
    jest.clearAllMocks();
    resetTokenRepo.update.mockResolvedValue({ affected: 1 });
    resetTokenRepo.save.mockImplementation(async (entity) => entity);
    queryRunner.manager.findOne.mockResolvedValue({ id: 'user-1' });
    queryRunner.manager.getRepository.mockReturnValue(resetTokenRepo);
    deliveryService.deliver.mockResolvedValue(true);
    configService.get.mockImplementation((key: string, fallback?: unknown) => {
      if (key === 'auth.verificationPepper') return PEPPER;
      if (key === 'auth.argon2MemoryCost') return 1024;
      if (key === 'auth.argon2TimeCost') return 2;
      if (key === 'auth.argon2Parallelism') return 1;
      return fallback;
    });

    module = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        { provide: getRepositoryToken(PasswordResetToken), useValue: resetTokenRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: AuditService, useValue: auditService },
        { provide: PasswordResetDeliveryService, useValue: deliveryService },
        { provide: ConfigService, useValue: configService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(PasswordResetService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('locks the user before invalidating and saving, then commits before external delivery', async () => {
    userRepo.findOne.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      phone: null,
      status: UserStatus.ACTIVE,
    });

    const result = await service.requestReset('user@example.com');

    expect(result).toEqual({ delivered: true, channel: 'EMAIL' });
    expect(queryRunner.manager.findOne).toHaveBeenCalledWith(User, {
      where: { id: 'user-1' },
      select: { id: true },
      lock: { mode: 'pessimistic_write' },
    });
    expect(queryRunner.manager.getRepository).toHaveBeenCalledWith(PasswordResetToken);
    expect(resetTokenRepo.update).toHaveBeenCalledWith(
      { userId: 'user-1', usedAt: expect.anything() },
      { usedAt: expect.any(Date) },
    );
    expect(resetTokenRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', usedAt: null }),
    );

    const lockOrder = queryRunner.manager.findOne.mock.invocationCallOrder[0];
    const invalidateOrder = resetTokenRepo.update.mock.invocationCallOrder[0];
    const saveOrder = resetTokenRepo.save.mock.invocationCallOrder[0];
    const commitOrder = queryRunner.commitTransaction.mock.invocationCallOrder[0];
    const deliveryOrder = deliveryService.deliver.mock.invocationCallOrder[0];

    expect(lockOrder).toBeLessThan(invalidateOrder);
    expect(invalidateOrder).toBeLessThan(saveOrder);
    expect(saveOrder).toBeLessThan(commitOrder);
    expect(commitOrder).toBeLessThan(deliveryOrder);
  });

  it('rolls back persistence failure and never delivers or audits an uncommitted token', async () => {
    userRepo.findOne.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      phone: null,
      status: UserStatus.ACTIVE,
    });
    resetTokenRepo.save.mockRejectedValueOnce(new Error('database write failed'));

    await expect(service.requestReset('user@example.com')).rejects.toThrow('database write failed');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(deliveryService.deliver).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('fails before opening the issuance transaction when the phone reset pepper is unavailable', async () => {
    configService.get.mockImplementation((key: string, fallback?: unknown) => {
      if (key === 'auth.verificationPepper') return undefined;
      return fallback;
    });
    userRepo.findOne.mockResolvedValueOnce({
      id: 'phone-user',
      email: null,
      phone: '+233241234567',
      status: UserStatus.ACTIVE,
    });

    await expect(service.requestReset('+233241234567')).rejects.toThrow(
      ServiceUnavailableException,
    );

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(resetTokenRepo.update).not.toHaveBeenCalled();
    expect(resetTokenRepo.save).not.toHaveBeenCalled();
    expect(deliveryService.deliver).not.toHaveBeenCalled();
  });

  it('returns the generic response without persisting when the user disappears before locking', async () => {
    userRepo.findOne.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      phone: null,
      status: UserStatus.ACTIVE,
    });
    queryRunner.manager.findOne.mockResolvedValueOnce(null);

    const result = await service.requestReset('user@example.com');

    expect(result).toEqual({ delivered: false, channel: null });
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(resetTokenRepo.update).not.toHaveBeenCalled();
    expect(resetTokenRepo.save).not.toHaveBeenCalled();
    expect(deliveryService.deliver).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });
});
