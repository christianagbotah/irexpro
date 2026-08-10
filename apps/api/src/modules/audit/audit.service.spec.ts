import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditLog, AuditSeverity } from './entities/audit-log.entity';
import { AuditAction } from '../../common/enums/audit-action.enum';

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
        severity: AuditSeverity.INFO,
      }),
    );
    expect(mockAuditLogRepo.save).toHaveBeenCalledTimes(1);
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
