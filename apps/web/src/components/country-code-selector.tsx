'use client';

import { useState, useRef, useEffect } from 'react';

export interface CountryOption {
  code: string;      // ISO 2-letter code, e.g. "GH"
  name: string;      // Country name
  callingCode: string; // e.g. "+233"
}

export const COUNTRY_LIST: CountryOption[] = [
  { code: 'GH', name: 'Ghana', callingCode: '+233' },
  { code: 'NG', name: 'Nigeria', callingCode: '+234' },
  { code: 'GB', name: 'United Kingdom', callingCode: '+44' },
  { code: 'US', name: 'United States', callingCode: '+1' },
  { code: 'CA', name: 'Canada', callingCode: '+1' },
  { code: 'ZA', name: 'South Africa', callingCode: '+27' },
  { code: 'KE', name: 'Kenya', callingCode: '+254' },
  { code: 'CI', name: "Côte d'Ivoire", callingCode: '+225' },
  { code: 'TG', name: 'Togo', callingCode: '+228' },
  { code: 'BJ', name: 'Benin', callingCode: '+229' },
  { code: 'BF', name: 'Burkina Faso', callingCode: '+226' },
  { code: 'SL', name: 'Sierra Leone', callingCode: '+232' },
  { code: 'LR', name: 'Liberia', callingCode: '+231' },
  { code: 'AE', name: 'United Arab Emirates', callingCode: '+971' },
  { code: 'IN', name: 'India', callingCode: '+91' },
  { code: 'CN', name: 'China', callingCode: '+86' },
];

interface CountryCodeSelectorProps {
  value: string;        // ISO 2-letter code, e.g. "GH"
  onChange: (code: string, callingCode: string) => void;
  disabled?: boolean;
}

export function CountryCodeSelector({ value, onChange, disabled }: CountryCodeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = COUNTRY_LIST.find((c) => c.code === value) ?? COUNTRY_LIST[0];

  const filtered = COUNTRY_LIST.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.callingCode.includes(search) ||
    c.code.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="input-group">
      <label className="input-label">Country</label>
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          type="button"
          className="input"
          style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          onClick={() => !disabled && setOpen(!open)}
          disabled={disabled}
        >
          <span>{selected.name} ({selected.callingCode})</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>▼</span>
        </button>
        {open && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', maxHeight: '250px', overflowY: 'auto',
            boxShadow: 'var(--shadow-md)',
          }}>
            <input
              type="text"
              placeholder="Search country or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              style={{
                width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-input)',
                border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)',
                fontSize: '0.85rem', outline: 'none', borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
              }}
            />
            {filtered.map((c) => (
              <button
                key={c.code}
                type="button"
                style={{
                  width: '100%', padding: '0.6rem 0.8rem', background: 'transparent',
                  border: 'none', color: 'var(--text)', textAlign: 'left', cursor: 'pointer',
                  fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between',
                }}
                onClick={() => {
                  onChange(c.code, c.callingCode);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <span>{c.name}</span>
                <span style={{ color: 'var(--text-muted)' }}>{c.callingCode}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '0.8rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No results</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
