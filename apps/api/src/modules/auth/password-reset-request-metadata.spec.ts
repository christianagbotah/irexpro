import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { User, UserStatus } from '../users/entities/user.entity';
import { PasswordResetDeliveryService } from './password-reset-delivery.service';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { PasswordResetService } from './password-reset.service';

describe('PasswordResetService request metadata bounds', () => {
  const resetTokenRepo = {
    findOne: jest.fn(),
    create: jest.fn((data) => ({ ...data, id: 'reset-token-id' })),
    update: jest.fn(),
    save: jest.fn(async (entity) => entity),
  };
  const userRepo = { findOne: jest.fn() };
  const auditService = { log: jest.fn() };
  const deliveryService = { deliver: jest.fn().mockResolvedValue(true) };
  const configService = {
    get: jest.fn((_key: string, fallback?: unknown) => fallback),
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
    },
  };
  const dataSource = { createQueryRunner: jest.fn(() => queryRunner) };

  let module: TestingModule;
  let service: PasswordResetService;

  beforeEach(async () => {
    jest.clearAllMocks();
    userRepo.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      phone: null,
      status: UserStatus.ACTIVE,
    });
    resetTokenRepo.update.mockResolvedValue({ affected: 1 });
    resetTokenRepo.save.mockImplementation(async (entity) => entity);
    deliveryService.deliver.mockResolvedValue(true);
    queryRunner.manager.findOne.mockResolvedValue({ id: 'user-1' });
    queryRunner.manager.getRepository.mockReturnValue(resetTokenRepo);

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

  it('bounds oversized User-Agent consistently before token persistence and audit logging', async () => {
    const oversizedUserAgent = 'a'.repeat(800);

    const result = await service.requestReset('user@example.com', {
      ipAddress: '203.0.113.10',
      userAgent: oversizedUserAgent,
    });

    expect(result.delivered).toBe(true);

    const createdToken = resetTokenRepo.create.mock.calls[0][0];
    const auditEvent = auditService.log.mock.calls[0][0];

    expect(createdToken.userAgent).toHaveLength(500);
    expect(createdToken.userAgent).toBe('a'.repeat(500));
    expect(auditEvent.userAgent).toBe(createdToken.userAgent);
    expect(createdToken.requestedIp).toBe('203.0.113.10');
    expect(auditEvent.ipAddress).toBe('203.0.113.10');
    expect(resetTokenRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userAgent: createdToken.userAgent }),
    );
  });

  it('preserves missing User-Agent semantics across persistence and audit logging', async () => {
    await service.requestReset('user@example.com', {
      ipAddress: '203.0.113.10',
    });

    const createdToken = resetTokenRepo.create.mock.calls[0][0];
    const auditEvent = auditService.log.mock.calls[0][0];

    expect(createdToken.userAgent).toBeNull();
    expect(auditEvent.userAgent).toBeUndefined();
    expect(createdToken.requestedIp).toBe('203.0.113.10');
    expect(auditEvent.ipAddress).toBe('203.0.113.10');
  });

  it('leaves an exactly 500-character User-Agent unchanged', async () => {
    const userAgent = 'b'.repeat(500);

    await service.requestReset('user@example.com', { userAgent });

    const createdToken = resetTokenRepo.create.mock.calls[0][0];
    const auditEvent = auditService.log.mock.calls[0][0];

    expect(createdToken.userAgent).toBe(userAgent);
    expect(auditEvent.userAgent).toBe(userAgent);
  });
});
