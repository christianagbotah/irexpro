import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { runWithCorrelationId } from '../../common/utils/request-correlation.util';
import { AuditService } from './audit.service';
import { AuditLog, AuditSeverity } from './entities/audit-log.entity';

const mockAuditLogRepo = {
  create: jest.fn(),
  save: jest.fn(),
};

describe('AuditService', () => {
  let module: TestingModule;
  let service: AuditService;

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getRepositoryToken(AuditLog), useValue: mockAuditLogRepo },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create an audit log entry with correct payload', async () => {
    const createdEntry = { id: 'audit-id', action: AuditAction.USER_REGISTERED };
    mockAuditLogRepo.create.mockReturnValue(createdEntry);
    mockAuditLogRepo.save.mockResolvedValue(createdEntry);

    await service.log({
      actorUserId: 'user-123',
      action: AuditAction.USER_REGISTERED,
      resourceType: 'User',
      resourceId: 'user-123',
      ipAddress: '127.0.0.1',
      metadata: { email: 'test@example.com' },
    });

    expect(mockAuditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user-123',
        action: AuditAction.USER_REGISTERED,
        resourceType: 'User',
        correlationId: null,
        severity: AuditSeverity.INFO,
      }),
    );
    expect(mockAuditLogRepo.save).toHaveBeenCalledTimes(1);
  });

  it('inherits the current request correlation ID automatically', async () => {
    const correlationId = '11111111-1111-4111-8111-111111111111';
    mockAuditLogRepo.create.mockReturnValue({ id: 'audit-id' });
    mockAuditLogRepo.save.mockResolvedValue({ id: 'audit-id' });

    await runWithCorrelationId(correlationId, () =>
      service.log({ action: AuditAction.USER_LOGIN_SUCCESS }),
    );

    expect(mockAuditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId }),
    );
  });

  it('recursively redacts secret-bearing metadata before persistence', async () => {
    mockAuditLogRepo.create.mockReturnValue({ id: 'audit-id' });
    mockAuditLogRepo.save.mockResolvedValue({ id: 'audit-id' });

    const metadata = {
      provider: 'example',
      accessToken: 'secret-access-token',
      nested: {
        password: 'secret-password',
        apiKey: 'secret-api-key',
        safeValue: 'visible',
      },
    };

    await service.log({
      action: AuditAction.USER_LOGIN_FAILED,
      metadata,
    });

    expect(mockAuditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          provider: 'example',
          accessToken: '[REDACTED]',
          nested: {
            password: '[REDACTED]',
            apiKey: '[REDACTED]',
            safeValue: 'visible',
          },
        },
      }),
    );
    expect(metadata.accessToken).toBe('secret-access-token');
  });

  it('should not throw if database save fails (non-disruptive)', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    mockAuditLogRepo.create.mockReturnValue({});
    mockAuditLogRepo.save.mockRejectedValue(new Error('DB error'));

    await expect(service.log({ action: AuditAction.USER_LOGIN_SUCCESS })).resolves.not.toThrow();

    jest.restoreAllMocks();
  });

  it('should use WARNING severity when specified', async () => {
    const entry = { id: 'audit-id', severity: AuditSeverity.WARNING };
    mockAuditLogRepo.create.mockReturnValue(entry);
    mockAuditLogRepo.save.mockResolvedValue(entry);

    await service.log({
      action: AuditAction.SUBSCRIPTION_MANUAL_ACTIVATED,
      severity: AuditSeverity.WARNING,
    });

    expect(mockAuditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ severity: AuditSeverity.WARNING }),
    );
  });
});
