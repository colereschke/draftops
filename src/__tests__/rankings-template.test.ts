import fs from 'fs';
import path from 'path';
import { parseRankingsCsv } from '@/lib/rankingsImport';

describe('rankings-template.csv', () => {
  function readTemplate(): string {
    const csvPath = path.join(process.cwd(), 'public', 'rankings-template.csv');
    return fs.readFileSync(csvPath, 'utf-8');
  }

  it('is a valid rankings CSV that parses without errors', () => {
    const result = parseRankingsCsv(readTemplate());
    expect(result.ok).toBe(true);
  });

  it('includes one example row for each of QB, RB, WR, TE, and PICK', () => {
    const result = parseRankingsCsv(readTemplate());
    if (!result.ok) throw new Error('expected template to parse successfully');
    const positions = result.rows.map((r) => r.pos).sort();
    expect(positions).toEqual(['PICK', 'QB', 'RB', 'TE', 'WR']);
  });
});
