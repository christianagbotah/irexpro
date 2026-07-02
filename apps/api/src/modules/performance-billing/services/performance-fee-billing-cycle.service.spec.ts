import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { IsNull, QueryFailedError } from 'typeorm';
import { PerformanceFeeBillingCycleService } from './performance-fee-billing-cycle.service';
import {
  BillingCycleStatus,
  PerformanceFeeBillingCycle,
} from '../entities/performance-fee-billing-cycle.entity';
import { AssessmentStatus } from '../../performance-fees/entities/performance-fee-assessment.entity';

// ── Shared dates ──────────────────────────────────────────────────────────────
const NOW = new Date('2026-06-01T00:00:00Z');
const FROM = new Date('2026-01-01T00:00:00Z');
const TO = new Date('2026-05-31T23:59:59Z');
const FUTURE = new Date('2099-01-01T00:00:00Z');
const ACTOR = 'admin-1';

// ── Mock factories ─────────────────────────────────────────────────────────────
function makeCycle(overrides: Partial<PerformanceFeeBillingCycle> = {}): PerformanceFeeBillingCycle {
  return {
    id: 'cycle-1',
    userId: 'user-1',
    brokerConnectionId: 'conn-1',
    periodStart: FROM,
    periodEnd: TO,
    currency: 'USD',
    status: BillingCycleStatus.DRAFT,
    reconciliationRunId: null,
    assessmentId: null,
    invoiceId: null,
    totalLedgerEntriesCreated: 0,
    totalRealisedProfit: '0',
    feeAmount: '0',
    errorSummary: null,
    metadata: null,
    createdByUserId: ACTOR,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    ...overrides,
  };
}

function makeAssessment(status = AssessmentStatus.ASSESSED, feeAmount = '100000') {
  return {
    id: 'assessment-1',
    userId: 'user-1',
    brokerConnectionId: 'conn-1',
    currency: 'USD',
    status,
    feeAmount,
    realisedProfitForFee: feeAmount,
    invoiceId: null,
    periodStart: FROM,
    periodEnd: TO,
  };
}

function makeAssessmentWithInvoice() {
  return { ...makeAssessment(), status: AssessmentStatus.INVOICED, invoiceId: 'invoice-1' };
}

function makeReconRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    totalBrokerTradesSeen: 5,
    newLedgerEntriesCreated: 3,
    duplicateTradesSkipped: 1,
    failedTrades: 0,
    status: 'COMPLETED',
    errorSummary: null,
    ...overrides,
  };
}

// ── Mocks ──────────────────────────────────────────────────────────────────────
let mockCycleRepo: any;
let mockReconService: any;
let mockPerfFeeService: any;
let mockAuditService: any;
let service: PerformanceFeeBillingCycleService;

