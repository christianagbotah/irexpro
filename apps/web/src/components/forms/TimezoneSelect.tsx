'use client';

/**
 * TimezoneSelect — searchable IANA timezone selector.
 *
 * UX-1 component.
 *
 * Features:
 * - Uses `Intl.supportedValuesOf('timeZone')` when available, with a curated
 *   fallback list of ~50 common timezones.
 * - Auto-detects the browser timezone via
 *   `Intl.DateTimeFormat().resolvedOptions().timeZone` and preselects it ONLY
 *   when the `value` prop is empty (never overwrites a saved value).
 * - Displays human-readable labels: "City — IANA — UTC±HH:MM".
 *   Example: "Accra — Africa/Accra — UTC+00:00"
 * - Calculates the current UTC offset for each timezone using `Intl.DateTimeFormat`
 *   with `timeZoneName: 'shortOffset'` (manual fallback for older engines).
 * - Searchable by city name or IANA key.
 * - Keyboard navigable: ArrowUp/ArrowDown, Enter, Escape.
 * - ARIA combobox pattern with role="listbox" / role="option".
 * - Validates that the submitted value is a recognized IANA timezone — arbitrary
 *   free text never produces an unrecognised value.
 * - Styled with the existing CSS variables (--brand, --bg-input, --border, etc.).
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

export interface TimezoneSelectProps {
  value: string;
  onChange: (timezone: string) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
}

// ── Fallback timezone list ───────────────────────────────────────────────────
// Used when `Intl.supportedValuesOf` is unavailable (older Safari, etc.).
// ~50 commonly-used IANA timezones covering all major regions.
const FALLBACK_TIMEZONES: string[] = [
  'Africa/Accra',
  'Africa/Addis_Ababa',
  'Africa/Cairo',
  'Africa/Casablanca',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Sao_Paulo',
  'America/Toronto',
  'America/Vancouver',
  'Asia/Bangkok',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Jerusalem',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Manila',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tehran',
  'Asia/Tokyo',
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Melbourne',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Dublin',
  'Europe/Istanbul',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Moscow',
  'Europe/Paris',
  'Europe/Rome',
  'Pacific/Auckland',
  'Pacific/Honolulu',
  'Pacific/Tahiti',
  'UTC',
];

interface TimezoneOption {
  iana: string;
  city: string;
  offsetLabel: string; // e.g. "UTC+00:00"
  displayLabel: string; // e.g. "Accra — Africa/Accra — UTC+00:00"
}

/**
 * Returns the list of supported IANA timezones for the current runtime.
 * Falls back to a curated list when `Intl.supportedValuesOf` is unavailable.
 */
function getSupportedTimezones(): string[] {
  try {
    // `Intl.supportedValuesOf` is supported in modern Chrome/Edge/Firefox/Safari.
    const supported = (Intl as unknown as {
      supportedValuesOf?: (key: string) => string[];
    }).supportedValuesOf?.('timeZone');
    if (Array.isArray(supported) && supported.length > 0) {
      // Ensure UTC is always present.
      return supported.includes('UTC') ? supported : [...supported, 'UTC'];
    }
  } catch {
    /* ignore — fall through to static list */
  }
  return FALLBACK_TIMEZONES;
}

/**
 * Computes the current UTC offset (in minutes) for a given IANA timezone.
 * Returns the offset in minutes (e.g. Accra = 0, Tokyo = 540, New York = -300
 * during DST).
 */
function getUtcOffsetMinutes(iana: string): number {
  try {
    const now = new Date();
    // Format the current instant in the target timezone, then in UTC, and diff.
    const targetFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = targetFmt.formatToParts(now).reduce<Record<string, string>>((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value;
      return acc;
    }, {});
    const hour = parts.hour === '24' ? '00' : parts.hour;
    const asUTC = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return Math.round((asUTC - now.getTime()) / 60000);
  } catch {
    return 0;
  }
}

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

/**
 * Tries to use `timeZoneName: 'shortOffset'` (e.g. "GMT+00:00") and falls back
 * to manual computation. Returns e.g. "UTC+00:00".
 */
function getOffsetLabel(iana: string): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      timeZoneName: 'shortOffset' as Intl.DateTimeFormatOptions['timeZoneName'],
    });
    const parts = fmt.formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    if (tzPart && /^GMT[+-]\d{2}:\d{2}$/.test(tzPart.value)) {
      return tzPart.value.replace('GMT', 'UTC');
    }
    if (tzPart && tzPart.value === 'GMT') return 'UTC+00:00';
  } catch {
    /* fall through */
  }
  return formatOffset(getUtcOffsetMinutes(iana));
}

/**
 * Extracts a human-readable city name from an IANA timezone identifier.
 * "Africa/Accra" -> "Accra"
 * "America/Argentina/Buenos_Aires" -> "Buenos Aires"
 * "UTC" -> "UTC"
 */
function cityFromIana(iana: string): string {
  if (iana === 'UTC' || iana === 'Etc/UTC' || iana === 'Etc/GMT') return 'UTC';
  const last = iana.split('/').pop() ?? iana;
  return last.replace(/_/g, ' ');
}

function buildOption(iana: string): TimezoneOption {
  const city = cityFromIana(iana);
  const offsetLabel = getOffsetLabel(iana);
  return {
    iana,
    city,
    offsetLabel,
    displayLabel: `${city} — ${iana} — ${offsetLabel}`,
  };
}

/**
 * Returns true if the supplied value is a recognized IANA timezone in this
 * runtime. Used to validate submitted values.
 */
