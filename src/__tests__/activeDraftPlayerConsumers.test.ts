/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const consumers = [
  'src/app/draft/[draftId]/page.tsx',
  'src/app/draft/[draftId]/nominate/page.tsx',
  'src/app/draft/[draftId]/teams/page.tsx',
  'src/app/draft/[draftId]/budget/page.tsx',
  'src/app/api/draft/[draftId]/nomination-data/route.ts',
];

describe('active draft player consumers', () => {
  it.each(consumers)('%s uses the canonical service', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');

    expect(source).toContain("from '@/lib/activeDraftPlayers'");
    expect(source).toContain('getActiveDraftPlayers({');
    expect(source).not.toContain("from '@/lib/playerValueMapping'");
    expect(source).not.toContain("from '@/lib/dynamicPickValues'");
  });

  it.each([
    'src/app/draft/[draftId]/teams/page.tsx',
    'src/app/draft/[draftId]/budget/page.tsx',
    'src/app/api/draft/[draftId]/nomination-data/route.ts',
  ])('%s uses canonical team statistics', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');

    expect(source).toContain("from '@/lib/computeDraftTeamStats'");
    expect(source).toContain('computeDraftTeamStats({');
    expect(source).not.toContain("from '@/lib/budget'");
    expect(source).not.toContain("from '@/lib/computeTeamStats'");
  });
});
