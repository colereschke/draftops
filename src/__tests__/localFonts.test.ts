import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

interface FontAsset {
  filename: string;
}

const ROOT = process.cwd();
const FONT_DIRECTORY = resolve(ROOT, 'src/app/fonts');
const LAYOUT_PATH = resolve(ROOT, 'src/app/layout.tsx');
const MANIFEST_PATH = resolve(FONT_DIRECTORY, 'FONTS.md');
const FONT_ASSETS: FontAsset[] = [
  { filename: 'Inter-Variable.woff2' },
  { filename: 'JetBrainsMono-Variable.woff2' },
  { filename: 'BarlowCondensed-SemiBold.woff2' },
  { filename: 'BarlowCondensed-Bold.woff2' },
];

describe('local application fonts', () => {
  it('uses tracked local font assets with manifest checksums', () => {
    const layout = readFileSync(LAYOUT_PATH, 'utf8');
    const manifest = readFileSync(MANIFEST_PATH, 'utf8');

    expect(layout).toContain("from 'next/font/local'");
    expect(layout).not.toContain('next/font/google');

    for (const { filename } of FONT_ASSETS) {
      const assetPath = resolve(FONT_DIRECTORY, filename);

      expect(layout).toContain(filename);
      expect(existsSync(assetPath)).toBe(true);
      expect(() => execFileSync('git', ['ls-files', '--error-unmatch', assetPath])).not.toThrow();

      const checksum = createHash('sha256').update(readFileSync(assetPath)).digest('hex');
      const manifestRow = manifest.split('\n').find((line) => line.includes(`\`${filename}\``));
      const declaredChecksum = manifestRow?.match(/`([a-f0-9]{64})`/)?.[1];

      expect(declaredChecksum).toBe(checksum);
    }
  });
});
