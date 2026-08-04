'use client';

/**
 * TimezoneSelect — searchable IANA timezone selector.
 *
 * UX-1 component. Accessibility fix: uses the standard ARIA editable combobox
 * pattern (role="combobox" on the search input, not on a button trigger).
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
 * - ARIA editable combobox pattern:
 *   - Search input has role="combobox", aria-expanded, aria-controls,
 *     aria-autocomplete="list", aria-activedescendant.
 *   - Results container has role="listbox".
 *   - Each result has role="option" with stable unique id and aria-selected.
 * - Validates that the submitted value is a recognized IANA timezone — arbitrary
 *   free text never produces an unrecognised value.
 * - Styled with the existing CSS variables (--brand, --bg-input, --border, etc.).
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

// useLayoutEffect runs synchronously before paint on the client, so the dropdown
// is positioned correctly on its first visible frame (no flash of an overflowed
// dropdown). On the server it is a no-op; we fall back to useEffect to avoid the
// SSR useLayoutEffect warning. The dropdown is only rendered when `open` is true
// (a client-only interaction), so this never affects SSR output.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface TimezoneSelectProps {
  value: string;
  onChange: (timezone: string) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
}

// ── Fallback timezone list ───────────────────────────────────────────────────
const FALLBACK_TIMEZONES: string[] = [
  'Africa/Accra', 'Africa/Addis_Ababa', 'Africa/Cairo', 'Africa/Casablanca',
  'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
  'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'America/Mexico_City',
  'America/New_York', 'America/Sao_Paulo', 'America/Toronto', 'America/Vancouver',
  'Asia/Bangkok', 'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Jakarta',
  'Asia/Jerusalem', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Manila',
  'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tehran', 'Asia/Tokyo',
  'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Melbourne',
  'Australia/Sydney', 'Europe/Amsterdam', 'Europe/Berlin', 'Europe/Dublin',
  'Europe/Istanbul', 'Europe/Lisbon', 'Europe/London', 'Europe/Madrid',
  'Europe/Moscow', 'Europe/Paris', 'Europe/Rome',
  'Pacific/Auckland', 'Pacific/Honolulu', 'Pacific/Tahiti', 'UTC',
];

interface TimezoneOption {
  iana: string;
  city: string;
  offsetLabel: string;
  displayLabel: string;
}

function getSupportedTimezones(): string[] {
  try {
    const supported = (Intl as unknown as {
      supportedValuesOf?: (key: string) => string[];
    }).supportedValuesOf?.('timeZone');
    if (Array.isArray(supported) && supported.length > 0) {
      return supported.includes('UTC') ? supported : [...supported, 'UTC'];
    }
  } catch { /* fall through */ }
  return FALLBACK_TIMEZONES;
}

function getUtcOffsetMinutes(iana: string): number {
  try {
    const now = new Date();
    const targetFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: iana, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const parts = targetFmt.formatToParts(now).reduce<Record<string, string>>((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value;
      return acc;
    }, {});
    const hour = parts.hour === '24' ? '00' : parts.hour;
    const asUTC = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(hour), Number(parts.minute), Number(parts.second),
    );
    return Math.round((asUTC - now.getTime()) / 60000);
  } catch { return 0; }
}

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

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
  } catch { /* fall through */ }
  return formatOffset(getUtcOffsetMinutes(iana));
}

function cityFromIana(iana: string): string {
  if (iana === 'UTC' || iana === 'Etc/UTC' || iana === 'Etc/GMT') return 'UTC';
  const last = iana.split('/').pop() ?? iana;
  return last.replace(/_/g, ' ');
}

function buildOption(iana: string): TimezoneOption {
  const city = cityFromIana(iana);
  const offsetLabel = getOffsetLabel(iana);
  return { iana, city, offsetLabel, displayLabel: `${city} — ${iana} — ${offsetLabel}` };
}

