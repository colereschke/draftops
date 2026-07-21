import { render, screen, act, fireEvent } from '@testing-library/react';
import BudgetRefresher from '@/components/BudgetPressure/BudgetRefresher';

const mockRefresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

describe('BudgetRefresher', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockRefresh.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('announces a refresh through the shared live region on the polling interval', () => {
    render(<BudgetRefresher intervalMs={20000} />);

    act(() => {
      jest.advanceTimersByTime(20000);
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('mutation-status')).toHaveTextContent(/threat board refreshed/i);
  });

  it('announces a refresh through the shared live region on manual click', () => {
    render(<BudgetRefresher intervalMs={20000} />);

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('mutation-status')).toHaveTextContent(/threat board refreshed/i);
  });
});
