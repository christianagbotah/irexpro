import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TimezoneSelect } from './TimezoneSelect';

/**
 * TimezoneSelect tests — UX feature + accessibility fix.
 *
 * Verifies the standard ARIA editable combobox pattern:
 * - Search input has role="combobox"
 * - aria-expanded, aria-controls, aria-autocomplete
 * - aria-activedescendant for active option
 * - Results have role="listbox" / role="option"
 * - Keyboard navigation
 * - Selection by Enter
 * - Escape closes
 * - Invalid free text rejected
 * - Saved timezone not overwritten
 */
describe('TimezoneSelect', () => {
  it('should render a combobox input with accessible name', () => {
    render(<TimezoneSelect value="Africa/Accra" onChange={() => {}} label="Timezone" />);
    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeInTheDocument();
    expect(combobox).toHaveAttribute('aria-label', 'Timezone');
  });

  it('should have aria-expanded reflecting open state', () => {
    render(<TimezoneSelect value="" onChange={() => {}} />);
    const combobox = screen.getByRole('combobox');
    expect(combobox).toHaveAttribute('aria-expanded', 'false');

    fireEvent.focus(combobox);
    expect(combobox).toHaveAttribute('aria-expanded', 'true');
  });

  it('should have aria-controls pointing to the listbox when open', () => {
    render(<TimezoneSelect value="" onChange={() => {}} />);
    const combobox = screen.getByRole('combobox');
    fireEvent.focus(combobox);

    const controlsId = combobox.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    const listbox = screen.getByRole('listbox');
    expect(listbox.id).toBe(controlsId);
  });

  it('should have aria-autocomplete="list"', () => {
    render(<TimezoneSelect value="" onChange={() => {}} />);
    const combobox = screen.getByRole('combobox');
    expect(combobox).toHaveAttribute('aria-autocomplete', 'list');
  });

  it('should set aria-activedescendant to the active option', () => {
    render(<TimezoneSelect value="" onChange={() => {}} />);
    const combobox = screen.getByRole('combobox');
    fireEvent.focus(combobox);

    // When open with results, aria-activedescendant should be set
    const activeDescendant = combobox.getAttribute('aria-activedescendant');
    expect(activeDescendant).toBeTruthy();

    // The active option should exist with that id
    const activeOption = document.getElementById(activeDescendant!);
    expect(activeOption).toBeInTheDocument();
    expect(activeOption).toHaveAttribute('role', 'option');
  });

  it('should navigate options with arrow keys', () => {
    render(<TimezoneSelect value="" onChange={() => {}} />);
    const combobox = screen.getByRole('combobox');
    fireEvent.focus(combobox);

    const initialActive = combobox.getAttribute('aria-activedescendant');

    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    const nextActive = combobox.getAttribute('aria-activedescendant');
    expect(nextActive).toBeTruthy();
    // The active descendant should change (different option)
    expect(nextActive).not.toBe(initialActive);
  });

  it('should select an option with Enter', () => {
    const onChange = jest.fn();
    render(<TimezoneSelect value="" onChange={onChange} />);
    const combobox = screen.getByRole('combobox');
    fireEvent.focus(combobox);

    // Type to filter
    fireEvent.change(combobox, { target: { value: 'Lagos' } });

    // Press Enter to select the first (and likely only) result
    fireEvent.keyDown(combobox, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('Africa/Lagos');
  });

  it('should close on Escape', () => {
    render(<TimezoneSelect value="" onChange={() => {}} />);
    const combobox = screen.getByRole('combobox');
    fireEvent.focus(combobox);
    expect(combobox).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(combobox, { key: 'Escape' });
    expect(combobox).toHaveAttribute('aria-expanded', 'false');
  });

  it('should not overwrite a saved timezone value', () => {
    const onChange = jest.fn();
    render(<TimezoneSelect value="America/New_York" onChange={onChange} />);
    // onChange should not be called on mount when value is already set
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should use fallback list when Intl.supportedValuesOf is unavailable', () => {
    const original = (Intl as unknown as { supportedValuesOf?: unknown }).supportedValuesOf;
    Object.defineProperty(Intl, 'supportedValuesOf', { value: undefined, configurable: true });

    const onChange = jest.fn();
    render(<TimezoneSelect value="" onChange={onChange} />);

    // The fallback list includes Europe/London
    const combobox = screen.getByRole('combobox');
    fireEvent.focus(combobox);
    fireEvent.change(combobox, { target: { value: 'London' } });

    expect(screen.getByText(/Europe\/London/)).toBeInTheDocument();

    if (original) {
      Object.defineProperty(Intl, 'supportedValuesOf', { value: original, configurable: true });
    }
  });

  it('should reject invalid free-text (cannot commit unrecognized timezone)', () => {
    const onChange = jest.fn();
    render(<TimezoneSelect value="" onChange={onChange} />);
    const combobox = screen.getByRole('combobox');
    fireEvent.focus(combobox);

    // Type an invalid timezone that won't match any option
    fireEvent.change(combobox, { target: { value: 'zzz_invalid_tz' } });

    // No results should match
    expect(screen.getByText(/No timezones match/i)).toBeInTheDocument();

    // Pressing Enter should NOT call onChange with the invalid value
    fireEvent.keyDown(combobox, { key: 'Enter' });
    // onChange should not be called with 'zzz_invalid_tz'
    expect(onChange).not.toHaveBeenCalledWith('zzz_invalid_tz');
  });

  it('should render options with role="option" and aria-selected', () => {
    render(<TimezoneSelect value="Africa/Accra" onChange={() => {}} />);
    const combobox = screen.getByRole('combobox');
    fireEvent.focus(combobox);

    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);

    // The selected option should have aria-selected="true"
    const selectedOption = options.find((o) => o.getAttribute('aria-selected') === 'true');
    expect(selectedOption).toBeDefined();
  });
});
