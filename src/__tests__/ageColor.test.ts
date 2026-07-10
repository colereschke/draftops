import { ageColor } from '@/lib/ageColor';

describe('ageColor', () => {
  it('returns the muted color for null age', () => {
    expect(ageColor(null)).toBe('var(--text-muted)');
  });

  it('returns young for age 24 and below', () => {
    expect(ageColor(24)).toBe('var(--age-young)');
    expect(ageColor(20)).toBe('var(--age-young)');
  });

  it('returns prime for age 25-27', () => {
    expect(ageColor(25)).toBe('var(--age-prime)');
    expect(ageColor(27)).toBe('var(--age-prime)');
  });

  it('returns aging for age 28-30', () => {
    expect(ageColor(28)).toBe('var(--age-aging)');
    expect(ageColor(30)).toBe('var(--age-aging)');
  });

  it('returns old for age 31 and above', () => {
    expect(ageColor(31)).toBe('var(--age-old)');
    expect(ageColor(40)).toBe('var(--age-old)');
  });
});
