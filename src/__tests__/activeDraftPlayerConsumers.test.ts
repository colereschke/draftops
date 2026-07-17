/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const consumers = ['src/app/draft/[draftId]/page.tsx', 'src/app/draft/[draftId]/nominate/page.tsx'];

describe('active draft player consumers', () => {
  it.each(consumers)('%s uses the canonical service', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');

    expect(source).toContain("from '@/lib/activeDraftPlayers'");
    expect(source).toContain('getActiveDraftPlayers({');
    expect(source).not.toContain("from '@/lib/playerValueMapping'");
    expect(source).not.toContain("from '@/lib/dynamicPickValues'");
  });
});