beforeEach(() => {
  jest.clearAllMocks();

  mockCycleRepo = {
    create: jest.fn((x) => ({ ...x, id: 'cycle-1', createdAt: NOW, updatedAt: NOW, completedAt: null })),
    save: jest.fn(async (x) => ({ ...x, id: 'cycle-1' })),
    findOne: jest.fn(async () => makeCycle()),
    find: jest.fn(async () => []),
    update: jest.fn(async () => undefined),
  };

  mockReconService = {
    runReconciliation: jest.fn(async () => makeReconRun()),
  };

  mockPerfFeeService = {
    calculateAssessment: jest.fn(async () => makeAssessment()),
    invoiceAssessment: jest.fn(async () => makeAssessmentWithInvoice()),
  };

  mockAuditService = {
    log: jest.fn(async () => undefined),
  };

  service = new PerformanceFeeBillingCycleService(
    mockCycleRepo,
    mockReconService,
    mockPerfFeeService,
    mockAuditService,
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// createBillingCycle
// ═══════════════════════════════════════════════════════════════════════════════
describe('createBillingCycle', () => {
  it('creates a DRAFT cycle and emits audit event', async () => {
    const cycle = await service.createBillingCycle(
      'user-1', 'conn-1', FROM, TO, 'USD', ACTOR,
    );
    expect(cycle.id).toBe('cycle-1');
    expect(mockCycleRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: BillingCycleStatus.DRAFT, userId: 'user-1' }),
    );
    expect(mockAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PERFORMANCE_BILLING_CYCLE_CREATED' }),
    );
  });

  it('rejects periodStart >= periodEnd', async () => {
    await expect(
      service.createBillingCycle('user-1', 'conn-1', TO, FROM, 'USD', ACTOR),
    ).rejects.toThrow(BadRequestException);
    expect(mockCycleRepo.save).not.toHaveBeenCalled();
  });

  it('rejects future periodEnd', async () => {
    // FUTURE = 2099, clearly in the future at any real point in time
    await expect(
      service.createBillingCycle('user-1', 'conn-1', FROM, FUTURE, 'USD', ACTOR),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects window > 366 days', async () => {
    // Both dates in the past, >366 days apart
    const pastFrom = new Date('2020-01-01T00:00:00Z');
    const pastTo = new Date('2021-03-15T00:00:00Z'); // ~439 days later, clearly past
    await expect(
      service.createBillingCycle('user-1', 'conn-1', pastFrom, pastTo, 'USD', ACTOR),
    ).rejects.toThrow(BadRequestException);
  });

  it('wraps 23505 unique violation into ConflictException', async () => {
    const dupErr = new QueryFailedError('', [], new Error('unique'));
    (dupErr as any).code = '23505';
    mockCycleRepo.save.mockRejectedValueOnce(dupErr);

    await expect(
      service.createBillingCycle('user-1', 'conn-1', FROM, TO, 'USD', ACTOR),
    ).rejects.toThrow(ConflictException);
  });

  it('audit metadata contains no secrets', async () => {
    await service.createBillingCycle('user-1', 'conn-1', FROM, TO, 'USD', ACTOR);
    const [call] = mockAuditService.log.mock.calls;
    const meta = JSON.stringify(call[0].metadata ?? {});
    expect(meta).not.toMatch(/password|secret|token|apiKey|credential|webhook/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// runBillingCycle — state transitions
// ═══════════════════════════════════════════════════════════════════════════════
describe('runBillingCycle — state machine', () => {
  it('DRAFT → INVOICED happy path with positive fee', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.DRAFT }));
    const result = await service.runBillingCycle('cycle-1', ACTOR);
    expect(mockReconService.runReconciliation).toHaveBeenCalledTimes(1);
    expect(mockPerfFeeService.calculateAssessment).toHaveBeenCalledTimes(1);
    expect(mockPerfFeeService.invoiceAssessment).toHaveBeenCalledTimes(1);
    expect(mockCycleRepo.update).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({ status: BillingCycleStatus.INVOICED }),
    );
  });

  it('DRAFT → NO_FEE_DUE when feeAmount = 0', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.DRAFT }));
    mockPerfFeeService.calculateAssessment.mockResolvedValueOnce(
      makeAssessment(AssessmentStatus.DRAFT, '0'),
    );
    await service.runBillingCycle('cycle-1', ACTOR);
    expect(mockPerfFeeService.invoiceAssessment).not.toHaveBeenCalled();
    expect(mockCycleRepo.update).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({ status: BillingCycleStatus.NO_FEE_DUE }),
    );
  });

  it('FAILED cycle can be retried (FAILED → INVOICED)', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.FAILED }));
    await service.runBillingCycle('cycle-1', ACTOR);
    expect(mockReconService.runReconciliation).toHaveBeenCalledTimes(1);
    expect(mockCycleRepo.update).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({ status: BillingCycleStatus.INVOICED }),
    );
  });

  it('INVOICED cycle throws BadRequestException (final state guard)', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.INVOICED }));
    await expect(service.runBillingCycle('cycle-1', ACTOR)).rejects.toThrow(BadRequestException);
    expect(mockReconService.runReconciliation).not.toHaveBeenCalled();
  });

  it('NO_FEE_DUE cycle throws BadRequestException (final state guard)', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.NO_FEE_DUE }));
    await expect(service.runBillingCycle('cycle-1', ACTOR)).rejects.toThrow(BadRequestException);
    expect(mockReconService.runReconciliation).not.toHaveBeenCalled();
  });

  it('CANCELLED cycle throws BadRequestException (final state guard)', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.CANCELLED }));
    await expect(service.runBillingCycle('cycle-1', ACTOR)).rejects.toThrow(BadRequestException);
    expect(mockReconService.runReconciliation).not.toHaveBeenCalled();
  });

  it('RECONCILING cycle cannot be re-run (not DRAFT or FAILED)', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.RECONCILING }));
    await expect(service.runBillingCycle('cycle-1', ACTOR)).rejects.toThrow(BadRequestException);
  });

  it('reconciliation failure (thrown) transitions cycle to FAILED with safe errorSummary', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.DRAFT }));
    mockReconService.runReconciliation.mockRejectedValueOnce(new Error('Adapter timeout'));
    await service.runBillingCycle('cycle-1', ACTOR);
    expect(mockCycleRepo.update).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({
        status: BillingCycleStatus.FAILED,
        errorSummary: 'Adapter timeout',
      }),
    );
    // Invoice must not be created
    expect(mockPerfFeeService.invoiceAssessment).not.toHaveBeenCalled();
  });

  it('reconciliation run RETURNED with status=FAILED transitions cycle to FAILED (no throw)', async () => {
    // BrokerTradeReconciliationService catches adapter errors internally and
    // returns a FAILED run object rather than throwing. The billing cycle must
    // detect this and NOT proceed to assessment/invoice.
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.DRAFT }));
    mockReconService.runReconciliation.mockResolvedValueOnce(
      makeReconRun({ status: 'FAILED', newLedgerEntriesCreated: 0, errorSummary: 'Adapter down' }),
    );

    await service.runBillingCycle('cycle-1', ACTOR);

    // Assessment and invoice must NOT be attempted on a failed reconciliation
    expect(mockPerfFeeService.calculateAssessment).not.toHaveBeenCalled();
    expect(mockPerfFeeService.invoiceAssessment).not.toHaveBeenCalled();
    // Cycle transitions to FAILED
    expect(mockCycleRepo.update).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({ status: BillingCycleStatus.FAILED }),
    );
    // reconciliationRunId is still stored for traceability
    expect(mockCycleRepo.update).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({ reconciliationRunId: 'run-1' }),
    );
  });

  it('reconciliation COMPLETED_WITH_WARNINGS still proceeds to assessment (safe, under-inclusive)', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.DRAFT }));
    mockReconService.runReconciliation.mockResolvedValueOnce(
      makeReconRun({ status: 'COMPLETED_WITH_WARNINGS', failedTrades: 1 }),
    );
    await service.runBillingCycle('cycle-1', ACTOR);
    // Warnings are non-fatal — assessment proceeds
    expect(mockPerfFeeService.calculateAssessment).toHaveBeenCalledTimes(1);
  });

  it('assessment failure transitions cycle to FAILED', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.DRAFT }));
    mockPerfFeeService.calculateAssessment.mockRejectedValueOnce(
      new Error('Outstanding assessment'),
    );
    await service.runBillingCycle('cycle-1', ACTOR);
    expect(mockCycleRepo.update).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({ status: BillingCycleStatus.FAILED }),
    );
    expect(mockPerfFeeService.invoiceAssessment).not.toHaveBeenCalled();
  });

  it('invoice failure transitions cycle to FAILED', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.DRAFT }));
    mockPerfFeeService.invoiceAssessment.mockRejectedValueOnce(new Error('Provider error'));
    await service.runBillingCycle('cycle-1', ACTOR);
    expect(mockCycleRepo.update).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({ status: BillingCycleStatus.FAILED }),
    );
  });

  it('stores reconciliationRunId on cycle after successful reconciliation', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.DRAFT }));
    await service.runBillingCycle('cycle-1', ACTOR);
    expect(mockCycleRepo.update).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({ reconciliationRunId: 'run-1' }),
    );
  });

  it('stores assessmentId and invoiceId on cycle', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.DRAFT }));
    await service.runBillingCycle('cycle-1', ACTOR);
    expect(mockCycleRepo.update).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({ assessmentId: 'assessment-1' }),
    );
    expect(mockCycleRepo.update).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({ invoiceId: 'invoice-1' }),
    );
  });

  it('does NOT call invoiceAssessment when feeAmount = 0 (no double invoice)', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.DRAFT }));
    mockPerfFeeService.calculateAssessment.mockResolvedValueOnce(
      makeAssessment(AssessmentStatus.DRAFT, '0'),
    );
    await service.runBillingCycle('cycle-1', ACTOR);
    expect(mockPerfFeeService.invoiceAssessment).not.toHaveBeenCalled();
  });

  it('emits audit events at each lifecycle stage', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.DRAFT }));
    await service.runBillingCycle('cycle-1', ACTOR);
    const actions = mockAuditService.log.mock.calls.map((c: any[]) => c[0].action);
    expect(actions).toContain('PERFORMANCE_BILLING_CYCLE_STARTED');
    expect(actions).toContain('PERFORMANCE_BILLING_CYCLE_RECONCILED');
    expect(actions).toContain('PERFORMANCE_BILLING_CYCLE_ASSESSED');
    expect(actions).toContain('PERFORMANCE_BILLING_CYCLE_INVOICED');
  });

  it('audit metadata never contains secrets', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.DRAFT }));
    await service.runBillingCycle('cycle-1', ACTOR);
    for (const [call] of mockAuditService.log.mock.calls) {
      const meta = JSON.stringify(call.metadata ?? {});
      expect(meta).not.toMatch(/password|secret|token|apiKey|credential|webhook/i);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// runBillingCycleForUserPeriod
// ═══════════════════════════════════════════════════════════════════════════════
describe('runBillingCycleForUserPeriod', () => {
  it('creates a new cycle and runs it when none exists', async () => {
    mockCycleRepo.findOne
      .mockResolvedValueOnce(null)       // findExistingCycle → no existing
      .mockResolvedValueOnce(makeCycle()) // createBillingCycle save → findOne after save
      .mockResolvedValue(makeCycle({ status: BillingCycleStatus.DRAFT })); // runBillingCycle calls
    await service.runBillingCycleForUserPeriod(
      'user-1', 'conn-1', FROM, TO, 'USD', ACTOR,
    );
    expect(mockCycleRepo.save).toHaveBeenCalledTimes(1);
  });

  it('reuses a FAILED cycle and reruns it without creating a duplicate', async () => {
    const failedCycle = makeCycle({ status: BillingCycleStatus.FAILED });
    mockCycleRepo.findOne
      .mockResolvedValueOnce(failedCycle) // findExistingCycle
      .mockResolvedValueOnce(failedCycle) // getBillingCycle inside runBillingCycle
      .mockResolvedValue(makeCycle({ status: BillingCycleStatus.INVOICED })); // final fetch
    await service.runBillingCycleForUserPeriod(
      'user-1', 'conn-1', FROM, TO, 'USD', ACTOR,
    );
    expect(mockCycleRepo.save).not.toHaveBeenCalled(); // no new cycle created
    expect(mockReconService.runReconciliation).toHaveBeenCalledTimes(1);
  });

  it('throws ConflictException if an INVOICED cycle already exists', async () => {
    mockCycleRepo.findOne.mockResolvedValueOnce(
      makeCycle({ status: BillingCycleStatus.INVOICED }),
    );
    await expect(
      service.runBillingCycleForUserPeriod('user-1', 'conn-1', FROM, TO, 'USD', ACTOR),
    ).rejects.toThrow(ConflictException);
    expect(mockReconService.runReconciliation).not.toHaveBeenCalled();
  });

  it('throws ConflictException if a NO_FEE_DUE cycle already exists', async () => {
    mockCycleRepo.findOne.mockResolvedValueOnce(
      makeCycle({ status: BillingCycleStatus.NO_FEE_DUE }),
    );
    await expect(
      service.runBillingCycleForUserPeriod('user-1', 'conn-1', FROM, TO, 'USD', ACTOR),
    ).rejects.toThrow(ConflictException);
  });

  it('throws ConflictException if a RECONCILING cycle is already running', async () => {
    mockCycleRepo.findOne.mockResolvedValueOnce(
      makeCycle({ status: BillingCycleStatus.RECONCILING }),
    );
    await expect(
      service.runBillingCycleForUserPeriod('user-1', 'conn-1', FROM, TO, 'USD', ACTOR),
    ).rejects.toThrow(ConflictException);
  });

  it('uses IsNull() in duplicate lookup for account-wide (null broker) cycles', async () => {
    mockCycleRepo.findOne
      .mockResolvedValueOnce(null)                               // findExistingCycle
      .mockResolvedValueOnce(makeCycle({ brokerConnectionId: null })) // after create
      .mockResolvedValue(makeCycle({ status: BillingCycleStatus.DRAFT, brokerConnectionId: null }));

    await service.runBillingCycleForUserPeriod('user-1', null, FROM, TO, 'USD', ACTOR);

    // The very first findOne is findExistingCycle — assert its where used IsNull()
    const firstCall = mockCycleRepo.findOne.mock.calls[0][0];
    expect(firstCall.where.brokerConnectionId).toEqual(IsNull());
  });

  it('uses the concrete id in duplicate lookup for per-broker cycles', async () => {
    mockCycleRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeCycle())
      .mockResolvedValue(makeCycle({ status: BillingCycleStatus.DRAFT }));

    await service.runBillingCycleForUserPeriod('user-1', 'conn-1', FROM, TO, 'USD', ACTOR);

    const firstCall = mockCycleRepo.findOne.mock.calls[0][0];
    expect(firstCall.where.brokerConnectionId).toBe('conn-1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// cancelBillingCycle
// ═══════════════════════════════════════════════════════════════════════════════
describe('cancelBillingCycle', () => {
  it('cancels a DRAFT cycle', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.DRAFT }));
    await service.cancelBillingCycle('cycle-1', 'Test cancel', ACTOR);
    expect(mockCycleRepo.update).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({ status: BillingCycleStatus.CANCELLED }),
    );
    expect(mockAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PERFORMANCE_BILLING_CYCLE_CANCELLED' }),
    );
  });

  it('cancels a FAILED cycle', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.FAILED }));
    await service.cancelBillingCycle('cycle-1', 'Give up', ACTOR);
    expect(mockCycleRepo.update).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({ status: BillingCycleStatus.CANCELLED }),
    );
  });

  it('throws BadRequestException if cycle is INVOICED (final state)', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.INVOICED }));
    await expect(
      service.cancelBillingCycle('cycle-1', 'Try', ACTOR),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException if cycle is RECONCILING', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.RECONCILING }));
    await expect(
      service.cancelBillingCycle('cycle-1', 'Try', ACTOR),
    ).rejects.toThrow(BadRequestException);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getBillingCycle
// ═══════════════════════════════════════════════════════════════════════════════
describe('getBillingCycle', () => {
  it('returns cycle when found', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle());
    const result = await service.getBillingCycle('cycle-1');
    expect(result.id).toBe('cycle-1');
  });

  it('throws NotFoundException when not found', async () => {
    mockCycleRepo.findOne.mockResolvedValue(null);
    await expect(service.getBillingCycle('cycle-999')).rejects.toThrow(NotFoundException);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Security — no broker-less (null brokerConnectionId) cycle reconciliation
// ═══════════════════════════════════════════════════════════════════════════════
describe('account-wide cycle (null brokerConnectionId)', () => {
  it('skips reconciliation when brokerConnectionId is null', async () => {
    mockCycleRepo.findOne.mockResolvedValue(
      makeCycle({ status: BillingCycleStatus.DRAFT, brokerConnectionId: null }),
    );
    await service.runBillingCycle('cycle-1', ACTOR);
    // Reconciliation must not be called — no broker to query
    expect(mockReconService.runReconciliation).not.toHaveBeenCalled();
    // Assessment is still calculated
    expect(mockPerfFeeService.calculateAssessment).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Idempotency
// ═══════════════════════════════════════════════════════════════════════════════
describe('idempotency', () => {
  it('duplicate cycle creation (race condition) → ConflictException, not 500', async () => {
    const dupErr = new QueryFailedError('', [], new Error('unique'));
    (dupErr as any).code = '23505';
    mockCycleRepo.save.mockRejectedValueOnce(dupErr);

    await expect(
      service.createBillingCycle('user-1', 'conn-1', FROM, TO, 'USD', ACTOR),
    ).rejects.toThrow(ConflictException);
  });

  it('INVOICED cycle rerun rejected — no duplicate invoice created', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.INVOICED }));
    await expect(service.runBillingCycle('cycle-1', ACTOR)).rejects.toThrow(BadRequestException);
    expect(mockPerfFeeService.invoiceAssessment).not.toHaveBeenCalled();
  });

  it('NO_FEE_DUE cycle rerun rejected — no duplicate assessment created', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.NO_FEE_DUE }));
    await expect(service.runBillingCycle('cycle-1', ACTOR)).rejects.toThrow(BadRequestException);
    expect(mockPerfFeeService.calculateAssessment).not.toHaveBeenCalled();
    expect(mockPerfFeeService.invoiceAssessment).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Error summary safety
// ═══════════════════════════════════════════════════════════════════════════════
describe('error summary safety', () => {
  it('errorSummary is truncated to 500 chars from thrown error message', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.DRAFT }));
    const longMsg = 'X'.repeat(600);
    mockReconService.runReconciliation.mockRejectedValueOnce(new Error(longMsg));
    await service.runBillingCycle('cycle-1', ACTOR);
    const updateCall = mockCycleRepo.update.mock.calls.find(
      (c: any[]) => c[1]?.status === BillingCycleStatus.FAILED,
    );
    expect(updateCall?.[1]?.errorSummary?.length).toBeLessThanOrEqual(500);
  });

  it('errorSummary from failure does not contain the word "credential" or "secret"', async () => {
    mockCycleRepo.findOne.mockResolvedValue(makeCycle({ status: BillingCycleStatus.DRAFT }));
    // Even if error message mentions sensitive-sounding words, service must not embed
    // them — here we just verify the service doesn't add them itself
    mockReconService.runReconciliation.mockRejectedValueOnce(new Error('Connection timeout'));
    await service.runBillingCycle('cycle-1', ACTOR);
    const updateCall = mockCycleRepo.update.mock.calls.find(
      (c: any[]) => c[1]?.status === BillingCycleStatus.FAILED,
    );
    const summary = updateCall?.[1]?.errorSummary ?? '';
    expect(summary).not.toMatch(/apiKey|bearerToken|webhookSecret|encryptedCredential/i);
  });
});
