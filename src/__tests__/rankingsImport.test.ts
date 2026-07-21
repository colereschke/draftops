import { parseRankingsCsv } from '@/lib/rankingsImport';

const HEADER = 'Player,Team,Position,Age,2QBAuction';
const HEADER_WITH_RANK = 'Player,Team,Position,Age,SF/TE Prem,2QBAuction';

describe('parseRankingsCsv', () => {
  it('rejects a file missing required columns', () => {
    const result = parseRankingsCsv('Player,Team\nJosh Allen,BUF');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/missing required column/i);
    }
  });

  it('parses valid QB/RB/WR/TE rows and derives sfRank by budget descending when SF/TE Prem is absent', () => {
    const csv = [
      HEADER,
      'Josh Allen,BUF,QB,30.1,$51',
      "Ja'Marr Chase,CIN,WR,26.3,$49",
      'Some Guy,FA,QB,25,$10',
    ].join('\n');
    const result = parseRankingsCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(3);
    const allen = result.rows.find((r) => r.name === 'Josh Allen')!;
    expect(allen).toMatchObject({ team: 'BUF', pos: 'QB', age: 30.1, sfRank: 1, budget: 255 });
    const chase = result.rows.find((r) => r.name === "Ja'Marr Chase")!;
    expect(chase.sfRank).toBe(2);
    const guy = result.rows.find((r) => r.name === 'Some Guy')!;
    expect(guy.sfRank).toBe(3);
  });

  it('uses the SF/TE Prem column directly when present', () => {
    const csv = [
      HEADER_WITH_RANK,
      'Josh Allen,BUF,QB,30.1,2,$51',
      "Ja'Marr Chase,CIN,WR,26.3,1,$49",
    ].join('\n');
    const result = parseRankingsCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.find((r) => r.name === 'Josh Allen')!.sfRank).toBe(2);
    expect(result.rows.find((r) => r.name === "Ja'Marr Chase")!.sfRank).toBe(1);
  });

  it('rejects when SF/TE Prem is present but a kept row is missing a value', () => {
    const csv = [HEADER_WITH_RANK, 'Josh Allen,BUF,QB,30.1,,$51'].join('\n');
    const result = parseRankingsCsv(csv);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/SF\/TE Prem/);
    }
  });

  it('keeps Pick rows with a null age and no matching required', () => {
    const csv = [HEADER, '2027 1st Round Draft Pick,,Pick,,$15'].join('\n');
    const result = parseRankingsCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ pos: 'PICK', age: null });
  });

  it('matches Position case-insensitively', () => {
    const csv = [HEADER, 'Josh Allen,BUF,qb,30.1,$51', "Ja'Marr Chase,CIN,Wr,26.3,$49"].join('\n');
    const result = parseRankingsCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(2);
    expect(result.rows.find((r) => r.name === 'Josh Allen')!.pos).toBe('QB');
    expect(result.rows.find((r) => r.name === "Ja'Marr Chase")!.pos).toBe('WR');
  });

  it('silently drops rows with an unsupported position', () => {
    const csv = [HEADER, 'Some Kicker,LAC,K,28,$0'].join('\n');
    const result = parseRankingsCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(0);
  });

  it('collects multiple row errors instead of aborting on the first', () => {
    const csv = [HEADER, ',BUF,QB,30,$50', 'Bad Age Guy,BUF,QB,not-a-number,$40'].join('\n');
    const result = parseRankingsCsv(csv);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(2);
    }
  });

  it('defaults Notes to empty string when the column is absent', () => {
    const csv = [HEADER, 'Josh Allen,BUF,QB,30.1,$51'].join('\n');
    const result = parseRankingsCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0].notes).toBe('');
  });

  it.each([
    ['Infinite age', 'Josh Allen,BUF,QB,Infinity,$51', /invalid Age/i],
    ['out-of-range age', 'Josh Allen,BUF,QB,101,$51', /invalid Age/i],
    ['Infinite value', 'Josh Allen,BUF,QB,30,Infinity', /invalid 2QBAuction/i],
    ['out-of-range value', 'Josh Allen,BUF,QB,30,1000001', /invalid 2QBAuction/i],
  ])('rejects %s', (_description, row, expectedError) => {
    const result = parseRankingsCsv([HEADER, row].join('\n'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(expectedError)]));
    }
  });

  it.each(['1.5', 'Infinity', '0', '10001'])('rejects invalid explicit rank %s', (rank) => {
    const result = parseRankingsCsv(
      [HEADER_WITH_RANK, `Josh Allen,BUF,QB,30,${rank},$51`].join('\n'),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringMatching(/invalid SF\/TE Prem/i)]),
      );
    }
  });

  it('rejects duplicate normalized player identities', () => {
    const result = parseRankingsCsv(
      [HEADER, 'Josh Allen,BUF,QB,30,$51', '  josh allen  ,BUF,QB,30,$50'].join('\n'),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringMatching(/duplicate player/i)]),
      );
    }
  });

  it('rejects duplicate explicit ranks', () => {
    const result = parseRankingsCsv(
      [HEADER_WITH_RANK, 'Josh Allen,BUF,QB,30,1,$51', 'Lamar Jackson,BAL,QB,28,1,$50'].join('\n'),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringMatching(/duplicate.*rank/i)]),
      );
    }
  });

  it('rejects an upload containing a field longer than 10,000 characters', () => {
    const result = parseRankingsCsv(
      [`${HEADER},Notes`, `Josh Allen,BUF,QB,30,$51,${'x'.repeat(10001)}`].join('\n'),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/field/i)]));
    }
  });

  it('rejects a UTF-8 upload larger than 1 MiB', () => {
    const result = parseRankingsCsv(`${HEADER}\nJosh Allen,BUF,QB,30,$51\n${'é'.repeat(524288)}`);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/size/i)]));
    }
  });

  it('rejects an upload with more than 2,000 data rows', () => {
    const result = parseRankingsCsv(
      [HEADER, ...Array.from({ length: 2001 }, () => 'Josh Allen,BUF,QB,30,$51')].join('\n'),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/row count/i)]));
    }
  });

  it('accepts an upload with exactly 2,000 data rows', () => {
    const result = parseRankingsCsv(
      [HEADER, ...Array.from({ length: 2000 }, (_, index) => `Player ${index},BUF,QB,30,$51`)].join(
        '\n',
      ),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toHaveLength(2000);
    }
  });

  it('caps row validation errors at 25 and appends a truncation message', () => {
    const result = parseRankingsCsv(
      [HEADER, ...Array.from({ length: 30 }, () => ',BUF,QB,30,$51')].join('\n'),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(26);
      expect(result.errors.at(-1)).toBe('Too many validation errors; showing the first 25.');
    }
  });
});
