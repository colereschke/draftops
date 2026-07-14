'use client';

import { useState } from 'react';
import type { ChangeEvent } from 'react';

export interface UseNumericFieldOptions {
  float?: boolean;
}

export interface UseNumericField {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  numericValue: number;
  setNumericValue: (n: number) => void;
}

export function useNumericField(
  initial: number,
  options: UseNumericFieldOptions = {},
): UseNumericField {
  const { float = false } = options;
  const [value, setValue] = useState(String(initial));

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
  }

  function setNumericValue(n: number) {
    setValue(String(n));
  }

  const parsed = float ? parseFloat(value) : parseInt(value, 10);
  const numericValue = Number.isFinite(parsed) ? parsed : initial;

  return { value, onChange, numericValue, setNumericValue };
}
