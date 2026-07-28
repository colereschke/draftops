import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const readTrackedFile = (fileName: string) => readFileSync(join(process.cwd(), fileName), 'utf8');

describe('setup documentation', () => {
  test('lists every required Auth.js environment variable in the safe template', () => {
    const environmentTemplate = readTrackedFile('.env.example');

    expect(environmentTemplate).toContain('AUTH_SECRET=');
    expect(environmentTemplate).toContain('AUTH_DISCORD_ID=');
    expect(environmentTemplate).toContain('AUTH_DISCORD_SECRET=');
    expect(environmentTemplate).toContain('OWNER_DISCORD_ID=');
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
