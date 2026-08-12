import { formatEnumLabel } from '@irexpro/types';

/**
 * Unit tests for the shared enum-label humanization utility.
 *
 * Presentation-only: verifies the rendered label transformation without
 * touching any backend enum value, role constant, RolesGuard expectation,
 * permission check, route guard, or raw-domain-value test.
 */
describe('formatEnumLabel', () => {
  test('null/undefined/empty → empty string', () => {
    expect(formatEnumLabel(null)).toBe('');
    expect(formatEnumLabel(undefined)).toBe('');
    expect(formatEnumLabel('')).toBe('');
  });

  test('SUPER_ADMIN → Super Admin', () => {
    expect(formatEnumLabel('SUPER_ADMIN')).toBe('Super Admin');
  });

  test('USER → User', () => {
    expect(formatEnumLabel('USER')).toBe('User');
  });

  test('ADMIN → Admin', () => {
    expect(formatEnumLabel('ADMIN')).toBe('Admin');
  });

  test('PENDING_REVIEW → Pending Review', () => {
    expect(formatEnumLabel('PENDING_REVIEW')).toBe('Pending Review');
  });

  test('PAYMENT_FAILED → Payment Failed', () => {
    expect(formatEnumLabel('PAYMENT_FAILED')).toBe('Payment Failed');
  });

  test('BROKER_CONNECTED → Broker Connected', () => {
    expect(formatEnumLabel('BROKER_CONNECTED')).toBe('Broker Connected');
  });

  test('already-human-readable text is preserved (case-normalized)', () => {
    // "Active" → "Active" (already title-case after normalization)
    expect(formatEnumLabel('Active')).toBe('Active');
    expect(formatEnumLabel('active')).toBe('Active');
    expect(formatEnumLabel('ACTIVE')).toBe('Active');
  });

  test('single word → title-cased', () => {
    expect(formatEnumLabel('CONNECTED')).toBe('Connected');
    expect(formatEnumLabel('DISCONNECTED')).toBe('Disconnected');
    expect(formatEnumLabel('SUSPENDED')).toBe('Suspended');
  });

  test('multi-word with multiple underscores', () => {
    expect(formatEnumLabel('PROFILE_INCOMPLETE')).toBe('Profile Incomplete');
    expect(formatEnumLabel('RISK_PROFILE_MISSING')).toBe('Risk Profile Missing');
  });

  test('leading/trailing underscores are ignored', () => {
    expect(formatEnumLabel('_SUPER_ADMIN')).toBe('Super Admin');
    expect(formatEnumLabel('SUPER_ADMIN_')).toBe('Super Admin');
    expect(formatEnumLabel('__PENDING_REVIEW__')).toBe('Pending Review');
  });

  test('does NOT mutate the input', () => {
    const input = 'SUPER_ADMIN';
    formatEnumLabel(input);
    expect(input).toBe('SUPER_ADMIN');
  });
});
