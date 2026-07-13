export function ageColor(age: number | null): string {
  if (age === null) return 'var(--text-muted)';
  if (age <= 24) return 'var(--age-young)';
  if (age <= 27) return 'var(--age-prime)';
  if (age <= 30) return 'var(--age-aging)';
  return 'var(--age-old)';
}
