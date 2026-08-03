import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * ConfirmDialog tests — UX feature.
 */
describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    title: 'Disconnect broker?',
    description: 'Automated trading will remain unavailable until a broker is reconnected.',
    confirmLabel: 'Disconnect',
    cancelLabel: 'Cancel',
    tone: 'danger' as const,
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the title and description when open', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Disconnect broker?')).toBeInTheDocument();
    expect(screen.getByText(/automated trading will remain/i)).toBeInTheDocument();
  });

  it('should not render when open is false', () => {
    render(<ConfirmDialog {...defaultProps} open={false} />);
    expect(screen.queryByText('Disconnect broker?')).not.toBeInTheDocument();
  });

  it('should focus the Cancel button on open', async () => {
    render(<ConfirmDialog {...defaultProps} />);
    await waitFor(() => {
      const cancelButton = screen.getByText('Cancel');
      expect(cancelButton).toHaveFocus();
    });
  });

  it('should call onCancel when Escape is pressed', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('should call onConfirm when the Confirm button is clicked', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(screen.getByText('Disconnect'));
    expect(defaultProps.onConfirm).toHaveBeenCalled();
  });

  it('should call onCancel when the Cancel button is clicked', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('should have role="dialog" and aria-modal="true"', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
