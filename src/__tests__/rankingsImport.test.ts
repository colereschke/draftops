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
});
