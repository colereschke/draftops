import { contrastRatio } from '../contrastRatio';

describe('contrastRatio', () => {
  it('returns 21:1 for pure black on pure white', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
  });

  it('returns 1:1 for identical colors', () => {
    expect(contrastRatio('#334455', '#334455')).toBeCloseTo(1, 5);
  });

  it('is symmetric regardless of argument order', () => {
    const a = contrastRatio('#e8eaf0', '#141824');
    const b = contrastRatio('#141824', '#e8eaf0');
    expect(a).toBeCloseTo(b, 10);
  });
});
