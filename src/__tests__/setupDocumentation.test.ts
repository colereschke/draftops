import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const readTrackedFile = (fileName: string) => readFileSync(join(process.cwd(), fileName), 'utf8');

describe('setup documentation', () => {
  test('keeps every required Auth.js environment variable empty in the safe template', () => {
    const environmentTemplate = readTrackedFile('.env.example');

    expect(environmentTemplate).toMatch(/^AUTH_SECRET=$/m);
    expect(environmentTemplate).toMatch(/^AUTH_DISCORD_ID=$/m);
    expect(environmentTemplate).toMatch(/^AUTH_DISCORD_SECRET=$/m);
    expect(environmentTemplate).toMatch(/^OWNER_DISCORD_ID=$/m);
  });

  test('describes the PostgreSQL setup and smoke command', () => {
    const readme = readTrackedFile('README.md');

    expect(readme).toContain('make setup-smoke');
    expect(readme).not.toContain('SQLite via Prisma 7');
  });

  test('forces setup migrations to use the validated smoke database', () => {
    const makefile = readTrackedFile('Makefile');

    expect(makefile).toContain('DIRECT_URL="$(DATABASE_URL)" $(MAKE) setup');
  });

  test('documents how to acquire the untracked projection inputs', () => {
    const projectionGuide = readTrackedFile('scripts/projections/README.md');

    expect(projectionGuide).toContain('https://api.sleeper.app/v1/players/nfl');
    expect(projectionGuide).toContain('data/raw/sleeper_players.json');
    expect(projectionGuide).toContain('licensed');
    expect(projectionGuide).toMatch(/cannot be\s+committed or distributed/);
  });

  test('documents the Sleeper identity bootstrap before projection import', () => {
    const readme = readTrackedFile('README.md');
    const sleeperSync = 'pnpm tsx prisma/sync-sleeper-players.ts';
    const projectionImport = 'pnpm tsx prisma/apply-projection-values.ts';

    expect(readme).toContain(sleeperSync);
    expect(readme.indexOf(sleeperSync)).toBeLessThan(readme.indexOf(projectionImport));
    expect(readme).toContain('[Python](https://www.python.org/) 3.11+');
    expect(readme).toContain('[uv](https://docs.astral.sh/uv/)');
  });

  test('describes the current proxy and error routes in agent guidance', () => {
    const agentGuidance = readTrackedFile('AGENTS.md');

    expect(agentGuidance).toContain('src/proxy.ts');
    expect(agentGuidance).not.toContain('middleware.ts');
    expect(agentGuidance).not.toContain('log-error/route.ts');
  });

  test('keeps the agent guidance identical across supported assistants', () => {
    expect(readTrackedFile('AGENTS.md')).toBe(readTrackedFile('CLAUDE.md'));
  });
});
