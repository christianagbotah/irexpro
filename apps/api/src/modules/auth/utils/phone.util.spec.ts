import { normalizePhone, isEmail } from './phone.util';

/**
 * Phone normalization tests — Hotfix.
 *
 * Verifies Ghana phone formats normalize correctly without duplicate +233.
 */
describe('normalizePhone (Hotfix — Ghana phone normalization)', () => {
  const GH_CALLING_CODE = '+233';

  describe('Ghana local formats', () => {
    it('should normalize 0243618186 with +233 → +233243618186', () => {
      expect(normalizePhone('0243618186', GH_CALLING_CODE)).toBe('+233243618186');
    });

    it('should normalize 024 361 8186 (spaces) with +233 → +233243618186', () => {
      expect(normalizePhone('024 361 8186', GH_CALLING_CODE)).toBe('+233243618186');
    });

    it('should normalize 024-361-8186 (dashes) with +233 → +233243618186', () => {
      expect(normalizePhone('024-361-8186', GH_CALLING_CODE)).toBe('+233243618186');
    });

    it('should normalize (024) 361-8186 (parens) with +233 → +233243618186', () => {
      expect(normalizePhone('(024) 361-8186', GH_CALLING_CODE)).toBe('+233243618186');
    });
  });

  describe('international formats without +', () => {
    it('should normalize 233243618186 with +233 → +233243618186 (not +233233243618186)', () => {
      expect(normalizePhone('233243618186', GH_CALLING_CODE)).toBe('+233243618186');
    });

    it('should normalize 233 243 618 186 (spaces) with +233 → +233243618186', () => {
      expect(normalizePhone('233 243 618 186', GH_CALLING_CODE)).toBe('+233243618186');
    });
  });

  describe('already-normalized formats', () => {
    it('should keep +233243618186 unchanged', () => {
      expect(normalizePhone('+233243618186', GH_CALLING_CODE)).toBe('+233243618186');
    });

    it('should keep +233 243 618 186 (with spaces) → +233243618186', () => {
      expect(normalizePhone('+233 243 618 186', GH_CALLING_CODE)).toBe('+233243618186');
    });
  });

  describe('00 prefix format', () => {
    it('should normalize 00233243618186 → +233243618186', () => {
      expect(normalizePhone('00233243618186')).toBe('+233243618186');
    });
  });

  describe('duplicate prefix (Hotfix bug)', () => {
    it('should normalize +233+233243618186 → +233243618186', () => {
      expect(normalizePhone('+233+233243618186', GH_CALLING_CODE)).toBe('+233243618186');
    });

    it('should normalize +233+233243618186 without callingCode → +233243618186', () => {
      expect(normalizePhone('+233+233243618186')).toBe('+233243618186');
    });
  });

  describe('edge cases', () => {
    it('should return null for empty string', () => {
      expect(normalizePhone('')).toBeNull();
    });

    it('should return null for undefined', () => {
      expect(normalizePhone(undefined)).toBeNull();
    });

    it('should return null for null', () => {
      expect(normalizePhone(null)).toBeNull();
    });

    it('should return null for only-spaces', () => {
      expect(normalizePhone('   ')).toBeNull();
    });

    it('should handle phone without callingCode (local number returned as-is)', () => {
      // Without a calling code, the 0 is NOT stripped (no country context)
      expect(normalizePhone('0243618186')).toBe('0243618186');
    });

    it('should not corrupt a short local number', () => {
      expect(normalizePhone('243618186', GH_CALLING_CODE)).toBe('+233243618186');
    });
  });
});

describe('isEmail', () => {
  it('should detect email addresses', () => {
    expect(isEmail('user@example.com')).toBe(true);
  });

  it('should detect non-email strings', () => {
    expect(isEmail('+233243618186')).toBe(false);
    expect(isEmail('0243618186')).toBe(false);
    expect(isEmail('user')).toBe(false);
  });
});
