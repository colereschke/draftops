import { renderHook, act } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { useNumericField } from '@/lib/useNumericField';

function changeEvent(value: string): ChangeEvent<HTMLInputElement> {
  return { target: { value } } as ChangeEvent<HTMLInputElement>;
}

describe('useNumericField', () => {
  it('starts with the initial value as a string and number', () => {
    const { result } = renderHook(() => useNumericField(30));
    expect(result.current.value).toBe('30');
    expect(result.current.numericValue).toBe(30);
  });

  it('allows clearing to an empty string without forcing a default back into the field', () => {
    const { result } = renderHook(() => useNumericField(30));
    act(() => result.current.onChange(changeEvent('')));
    expect(result.current.value).toBe('');
    expect(result.current.numericValue).toBe(30); // falls back to initial while empty
  });

  it('allows a lone minus sign as an intermediate typing state', () => {
    const { result } = renderHook(() => useNumericField(-2, { float: true }));
    act(() => result.current.onChange(changeEvent('-')));
    expect(result.current.value).toBe('-'); // displayed value is never coerced away
    expect(result.current.numericValue).toBe(-2); // "-" doesn't parse, falls back to initial
  });

  it('does not clamp a fully-typed out-of-range value — the caller trusts the user', () => {
    const { result } = renderHook(() => useNumericField(30));
    act(() => result.current.onChange(changeEvent('9999')));
    expect(result.current.value).toBe('9999');
    expect(result.current.numericValue).toBe(9999); // no clamping, no silent mismatch
  });

  it('uses parseInt by default and parseFloat when float is set', () => {
    const intField = renderHook(() => useNumericField(0));
    act(() => intField.result.current.onChange(changeEvent('3.7')));
    expect(intField.result.current.numericValue).toBe(3); // parseInt truncates

    const floatField = renderHook(() => useNumericField(0, { float: true }));
    act(() => floatField.result.current.onChange(changeEvent('3.7')));
    expect(floatField.result.current.numericValue).toBe(3.7);
  });

  it('setNumericValue updates both the displayed value and numericValue imperatively', () => {
    const { result } = renderHook(() => useNumericField(30));
    act(() => result.current.setNumericValue(45));
    expect(result.current.value).toBe('45');
    expect(result.current.numericValue).toBe(45);
  });
});
