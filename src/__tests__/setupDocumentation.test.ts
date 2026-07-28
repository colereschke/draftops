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

  test('keeps the agent guidance identical across supported assistants', () => {
    expect(readTrackedFile('AGENTS.md')).toBe(readTrackedFile('CLAUDE.md'));
  });
});
