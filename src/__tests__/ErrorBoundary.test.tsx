import * as Sentry from '@sentry/nextjs';
import { render, screen, waitFor } from '@testing-library/react';

import ErrorBoundary from '@/app/error';
import GlobalErrorBoundary from '@/app/global-error';

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
}));

describe('error boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders no raw error text and captures a client failure with the displayed ID', async () => {
    const error = new Error('postgres://user:password@host');
    const { rerender } = render(<ErrorBoundary error={error} reset={jest.fn()} />);

    const incident = screen.getByTestId('error-incident-id').textContent;
    expect(incident).toMatch(/^Incident ID: [\w-]+$/);
    expect(screen.queryByText(/postgres|password/i)).not.toBeInTheDocument();

    await waitFor(() => expect(Sentry.captureException).toHaveBeenCalledTimes(1));
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { 'incident.id': incident?.replace('Incident ID: ', '') } }),
    );

    rerender(<ErrorBoundary error={error} reset={jest.fn()} />);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('does not recapture an error with a server digest', async () => {
    render(
      <GlobalErrorBoundary
        error={Object.assign(new Error('password=secret'), { digest: 'digest-123' })}
        reset={jest.fn()}
      />,
    );

    expect(screen.getByTestId('error-incident-id')).toHaveTextContent('Incident ID: digest-123');
    expect(screen.queryByText(/password|secret/i)).not.toBeInTheDocument();
    await waitFor(() => expect(Sentry.captureException).not.toHaveBeenCalled());
  });
});
