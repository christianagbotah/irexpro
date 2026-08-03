import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { InfoTooltip } from './InfoTooltip';

/**
 * InfoTooltip tests — UX feature.
 */
describe('InfoTooltip', () => {
  it('should render an info icon button with aria-label', () => {
    render(<InfoTooltip label="Explain maximum daily loss" content="The maximum percentage..." />);
    const button = screen.getByLabelText(/explain maximum daily loss/i);
    expect(button).toBeInTheDocument();
  });

  it('should show tooltip content when clicked', () => {
    render(<InfoTooltip label="Explain maximum drawdown" content="The maximum permitted decline..." />);
    const button = screen.getByLabelText(/explain maximum drawdown/i);
    fireEvent.click(button);
    expect(screen.getByText(/maximum permitted decline/i)).toBeInTheDocument();
  });

  it('should show tooltip content when focused', () => {
    render(<InfoTooltip label="Explain maximum leverage" content="The highest leverage..." />);
    const button = screen.getByLabelText(/explain maximum leverage/i);
    fireEvent.focus(button);
    expect(screen.getByText(/highest leverage/i)).toBeInTheDocument();
  });

  it('should close the tooltip when Escape is pressed', () => {
    render(<InfoTooltip label="Explain risk acknowledgement" content="Accepting the risk..." />);
    const button = screen.getByLabelText(/explain risk acknowledgement/i);
    fireEvent.click(button);
    expect(screen.getByText(/accepting the risk/i)).toBeInTheDocument();

    // Try Escape on the button first, then on document
    fireEvent.keyDown(button, { key: 'Escape' });
    // If still visible, try on document
    if (screen.queryByText(/accepting the risk/i)) {
      fireEvent.keyDown(document, { key: 'Escape' });
    }
    expect(screen.queryByText(/accepting the risk/i)).not.toBeInTheDocument();
  });

  it('should render a tooltip panel with role="tooltip"', () => {
    render(<InfoTooltip label="Explain max open trades" content="The maximum number of positions..." />);
    const button = screen.getByLabelText(/explain max open trades/i);
    fireEvent.click(button);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });
});