export function isValidTimezone(iana: string): boolean {
  if (!iana || typeof iana !== 'string') return false;
  try {
    // Calling Intl.DateTimeFormat with an invalid timeZone throws RangeError.
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat('en-US', { timeZone: iana });
    return true;
  } catch {
    return false;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function TimezoneSelect({
  value,
  onChange,
  label,
  disabled = false,
  id,
}: TimezoneSelectProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const listboxId = `${inputId}-listbox`;
  const triggerId = `${inputId}-trigger`;

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  // Build the full option list once per mount. `Intl.supportedValuesOf` can be
  // expensive in some engines, so we memoize for the lifetime of the component.
  const allOptions = useMemo<TimezoneOption[]>(() => {
    const ianaList = getSupportedTimezones();
    // Deduplicate & sort by city name for a stable, scannable list.
    const unique = Array.from(new Set(ianaList));
    return unique.map(buildOption).sort((a, b) => a.city.localeCompare(b.city));
  }, []);

  const allIanaSet = useMemo(() => new Set(allOptions.map((o) => o.iana)), [allOptions]);

  // Auto-detect browser timezone — preselect ONLY when value is empty.
  useEffect(() => {
    if (value) return; // never overwrite a saved value
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected && allIanaSet.has(detected)) {
        onChange(detected);
      }
    } catch {
      /* ignore — leave empty */
    }
    // We intentionally run this only on mount (and only when allOptions is set).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allIanaSet]);

  const filtered = useMemo<TimezoneOption[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter(
      (opt) =>
        opt.city.toLowerCase().includes(q) ||
        opt.iana.toLowerCase().includes(q) ||
        opt.offsetLabel.toLowerCase().includes(q),
    );
  }, [allOptions, query]);

  // Reset activeIndex when the filter changes.
  useEffect(() => {
    setActiveIndex(filtered.length > 0 ? 0 : -1);
  }, [filtered]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Keep the active option scrolled into view.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const list = listRef.current;
    if (!list) return;
    const el = list.children[activeIndex] as HTMLElement | undefined;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, open]);

  const selectedOption = useMemo<TimezoneOption | undefined>(() => {
    if (!value) return undefined;
    return allOptions.find((o) => o.iana === value);
  }, [allOptions, value]);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    // Focus the search field on next paint.
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, [disabled]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const commit = useCallback(
    (iana: string) => {
      if (!iana || !allIanaSet.has(iana)) return; // never commit unknown values
      onChange(iana);
      closeDropdown();
    },
    [allIanaSet, onChange, closeDropdown],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
        if (open) {
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < filtered.length) {
            commit(filtered[activeIndex].iana);
          }
        }
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          closeDropdown();
        }
        break;
      case 'ArrowDown':
        if (!open) {
          e.preventDefault();
          openDropdown();
        } else if (filtered.length > 0) {
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % filtered.length);
        }
        break;
      case 'ArrowUp':
        if (open && filtered.length > 0) {
          e.preventDefault();
          setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
        }
        break;
      case 'Home':
        if (open && filtered.length > 0) {
          e.preventDefault();
          setActiveIndex(0);
        }
        break;
      case 'End':
        if (open && filtered.length > 0) {
          e.preventDefault();
          setActiveIndex(filtered.length - 1);
        }
        break;
      case 'Tab':
        // Tab closes the dropdown naturally — do not preventDefault so focus
        // moves to the next field.
        if (open) closeDropdown();
        break;
    }
  };

  const triggerLabel = selectedOption
    ? selectedOption.displayLabel
    : value && isValidTimezone(value)
      ? `${cityFromIana(value)} — ${value} — ${getOffsetLabel(value)}`
      : 'Select your timezone…';

  const activeOptionId =
    open && activeIndex >= 0 ? `${inputId}-option-${activeIndex}` : undefined;

  return (
    <div className="timezone-select" ref={containerRef} onKeyDown={onKeyDown}>
      {label && (
        <label htmlFor={triggerId} className="input-label">
          {label}
        </label>
      )}

      {/* Trigger button (combobox) */}
      <button
        id={triggerId}
        type="button"
        className="timezone-select__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        aria-label={label || 'Timezone'}
        onClick={() => (open ? closeDropdown() : openDropdown())}
      >
        <span className={`timezone-select__value${selectedOption ? '' : ' is-placeholder'}`}>
          {triggerLabel}
        </span>
        <span className="timezone-select__chevron" aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="timezone-select__dropdown" role="presentation">
          <div className="timezone-select__search">
            <input
              ref={searchInputRef}
              type="text"
              className="timezone-select__search-input"
              placeholder="Search city or timezone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search timezones"
              aria-controls={listboxId}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <ul
            id={listboxId}
            ref={listRef}
            role="listbox"
            aria-label={label || 'Timezone'}
            className="timezone-select__list"
          >
            {filtered.map((opt, idx) => {
              const isSelected = opt.iana === value;
              const isActive = idx === activeIndex;
              return (
                <li
                  key={opt.iana}
                  id={`${inputId}-option-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  data-active={isActive ? 'true' : undefined}
                  className={`timezone-select__option${isSelected ? ' is-selected' : ''}${isActive ? ' is-active' : ''}`}
                  // Mouse interaction should not require keyboard focus to move.
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep focus on the search input
                    commit(opt.iana);
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                >
                  <span className="timezone-select__option-city">{opt.city}</span>
                  <span className="timezone-select__option-iana">{opt.iana}</span>
                  <span className="timezone-select__option-offset">{opt.offsetLabel}</span>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="timezone-select__empty" role="status">
                No timezones match “{query}”.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default TimezoneSelect;
