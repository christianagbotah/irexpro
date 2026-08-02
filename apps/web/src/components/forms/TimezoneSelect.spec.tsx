import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TimezoneSelect } from './TimezoneSelect';

/**
 * TimezoneSelect tests — UX feature.
 */
describe('TimezoneSelect', () => {
  it('should render with the selected timezone value', () => {
    render(<TimezoneSelect value="Africa/Accra" onChange={() => {}} />);
    expect(screen.getByText(/Africa\/Accra/)).toBeInTheDocument();
  });

  it('should render with empty value and not crash', () => {
    render(<TimezoneSelect value="" onChange={() => {}} />);
    // Component should render without error when value is empty
    // It may auto-detect the browser timezone
    expect(document.body).toBeInTheDocument();
  });

  it('should use fallback list when Intl.supportedValuesOf is unavailable', () => {
    const original = (Intl as unknown as { supportedValuesOf?: unknown }).supportedValuesOf;
    Object.defineProperty(Intl, 'supportedValuesOf', { value: undefined, configurable: true });

    render(<TimezoneSelect value="Europe/London" onChange={() => {}} />);
    expect(screen.getByText(/Europe\/London/)).toBeInTheDocument();

    // Restore
    if (original) {
      Object.defineProperty(Intl, 'supportedValuesOf', { value: original, configurable: true });
    }
  });

  it('should not overwrite a saved timezone value', () => {
    render(<TimezoneSelect value="America/New_York" onChange={() => {}} />);
    expect(screen.getByText(/America\/New_York/)).toBeInTheDocument();
  });
});
