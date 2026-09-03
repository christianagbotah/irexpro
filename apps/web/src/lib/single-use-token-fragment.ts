/**
 * Read a single-use auth token from the current URL fragment, then immediately
 * remove the fragment from the current browser-history entry.
 *
 * URL fragments are intentionally used for emailed browser secrets because
 * browsers do not send fragments in HTTP navigation/resource request URLs.
 * The returned value must remain component-memory-only and must never be copied
 * to localStorage/sessionStorage or rendered automatically.
 */
export function consumeSingleUseTokenFragment(cleanPath: string): string | null {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const token = new URLSearchParams(hash).get('token')?.trim() || null;

  if (window.location.hash) {
    window.history.replaceState(window.history.state, '', cleanPath);
  }

  return token;
}
