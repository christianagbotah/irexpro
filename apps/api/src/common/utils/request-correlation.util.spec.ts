import {
  createCorrelationId,
  getCorrelationId,
  runWithCorrelationId,
} from './request-correlation.util';

describe('request correlation context', () => {
  it('creates UUID-shaped server correlation IDs', () => {
    const correlationId = createCorrelationId();
    expect(correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('propagates correlation context across async work and isolates separate requests', async () => {
    const first = '11111111-1111-4111-8111-111111111111';
    const second = '22222222-2222-4222-8222-222222222222';

    const [firstSeen, secondSeen] = await Promise.all([
      runWithCorrelationId(first, async () => {
        await Promise.resolve();
        return getCorrelationId();
      }),
      runWithCorrelationId(second, async () => {
        await Promise.resolve();
        return getCorrelationId();
      }),
    ]);

    expect(firstSeen).toBe(first);
    expect(secondSeen).toBe(second);
    expect(getCorrelationId()).toBeUndefined();
  });
});
