import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BudgetRefresher from '@/components/BudgetPressure/BudgetRefresher';

const mockRefresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

beforeEach(() => {
  jest.useFakeTimers();
  mockRefresh.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

function setup() {
  return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}

describe('BudgetRefresher', () => {
  it('renders the elapsed counter starting at 0', () => {
    render(<BudgetRefresher intervalMs={20000} />);
    expect(screen.getByText('Updated 0s ago')).toBeInTheDocument();
  });

  it('increments elapsed counter every second', () => {
    render(<BudgetRefresher intervalMs={20000} />);
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByText('Updated 5s ago')).toBeInTheDocument();
  });

  it('calls router.refresh() and resets counter after intervalMs', () => {
    render(<BudgetRefresher intervalMs={20000} />);
    act(() => {
      jest.advanceTimersByTime(20000);
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Updated 0s ago')).toBeInTheDocument();
  });

  it('calls router.refresh() on manual refresh button click', async () => {
    const user = setup();
    render(<BudgetRefresher intervalMs={20000} />);
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('resets elapsed counter on manual refresh', async () => {
    const user = setup();
    render(<BudgetRefresher intervalMs={20000} />);
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    expect(screen.getByText('Updated 0s ago')).toBeInTheDocument();
  });
});
