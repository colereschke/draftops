import { render, screen } from '@testing-library/react';
import MutationStatus from '@/components/MutationStatus';

describe('MutationStatus', () => {
  it('renders the message inside a polite live region', () => {
    render(<MutationStatus message="Saving bid…" />);

    const region = screen.getByTestId('mutation-status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveTextContent('Saving bid…');
  });

  it('renders an empty region when there is no message', () => {
    render(<MutationStatus message="" />);

    expect(screen.getByTestId('mutation-status')).toHaveTextContent('');
  });
});