export function isValidTimezone(iana: string): boolean {
  if (!iana || typeof iana !== 'string') return false;
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat('en-US', { timeZone: iana });
    return true;
  } catch { return false; }
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

  const containerRef = useRef<HTMLDivElement>(null);
  const comboboxRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  // Responsive dropdown placement: when the combobox is low in the viewport, the
  // default "open down with a 280px list" would overflow the bottom edge. We
  // measure the available space above/below the trigger and either flip the
  // dropdown above the trigger or cap the list max-height so it always fits.
  const [dropdownPlacement, setDropdownPlacement] = useState<{
    maxHeight: number | undefined;
    openUp: boolean;
  }>({ maxHeight: undefined, openUp: false });

  const allOptions = useMemo<TimezoneOption[]>(() => {
    const ianaList = getSupportedTimezones();
    const unique = Array.from(new Set(ianaList));
    return unique.map(buildOption).sort((a, b) => a.city.localeCompare(b.city));
  }, []);

  const allIanaSet = useMemo(() => new Set(allOptions.map((o) => o.iana)), [allOptions]);

  // Auto-detect browser timezone — preselect ONLY when value is empty.
  useEffect(() => {
    if (value) return;
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected && allIanaSet.has(detected)) {
        onChange(detected);
      }
    } catch { /* ignore */ }
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

  // Position the dropdown so it never overflows the viewport. Measures the
  // available space below and above the combobox container, picks the direction
  // with more room, and caps the list max-height to the available space when
  // there isn't enough room for the full 280px default. Runs synchronously before
  // paint (via the isomorphic layout effect) so there is no visible flash, and
  // re-measures on viewport resize and scroll while open.
  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    const PREFERRED_MAX_HEIGHT = 280; // matches the CSS default for .timezone-select__list
    const GAP = 4; // the calc(100% + 4px) gap between trigger and dropdown
    const MARGIN = 8; // breathing room from the viewport edge

    const measure = () => {
      const rect = container.getBoundingClientRect();
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - GAP - MARGIN);
      const spaceAbove = Math.max(0, rect.top - GAP - MARGIN);
      // Choose the direction with more space; tie breaks to "down" (default).
      const openUp = spaceAbove > spaceBelow;
      const available = openUp ? spaceAbove : spaceBelow;
      // If there's plenty of room, leave the CSS default (no inline cap).
      // Otherwise cap the list to the available space so the dropdown always
      // stays within the viewport.
      const maxHeight = available >= PREFERRED_MAX_HEIGHT ? undefined : Math.floor(available);
      setDropdownPlacement({ maxHeight, openUp });
    };

    measure();
    window.addEventListener('resize', measure);
    // capture: true so scroll events from any scrollable ancestor re-trigger.
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open]);

  const selectedOption = useMemo<TimezoneOption | undefined>(() => {
    if (!value) return undefined;
    return allOptions.find((o) => o.iana === value);
  }, [allOptions, value]);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    requestAnimationFrame(() => {
      comboboxRef.current?.focus();
    });
  }, [disabled]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const commit = useCallback(
    (iana: string) => {
      if (!iana || !allIanaSet.has(iana)) return;
      onChange(iana);
      closeDropdown();
    },
    [allIanaSet, onChange, closeDropdown],
  );

  const onComboboxKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
        if (open) closeDropdown();
        break;
    }
  };

  const displayValue = selectedOption
    ? selectedOption.displayLabel
    : value && isValidTimezone(value)
      ? `${cityFromIana(value)} — ${value} — ${getOffsetLabel(value)}`
      : '';

  const activeOptionId =
    open && activeIndex >= 0 ? `${inputId}-option-${activeIndex}` : undefined;

  return (
    <div className="timezone-select" ref={containerRef}>
      {label && (
        <label htmlFor={inputId} className="input-label">
          {label}
        </label>
      )}

      {/* Editable combobox: the search input itself has role="combobox" */}
      <div className="timezone-select__trigger" onClick={() => !open && openDropdown()}>
        <input
          ref={comboboxRef}
          id={inputId}
          type="text"
          className="timezone-select__search-input timezone-select__search-input--trigger"
          placeholder={displayValue || 'Search city or timezone…'}
          value={open ? query : ''}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => { if (!open) openDropdown(); }}
          onKeyDown={onComboboxKeyDown}
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-label={label || 'Timezone'}
          aria-haspopup="listbox"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="timezone-select__chevron" aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </div>

      {/* When closed, show the selected value as a visual overlay */}
      {!open && displayValue && (
        <div className="timezone-select__selected-display" aria-hidden="true">
          {displayValue}
        </div>
      )}

      {open && (
        <div
          className={`timezone-select__dropdown${dropdownPlacement.openUp ? ' timezone-select__dropdown--up' : ''}`}
          role="presentation"
        >
          <ul
            id={listboxId}
            ref={listRef}
            role="listbox"
            aria-label={label || 'Timezone'}
            className="timezone-select__list"
            style={dropdownPlacement.maxHeight ? { maxHeight: `${dropdownPlacement.maxHeight}px` } : undefined}
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
                  onMouseDown={(e) => {
                    e.preventDefault();
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
                No timezones match &ldquo;{query}&rdquo;.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default TimezoneSelect;
