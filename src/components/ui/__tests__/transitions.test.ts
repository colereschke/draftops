import fs from 'fs';
import path from 'path';

describe('motion-sensitive transitions', () => {
  it('Button and Toggle do not use transition-all', () => {
    const buttonSource = fs.readFileSync(path.resolve(__dirname, '../button.tsx'), 'utf-8');
    const toggleSource = fs.readFileSync(path.resolve(__dirname, '../toggle.tsx'), 'utf-8');
    expect(buttonSource).not.toMatch(/\btransition-all\b/);
    expect(toggleSource).not.toMatch(/\btransition-all\b/);
  });

  it('globals.css disables transitions and animations under prefers-reduced-motion', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../../app/globals.css'), 'utf-8');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{/);
    expect(css).toMatch(/transition-duration: 0\.01ms !important/);
    expect(css).toMatch(/animation-duration: 0\.01ms !important/);
  });
});
