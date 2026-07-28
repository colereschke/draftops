import * as Sentry from '@sentry/nextjs';
import { render, screen, waitFor } from '@testing-library/react';
import RouteErrorBoundary from '@/components/RouteErrorBoundary';

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
}));

describe('RouteErrorBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the given title and no raw error text, and captures the failure once', async () => {
    const error = new Error('postgres://user:password@host');
    const { rerender } = render(
      <RouteErrorBoundary error={error} reset={jest.fn()} title="Failed to load team rosters" />,
    );

    expect(screen.getByTestId('route-error-title')).toHaveTextContent(
      'Failed to load team rosters',
    );
    const incident = screen.getByTestId('error-incident-id').textContent;
    expect(incident).toMatch(/^Incident ID: [\w-]+$/);
    expect(screen.queryByText(/postgres|password/i)).not.toBeInTheDocument();

    await waitFor(() => expect(Sentry.captureException).toHaveBeenCalledTimes(1));

    rerender(
      <RouteErrorBoundary error={error} reset={jest.fn()} title="Failed to load team rosters" />,
    );
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('does not recapture an error that already carries a server digest', async () => {
    render(
      <RouteErrorBoundary
        error={Object.assign(new Error('secret'), { digest: 'digest-123' })}
        reset={jest.fn()}
        title="Failed to load budget pressure"
      />,
    );
    expect(screen.getByTestId('error-incident-id')).toHaveTextContent('Incident ID: digest-123');
    await waitFor(() => expect(Sentry.captureException).not.toHaveBeenCalled());
  });
});
