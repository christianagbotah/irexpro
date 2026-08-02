/**
 * Phone normalization utility (Sprint 27 amendment + Hotfix).
 *
 * Converts various phone number formats to a consistent E.164-like format.
 *
 * Hotfix: fixes duplicate-prefix bug where `+233+233243618186` was returned
 * as-is instead of being deduplicated to `+233243618186`. Also fixes
 * `233243618186` (without +) being incorrectly prefixed to
 * `+233233243618186` instead of recognized as already international.
 *
 * Handles:
 *   - Ghana local:    0243618186  with +233  →  +233243618186
 *   - International:  +233243618186          →  +233243618186
 *   - Without +:      233243618186  with +233 →  +233243618186
 *   - 00 prefix:      00233243618186         →  +233243618186
 *   - Duplicate +:    +233+233243618186      →  +233243618186
 *   - With spaces:    +233 24 361 8186       →  +233243618186
 *   - With dashes:    +233-24-361-8186       →  +233243618186
 *
 * Does NOT use libphonenumber (no heavy dependency). Uses simple string
 * manipulation sufficient for the supported country list.
 */

/**
 * Normalize a phone number to E.164-like format.
 *
 * @param rawPhone - the raw phone input from the user
 * @param callingCode - the calling code from the country selector (e.g. "+233")
 * @returns normalized phone like "+233243618186", or null if empty
 */
export function normalizePhone(rawPhone: string | undefined | null, callingCode?: string): string | null {
  if (!rawPhone) return null;

  // Remove all spaces, dashes, parentheses
  let cleaned = rawPhone.replace(/[\s\-()]/g, '');

  if (!cleaned) return null;

  // ── Hotfix: handle duplicate '+' prefixes (e.g. "+233+233243618186") ──────
  // This happens when the frontend prepends +233 but the user also typed +233.
  // Strategy: find all '+' positions; if there are multiple, keep only the
  // digits after the LAST '+' (which is the actual phone number with its CC).
  const plusCount = (cleaned.match(/\+/g) || []).length;
  if (plusCount > 1) {
    // Take the substring starting from the last '+'
    const lastPlusIdx = cleaned.lastIndexOf('+');
    cleaned = cleaned.substring(lastPlusIdx);
  }

  // If already starts with '+', it's international — clean and return
  if (cleaned.startsWith('+')) {
    // Remove any remaining '+' characters (defense-in-depth)
    cleaned = '+' + cleaned.replace(/\+/g, '');
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
    // (e.g., "233243618186" starts with "233")
    if (cleaned.startsWith(ccDigits)) {
      return `+${cleaned}`;
    }

    // Otherwise, prepend the full calling code
    return `${callingCode}${cleaned}`;
  }

  // No calling code provided and not international — return as-is
  // (will likely fail validation downstream)
  return cleaned;
}

/**
 * Detect whether a string looks like an email (contains @).
 */
export function isEmail(identifier: string): boolean {
  return identifier.includes('@');
}
