import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FirstRunWelcome from '@/components/Onboarding/FirstRunWelcome';
import { beginOnboarding, completeOnboarding } from '@/lib/onboarding-actions';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/lib/onboarding-actions', () => ({
  beginOnboarding: jest.fn(),
  completeOnboarding: jest.fn(),
}));

const mockBeginOnboarding = jest.mocked(beginOnboarding);
const mockCompleteOnboarding = jest.mocked(completeOnboarding);

beforeEach(() => {
  jest.clearAllMocks();
  mockBeginOnboarding.mockResolvedValue();
  mockCompleteOnboarding.mockResolvedValue();
});

describe('FirstRunWelcome', () => {
  it('starts onboarding and opens draft creation', async () => {
    const user = userEvent.setup();
    render(<FirstRunWelcome eligible />);

    await user.click(screen.getByTestId('first-run-create-draft'));

    expect(mockBeginOnboarding).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/drafts/new');
  });

  it('keeps the welcome panel visible and reports an error when setup cannot start', async () => {
    const user = userEvent.setup();
    mockBeginOnboarding.mockRejectedValueOnce(new Error('Unavailable'));
    render(<FirstRunWelcome eligible />);

    await user.click(screen.getByTestId('first-run-create-draft'));

    expect(screen.getByTestId('first-run-welcome-error')).toHaveTextContent(
      'Could not start setup. Please try again.',
    );
    expect(screen.getByTestId('first-run-welcome')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('completes onboarding and dismisses the panel when skipped', async () => {
    const user = userEvent.setup();
    render(<FirstRunWelcome eligible />);

    await user.click(screen.getByTestId('first-run-skip'));

    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('first-run-welcome')).not.toBeInTheDocument();
  });

  it('keeps the welcome panel visible and reports an error when skipping fails', async () => {
    const user = userEvent.setup();
    mockCompleteOnboarding.mockRejectedValueOnce(new Error('Unavailable'));
    render(<FirstRunWelcome eligible />);

    await user.click(screen.getByTestId('first-run-skip'));

    expect(screen.getByTestId('first-run-welcome-error')).toHaveTextContent(
      'Could not skip setup. Please try again.',
    );
    expect(screen.getByTestId('first-run-welcome')).toBeInTheDocument();
  });

  it('does not render for ineligible users', () => {
    render(<FirstRunWelcome eligible={false} />);

    expect(screen.queryByTestId('first-run-welcome')).not.toBeInTheDocument();
  });
});
