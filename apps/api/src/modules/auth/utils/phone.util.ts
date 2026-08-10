/**
 * Phone normalization utility (Sprint 27 amendment + Hotfix).
 *
 * Converts various phone number formats to a consistent E.164-like format.
 *
 * Hotfix amendment: malformed duplicate prefixes are now REJECTED (not
 * silently normalized). The previous version took the substring after the
 * last '+', which could silently guess the wrong number. Now it throws
 * PhoneValidationError for:
 *   - Multiple '+' characters (e.g. "+233+233243618186", "++233243618186")
 *   - '+' not at position 0 (e.g. "233+233243618186")
 *
 * Valid formats handled:
 *   - Ghana local:    0243618186  with +233  →  +233243618186
 *   - International:  +233243618186          →  +233243618186
 *   - Without +:      233243618186  with +233 →  +233243618186
 *   - 00 prefix:      00233243618186         →  +233243618186
 *   - With spaces:    +233 24 361 8186       →  +233243618186
 *   - With dashes:    +233-24-361-8186       →  +233243618186
 */

/**
 * Error thrown when a phone number is malformed and cannot be safely normalized.
 */
export class PhoneValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhoneValidationError';
  }
}

/**
 * Normalize a phone number to E.164-like format.
 *
 * @param rawPhone - the raw phone input from the user
 * @param callingCode - the calling code from the country selector (e.g. "+233")
 * @returns normalized phone like "+233243618186", or null if empty
 * @throws PhoneValidationError if the input has malformed duplicate prefixes
 */
export function normalizePhone(
  rawPhone: string | undefined | null,
  callingCode?: string,
): string | null {
  if (!rawPhone) return null;

  // Remove all spaces, dashes, parentheses
  let cleaned = rawPhone.replace(/[\s\-()]/g, '');

  if (!cleaned) return null;

  // ── Hotfix amendment: reject malformed duplicate '+' prefixes ─────────────
  // Multiple '+' characters indicate user error or frontend double-prepend.
  // We do NOT silently guess the intended number — reject explicitly.
  const plusCount = (cleaned.match(/\+/g) || []).length;
  if (plusCount > 1) {
    throw new PhoneValidationError(
      'Phone number contains multiple "+" characters — please enter a single international prefix',
    );
  }

  // A '+' not at position 0 is also malformed (e.g. "233+233243618186")
  const plusIdx = cleaned.indexOf('+');
  if (plusIdx > 0) {
    throw new PhoneValidationError(
      'Phone number has "+" in an unexpected position — please enter a valid international number',
    );
  }

  // If already starts with '+', it's international — return cleaned
  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  // If starts with '00', treat as international prefix → replace with '+'
  if (cleaned.startsWith('00')) {
    return '+' + cleaned.slice(2);
  }

  // ── Hotfix: check if the number already includes the country code ─────────
  // without a '+' prefix. E.g., "233243618186" should become "+233243618186",
  // not "+233233243618186".
  if (callingCode) {
    const ccDigits = callingCode.replace('+', ''); // e.g. "233"

    // Strip leading '0' (local number prefix)
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.slice(1);
    }

    // Check if the cleaned number already starts with the country code digits
    if (cleaned.startsWith(ccDigits)) {
      return `+${cleaned}`;
    }

    // Otherwise, prepend the full calling code
    return `${callingCode}${cleaned}`;
  }

  // No calling code provided and not international — return as-is
  return cleaned;
}

/**
 * Detect whether a string looks like an email (contains @).
 */
export function isEmail(identifier: string): boolean {
  return identifier.includes('@');
}
