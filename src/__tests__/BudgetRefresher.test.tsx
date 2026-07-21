import { render, screen, act, fireEvent } from '@testing-library/react';
import BudgetRefresher from '@/components/BudgetPressure/BudgetRefresher';

const mockRefresh = jest.fn();

function setVisibilityState(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
  document.dispatchEvent(new Event('visibilitychange'));
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

describe('BudgetRefresher', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockRefresh.mockClear();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('announces a refresh through the shared live region on the polling interval', () => {
    render(<BudgetRefresher intervalMs={20000} />);

    act(() => {
      jest.advanceTimersByTime(20050);
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('mutation-status')).toHaveTextContent(/threat board refreshed/i);
  });

  it('announces a refresh through the shared live region on manual click', () => {
    render(<BudgetRefresher intervalMs={20000} />);

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    act(() => {
      jest.advanceTimersByTime(50);
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('mutation-status')).toHaveTextContent(/threat board refreshed/i);
  });

  it('re-announces identical repeated refreshes by clearing the message before re-setting it', () => {
    render(<BudgetRefresher intervalMs={20000} />);

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(screen.getByTestId('mutation-status')).toHaveTextContent(/threat board refreshed/i);

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    // Immediately after the second trigger, before the delayed re-set fires, the message
    // must have been cleared — this is the real DOM mutation that lets aria-live re-announce
    // identical text. If this assertion fails, the fix regressed to setting the same string
    // twice with no intermediate change.
    expect(screen.getByTestId('mutation-status')).toHaveTextContent('');

    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(screen.getByTestId('mutation-status')).toHaveTextContent(/threat board refreshed/i);
  });

  it('does not refresh while hidden and refreshes once on visibility restore', () => {
    render(<BudgetRefresher intervalMs={20000} />);

    act(() => setVisibilityState('hidden'));
    act(() => jest.advanceTimersByTime(60000));
    expect(mockRefresh).not.toHaveBeenCalled();

    act(() => setVisibilityState('visible'));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
