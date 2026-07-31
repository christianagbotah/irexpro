/**
 * Phone normalization utility (Sprint 27 amendment).
 *
 * Converts various phone number formats to a consistent E.164-like format.
 * Handles:
 *   - Ghana local:  0241234567 with +233  →  +233241234567
 *   - International: +233241234567         →  +233241234567
 *   - With spaces/dashes: +233 24 123-4567 →  +233241234567
 *   - Bare local:   241234567 with +233    →  +233241234567
 *
 * Does NOT use libphonenumber (no heavy dependency). Uses simple string
 * manipulation sufficient for the supported country list. If the input
 * already starts with '+', it is treated as international and cleaned.
 * Otherwise, the callingCode is prepended (stripping a leading 0).
 */

/**
 * Normalize a phone number to E.164-like format.
 *
 * @param rawPhone - the raw phone input from the user
 * @param callingCode - the calling code from the country selector (e.g. "+233")
 * @returns normalized phone like "+233241234567", or null if empty
 */
export function normalizePhone(rawPhone: string | undefined | null, callingCode?: string): string | null {
  if (!rawPhone) return null;

  // Remove all spaces, dashes, parentheses
  let cleaned = rawPhone.replace(/[\s\-()]/g, '');

  if (!cleaned) return null;

  // If already starts with '+', treat as international — just clean it
  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  // If starts with '00', treat as international prefix → replace with '+'
  if (cleaned.startsWith('00')) {
    return '+' + cleaned.slice(2);
  }

  // Local number — strip leading '0' if present, prepend calling code
  if (callingCode) {
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.slice(1);
    }
    return `${callingCode}${cleaned}`;
  }

  // No calling code provided and not international — return as-is (will likely fail validation)
  return cleaned;
}

/**
 * Detect whether a string looks like an email (contains @).
 */
export function isEmail(identifier: string): boolean {
  return identifier.includes('@');
}
