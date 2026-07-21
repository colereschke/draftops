import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 300));
    expect(result.current).toBe('a');
  });

  it('does not update before the delay elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'ab' });
    act(() => jest.advanceTimersByTime(299));
    expect(result.current).toBe('a');
  });

  it('updates to the latest value once the delay elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'ab' });
    act(() => jest.advanceTimersByTime(300));
    expect(result.current).toBe('ab');
  });

  it('resets the timer on rapid successive changes, keeping only the final value', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'ab' });
    act(() => jest.advanceTimersByTime(200));
    rerender({ value: 'abc' });
    act(() => jest.advanceTimersByTime(200));
    expect(result.current).toBe('a');
    act(() => jest.advanceTimersByTime(100));
    expect(result.current).toBe('abc');
  });
});
