import { computeTeamStats } from '@/lib/budget';

const makeTeam = (overrides: {
  id?: number;
  handle?: string;
  displayName?: string | null;
  budget?: number;
  results?: { price: number; position: string }[];
}) => ({
  id: 1,
  handle: 'testteam',
  displayName: null,
  budget: 1000,
  results: [],
  ...overrides,
});

describe('computeTeamStats', () => {
  it('computes zero spent for a team with no results', () => {
    const [stat] = computeTeamStats([makeTeam({})], 30);
    expect(stat.spent).toBe(0);
    expect(stat.remaining).toBe(1000);
    expect(stat.rosterCount).toBe(0);
    expect(stat.rosterRemaining).toBe(30);
    expect(stat.buyingPower).toBe(970); // 1000 - 30
  });

  it('uses the provided rosterSize for buying power', () => {
    const [stat] = computeTeamStats([makeTeam({})], 25);
    expect(stat.rosterRemaining).toBe(25);
    expect(stat.buyingPower).toBe(975); // 1000 - 25
  });

  it('correctly computes spent from results', () => {
    const [stat] = computeTeamStats(
      [
        makeTeam({
          results: [
            { price: 200, position: 'QB' },
            { price: 150, position: 'RB' },
            { price: 75, position: 'WR' },
          ],
        }),
      ],
      30,
    );
    expect(stat.spent).toBe(425);
    expect(stat.remaining).toBe(575);
    expect(stat.rosterCount).toBe(3);
    expect(stat.rosterRemaining).toBe(27);
    expect(stat.buyingPower).toBe(548); // 575 - 27
  });

  it('does not count future pick assets as roster spots', () => {
    const [stat] = computeTeamStats(
      [
        makeTeam({
          results: [
            { price: 109, position: 'PKG' },
            { price: 75, position: 'PICK' },
            { price: 200, position: 'QB' },
          ],
        }),
      ],
      30,
    );

    expect(stat.spent).toBe(384);
    expect(stat.rosterCount).toBe(1);
    expect(stat.rosterRemaining).toBe(29);
    expect(stat.buyingPower).toBe(587);
  });

  it('sorts by buyingPower descending', () => {
    const teams = computeTeamStats(
      [
        makeTeam({ id: 1, handle: 'low', results: [{ price: 900, position: 'QB' }] }),
        makeTeam({ id: 2, handle: 'high', results: [] }),
        makeTeam({ id: 3, handle: 'mid', results: [{ price: 500, position: 'QB' }] }),
      ],
      30,
    );
    expect(teams[0].handle).toBe('high');
    expect(teams[1].handle).toBe('mid');
    expect(teams[2].handle).toBe('low');
  });

  it('maps displayName and handle correctly', () => {
    const [stat] = computeTeamStats([makeTeam({ handle: 'coreschke', displayName: 'Cole' })], 30);
    expect(stat.handle).toBe('coreschke');
    expect(stat.displayName).toBe('Cole');
  });

  it('produces negative buyingPower when remaining cannot cover remaining spots', () => {
    // Team with $0 left but 5 spots to fill → buyingPower = 0 - 5 = -5
    const [stat] = computeTeamStats(
      [
        makeTeam({ results: Array(25).fill({ price: 40, position: 'WR' }) }), // 25 * 40 = 1000 spent
      ],
      30,
    );
    expect(stat.buyingPower).toBe(stat.remaining - stat.rosterRemaining);
    expect(stat.buyingPower).toBeLessThan(0);
  });
});
