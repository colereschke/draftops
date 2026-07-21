import fs from 'fs';
import path from 'path';
import { contrastRatio } from '../contrastRatio';

const css = fs.readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf-8');

function tokenHex(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`Token --${name} not found in globals.css`);
  return match[1];
}

const WCAG_AA_NORMAL_TEXT = 4.5;
const BACKGROUND_TOKENS = ['bg-base', 'bg-surface', 'bg-elevated'];

describe('semantic token contrast (WCAG AA, normal text)', () => {
  it.each(BACKGROUND_TOKENS)('--text-muted meets 4.5:1 against --%s', (bgName) => {
    const ratio = contrastRatio(tokenHex('text-muted'), tokenHex(bgName));
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it.each(BACKGROUND_TOKENS)(
    '--age-old (aliased to --destructive) meets 4.5:1 against --%s',
    (bgName) => {
      const ratio = contrastRatio(tokenHex('age-old'), tokenHex(bgName));
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    },
  );
});
