import { CsvParseError, parseCsv, parseCsvLine } from '@/lib/csv';

describe('parseCsvLine', () => {
  it('splits a simple comma-separated line', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCsvLine('"Chase, Ja\'Marr",CIN,WR')).toEqual(["Chase, Ja'Marr", 'CIN', 'WR']);
  });

  it('handles escaped double quotes inside a quoted field', () => {
    expect(parseCsvLine('"Say ""hi""",b')).toEqual(['Say "hi"', 'b']);
  });

  it('handles empty fields', () => {
    expect(parseCsvLine('a,,c')).toEqual(['a', '', 'c']);
  });
});

describe('parseCsv', () => {
  it('parses headers and rows into records keyed by header', () => {
    const result = parseCsv("Player,Team,Position\nJosh Allen,BUF,QB\nJa'Marr Chase,CIN,WR");
    expect(result.headers).toEqual(['Player', 'Team', 'Position']);
    expect(result.rows).toEqual([
      { Player: 'Josh Allen', Team: 'BUF', Position: 'QB' },
      { Player: "Ja'Marr Chase", Team: 'CIN', Position: 'WR' },
    ]);
  });

  it('fills missing trailing values with empty string', () => {
    const result = parseCsv('Player,Team,Notes\nJosh Allen,BUF');
    expect(result.rows).toEqual([{ Player: 'Josh Allen', Team: 'BUF', Notes: '' }]);
  });

  it('accepts a BOM, CRLF, escaped quotes, and quoted multiline fields', () => {
    const result = parseCsv('\ufeffPlayer,Notes\r\nJosh Allen,"Line one\r\nHe said ""hello"""\r\n');
    expect(result).toEqual({
      headers: ['Player', 'Notes'],
      rows: [{ Player: 'Josh Allen', Notes: 'Line one\r\nHe said "hello"' }],
    });
  });

  it.each([
    ['an unterminated quoted field', 'Player,Notes\nJosh,"unfinished'],
    ['a UTF-8 byte cap', 'Player\nJosh', { maxBytes: 5 }],
    ['a row cap', 'Player\nJosh\nJoe', { maxRows: 1 }],
    ['a field cap', 'Player\nJoshua', { maxFieldLength: 3 }],
  ])('rejects %s', (_label, contents, options = undefined) => {
    expect(() => parseCsv(contents, options)).toThrow(CsvParseError);
  });

  it('rejects a bare carriage return after a quoted field', () => {
    expect(() => parseCsv('Player\n"Josh"\r')).toThrow(CsvParseError);
  });
});
