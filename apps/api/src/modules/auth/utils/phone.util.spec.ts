import { normalizePhone, isEmail } from './phone.util';

describe('Phone normalization (Sprint 27 amendment)', () => {
  describe('normalizePhone', () => {
    it('should normalize Ghana local number with leading 0', () => {
      expect(normalizePhone('0241234567', '+233')).toBe('+233241234567');
    });

    it('should normalize Ghana local number without leading 0', () => {
      expect(normalizePhone('241234567', '+233')).toBe('+233241234567');
    });

    it('should keep international format as-is (already starts with +)', () => {
      expect(normalizePhone('+233241234567', '+233')).toBe('+233241234567');
    });

    it('should keep international format even with different calling code param', () => {
      expect(normalizePhone('+12345678901', '+233')).toBe('+12345678901');
    });

    it('should remove spaces and dashes', () => {
      expect(normalizePhone('+233 24 123-4567', '+233')).toBe('+233241234567');
    });

    it('should remove parentheses', () => {
      expect(normalizePhone('+233 (24) 123-4567', '+233')).toBe('+233241234567');
    });

    it('should handle 00 prefix as international', () => {
      expect(normalizePhone('00233241234567')).toBe('+233241234567');
    });

    it('should return null for empty string', () => {
      expect(normalizePhone('', '+233')).toBeNull();
    });

    it('should return null for undefined', () => {
      expect(normalizePhone(undefined, '+233')).toBeNull();
    });

    it('should return null for null', () => {
      expect(normalizePhone(null, '+233')).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
      expect(normalizePhone('   ', '+233')).toBeNull();
    });

    it('should handle Nigerian local number', () => {
      expect(normalizePhone('08012345678', '+234')).toBe('+2348012345678');
    });

    it('should return as-is if no calling code and not international', () => {
      expect(normalizePhone('241234567')).toBe('241234567');
    });
  });

  describe('isEmail', () => {
    it('should return true for email-like string', () => {
      expect(isEmail('user@example.com')).toBe(true);
    });

    it('should return false for phone number', () => {
      expect(isEmail('+233241234567')).toBe(false);
    });

    it('should return false for local phone number', () => {
      expect(isEmail('0241234567')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isEmail('')).toBe(false);
    });
  });
});
