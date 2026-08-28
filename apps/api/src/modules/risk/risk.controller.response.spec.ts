import { RiskController } from './risk.controller';
import { RiskService } from './risk.service';
import { RiskRejectionCode } from './interfaces/risk.interface';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('RiskController public response hardening', () => {
  it('removes userId, signalId, and riskContext from violation responses', async () => {
    const riskService = {
      getViolations: jest.fn().mockResolvedValue([
        {
          id: 'violation-1',
          userId: USER_ID,
          signalId: '22222222-2222-4222-8222-222222222222',
          rejectionCode: RiskRejectionCode.MAX_DAILY_TRADES,
          rejectionReason: 'Daily trade limit reached',
          riskContext: {
            brokerBalance: '10000.00',
            brokerEquity: '9800.00',
            proposedLotSize: '0.1000',
          },
          evaluatedAt: new Date('2026-08-28T21:00:00.000Z'),
        },
      ]),
    };

    const controller = new RiskController(riskService as unknown as RiskService);
    const response = await controller.getViolations(USER_ID, '10');

    expect(response).toEqual([
      {
        id: 'violation-1',
        rejectionCode: RiskRejectionCode.MAX_DAILY_TRADES,
        rejectionReason: 'Daily trade limit reached',
        evaluatedAt: new Date('2026-08-28T21:00:00.000Z'),
      },
    ]);

    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('riskContext');
    expect(serialized).not.toContain('signalId');
    expect(serialized).not.toContain('userId');
    expect(serialized).not.toContain('brokerBalance');
  });
});
