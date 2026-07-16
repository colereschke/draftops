import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewDraftPage from '@/app/drafts/new/page';
import { createDraft } from '@/lib/actions';
import type { SleeperImportResult } from '@/lib/sleeper';
import { DEFAULT_SCORING_SETTINGS } from '@/types';

jest.mock('@/lib/actions', () => ({
  createDraft: jest.fn(),
}));

const mockImportFromSleeper = jest.fn();

jest.mock('@/lib/sleeper-actions', () => ({
  importFromSleeper: (...args: unknown[]) => mockImportFromSleeper(...args),
}));

const mockGetRankingSummary = jest.fn();
jest.mock('@/lib/rankings-actions', () => ({
  getRankingSummary: (...args: unknown[]) => mockGetRankingSummary(...args),
}));

beforeEach(() => {
  mockGetRankingSummary.mockResolvedValue(null);
});

const MOCK_IMPORT_RESULT: SleeperImportResult = {
  leagueId: '1360707683916734464',
  leagueName: 'Dynasty Warlords',
  teamCount: 12,
  rosterSize: 30,
  startingLineup: [
    'QB',
    'RB',
    'WR',
    'WR',
    'TE',
    'FLEX',
    'SUPER_FLEX',
    'FLEX',
    'FLEX',
    'SUPER_FLEX',
  ],
  scoringSettings: { ...DEFAULT_SCORING_SETTINGS },
  teams: Array.from({ length: 12 }, (_, i) => ({
    handle: `team-${i + 1}`,
    displayName: `Team ${i + 1}`,
    sleeperRosterId: i + 1,
  })),
  ownerIndex: 0,
};

describe('NewDraftPage — roster settings and lineup', () => {
  it('renders the roster size input with default 30', () => {
    render(<NewDraftPage />);
    const input = screen.getByTestId<HTMLInputElement>('roster-size-input');
    expect(input.value).toBe('30');
  });

  it('renders target roster inputs for all four positions', () => {
    render(<NewDraftPage />);
    expect(screen.getByTestId<HTMLInputElement>('target-roster-QB').value).toBe('4');
    expect(screen.getByTestId<HTMLInputElement>('target-roster-RB').value).toBe('9');
    expect(screen.getByTestId<HTMLInputElement>('target-roster-WR').value).toBe('11');
    expect(screen.getByTestId<HTMLInputElement>('target-roster-TE').value).toBe('3');
  });

  it('renders 10 starting lineup slots by default', () => {
    render(<NewDraftPage />);
    const slots = screen.getAllByTestId(/^lineup-slot-\d+$/);
    expect(slots).toHaveLength(10);
  });

  it('first slot defaults to QB and last slot defaults to SUPER_FLEX', () => {
    render(<NewDraftPage />);
    expect(screen.getByTestId<HTMLSelectElement>('lineup-slot-0').value).toBe('QB');
    expect(screen.getByTestId<HTMLSelectElement>('lineup-slot-9').value).toBe('SUPER_FLEX');
  });

  it('adds a FLEX slot when Add slot is clicked, sorted into the FLEX group', () => {
    render(<NewDraftPage />);
    fireEvent.click(screen.getByTestId('add-lineup-slot'));
    const slots = screen.getAllByTestId(/^lineup-slot-\d+$/);
    expect(slots).toHaveLength(11);
    expect(screen.getByTestId<HTMLSelectElement>('lineup-slot-9').value).toBe('FLEX');
    expect(screen.getByTestId<HTMLSelectElement>('lineup-slot-10').value).toBe('SUPER_FLEX');
  });

  it('removes the correct slot when × is clicked', () => {
    render(<NewDraftPage />);
    // Remove slot 0 (QB)
    fireEvent.click(screen.getByTestId('remove-lineup-slot-0'));
    const slots = screen.getAllByTestId(/^lineup-slot-\d+$/);
    expect(slots).toHaveLength(9);
    // Slot 0 should now be what was previously slot 1 (RB)
    expect(screen.getByTestId<HTMLSelectElement>('lineup-slot-0').value).toBe('RB');
  });

  it('changes slot type and re-sorts the lineup into canonical order', () => {
    render(<NewDraftPage />);
    fireEvent.change(screen.getByTestId('lineup-slot-0'), { target: { value: 'SUPER_FLEX' } });
    const slots = screen.getAllByTestId<HTMLSelectElement>(/^lineup-slot-\d+$/);
    expect(slots.map((s) => s.value)).toEqual([
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'FLEX',
      'FLEX',
      'FLEX',
      'SUPER_FLEX',
      'SUPER_FLEX',
    ]);
  });

  it('groups a newly-added slot with same-position slots once its type is chosen', () => {
    render(<NewDraftPage />);
    fireEvent.click(screen.getByTestId('add-lineup-slot')); // appends FLEX, sorts to index 9
    fireEvent.change(screen.getByTestId('lineup-slot-9'), { target: { value: 'RB' } });
    const slots = screen.getAllByTestId<HTMLSelectElement>(/^lineup-slot-\d+$/);
    // Default lineup's RBs are at indices 1-2; the newly-added RB should land at index 3,
    // immediately after them — not at the end.
    expect(slots.map((s) => s.value)).toEqual([
      'QB',
      'RB',
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'FLEX',
      'FLEX',
      'FLEX',
      'SUPER_FLEX',
    ]);
  });

  it('allows clearing the roster size field to empty while retyping', () => {
    render(<NewDraftPage />);
    const input = screen.getByTestId<HTMLInputElement>('roster-size-input');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '25' } });
    expect(input.value).toBe('25');
  });

  it('allows clearing the team count field to empty while retyping', () => {
    render(<NewDraftPage />);
    const input = screen.getByTestId<HTMLInputElement>('team-count-input');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '8' } });
    expect(input.value).toBe('8');
  });

  it('allows clearing the budget field to empty while retyping', () => {
    render(<NewDraftPage />);
    const input = screen.getByTestId<HTMLInputElement>('budget-input');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '500' } });
    expect(input.value).toBe('500');
  });

  it('allows clearing a target roster field to empty while retyping', () => {
    render(<NewDraftPage />);
    const input = screen.getByTestId<HTMLInputElement>('target-roster-QB');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '6' } });
    expect(input.value).toBe('6');
  });

  it('blocks submit when a required numeric field is blank', () => {
    render(<NewDraftPage />);
    fireEvent.change(screen.getByTestId('draft-name-input'), {
      target: { value: 'Test Draft' },
    });
    fireEvent.change(screen.getByTestId('budget-input'), { target: { value: '' } });

    fireEvent.submit(screen.getByTestId('new-draft-form'));

    expect(screen.getByText(/Budget per team is required/i)).toBeInTheDocument();
    expect(createDraft).not.toHaveBeenCalled();
  });

  it('resizes the team roster table when team count changes', () => {
    render(<NewDraftPage />);
    const input = screen.getByTestId<HTMLInputElement>('team-count-input');
    fireEvent.change(input, { target: { value: '14' } });
    // Team handle inputs render as plain text inputs inside the roster table;
    // there are 14 team rows once team count is 14, plus the fixed-count
    // Yds/point etc. number inputs elsewhere — assert via the roster-size
    // default-value pattern already used above instead of counting all inputs.
    expect(screen.getAllByDisplayValue(/^team-\d+$/)).toHaveLength(14);
  });
});

describe('NewDraftPage — scoring settings', () => {
  it('renders passing yards per point input with default 25', () => {
    render(<NewDraftPage />);
    const input = screen.getByTestId<HTMLInputElement>('scoring-passYdsPerPoint');
    expect(input.value).toBe('25');
  });

  it('renders passing TD input with default 4', () => {
    render(<NewDraftPage />);
    const input = screen.getByTestId<HTMLInputElement>('scoring-passTD');
    expect(input.value).toBe('4');
  });

  it('renders all PPR inputs defaulting to 1', () => {
    render(<NewDraftPage />);
    expect(screen.getByTestId<HTMLInputElement>('scoring-pprRB').value).toBe('1');
    expect(screen.getByTestId<HTMLInputElement>('scoring-pprWR').value).toBe('1');
    expect(screen.getByTestId<HTMLInputElement>('scoring-pprTE').value).toBe('1');
  });

  it('allows clearing a scoring field to empty while retyping', () => {
    render(<NewDraftPage />);
    const input = screen.getByTestId<HTMLInputElement>('scoring-passYdsPerPoint');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '20' } });
    expect(input.value).toBe('20');
  });

  it('allows a decimal scoring field to be edited without snapping back', () => {
    render(<NewDraftPage />);
    const input = screen.getByTestId<HTMLInputElement>('scoring-pprTE');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '1.5' } });
    expect(input.value).toBe('1.5');
  });
});

describe('NewDraftPage — lineup validation', () => {
  it('shows error when submitting with no QB or SUPER_FLEX slot', () => {
    render(<NewDraftPage />);
    // Change slot 0 from QB to RB
    fireEvent.change(screen.getByTestId('lineup-slot-0'), { target: { value: 'RB' } });
    // Change slot 9 from SUPER_FLEX to FLEX
    fireEvent.change(screen.getByTestId('lineup-slot-9'), { target: { value: 'FLEX' } });
    // Provide draft name to pass earlier validations
    fireEvent.change(screen.getByTestId('draft-name-input'), {
      target: { value: 'Test Draft' },
    });
    fireEvent.submit(screen.getByTestId('new-draft-form'));
    expect(screen.getByText(/at least one QB or SUPER_FLEX/i)).toBeInTheDocument();
  });
});

describe('NewDraftPage — Sleeper import banner', () => {
  beforeEach(() => {
    mockImportFromSleeper.mockResolvedValue({ ok: true, data: MOCK_IMPORT_RESULT });
  });

  it('renders the league ID input and username input', () => {
    render(<NewDraftPage />);
    expect(screen.getByTestId('sleeper-league-id')).toBeInTheDocument();
    expect(screen.getByTestId('sleeper-owner-username')).toBeInTheDocument();
  });

  it('import button is disabled when league ID is empty', () => {
    render(<NewDraftPage />);
    expect(screen.getByTestId<HTMLButtonElement>('sleeper-import-button').disabled).toBe(true);
  });

  it('import button is enabled after typing a league ID', () => {
    render(<NewDraftPage />);
    fireEvent.change(screen.getByTestId('sleeper-league-id'), {
      target: { value: '1360707683916734464' },
    });
    expect(screen.getByTestId<HTMLButtonElement>('sleeper-import-button').disabled).toBe(false);
  });

  it('calls importFromSleeper with entered league ID on button click', async () => {
    render(<NewDraftPage />);
    fireEvent.change(screen.getByTestId('sleeper-league-id'), {
      target: { value: '1360707683916734464' },
    });
    fireEvent.click(screen.getByTestId('sleeper-import-button'));
    await waitFor(() =>
      expect(mockImportFromSleeper).toHaveBeenCalledWith('1360707683916734464', undefined),
    );
  });

  it('shows confirm message after successful import', async () => {
    render(<NewDraftPage />);
    fireEvent.change(screen.getByTestId('sleeper-league-id'), {
      target: { value: '1360707683916734464' },
    });
    fireEvent.click(screen.getByTestId('sleeper-import-button'));
    await waitFor(() => expect(screen.getByTestId('sleeper-import-confirm')).toBeInTheDocument());
  });

  it('shows username warning when ownerIndex is null and username was entered', async () => {
    mockImportFromSleeper.mockResolvedValueOnce({
      ok: true,
      data: { ...MOCK_IMPORT_RESULT, ownerIndex: null },
    });
    render(<NewDraftPage />);
    fireEvent.change(screen.getByTestId('sleeper-league-id'), {
      target: { value: '1360707683916734464' },
    });
    fireEvent.change(screen.getByTestId('sleeper-owner-username'), {
      target: { value: 'coreschke' },
    });
    fireEvent.click(screen.getByTestId('sleeper-import-button'));
    await waitFor(() => expect(screen.getByTestId('sleeper-import-warning')).toBeInTheDocument());
  });

  it('shows error message when importFromSleeper returns ok:false', async () => {
    mockImportFromSleeper.mockResolvedValueOnce({
      ok: false,
      error: 'League not found. Check your Sleeper league ID.',
    });
    render(<NewDraftPage />);
    fireEvent.change(screen.getByTestId('sleeper-league-id'), {
      target: { value: 'bad-id' },
    });
    fireEvent.click(screen.getByTestId('sleeper-import-button'));
    await waitFor(() => expect(screen.getByTestId('sleeper-import-error')).toBeInTheDocument());
  });

  it('updates roster size and team count from non-default import values', async () => {
    mockImportFromSleeper.mockResolvedValueOnce({
      ok: true,
      data: { ...MOCK_IMPORT_RESULT, rosterSize: 25, teamCount: 8 },
    });
    render(<NewDraftPage />);
    fireEvent.change(screen.getByTestId('sleeper-league-id'), {
      target: { value: '1360707683916734464' },
    });
    fireEvent.click(screen.getByTestId('sleeper-import-button'));
    await waitFor(() => {
      const rosterSizeInput = screen.getByTestId<HTMLInputElement>('roster-size-input');
      expect(rosterSizeInput.value).toBe('25');
    });
  });

  it('populates the draft name from the imported league name', async () => {
    render(<NewDraftPage />);
    fireEvent.change(screen.getByTestId('sleeper-league-id'), {
      target: { value: '1360707683916734464' },
    });
    fireEvent.click(screen.getByTestId('sleeper-import-button'));
    await waitFor(() => {
      expect(screen.getByTestId<HTMLInputElement>('draft-name-input').value).toBe(
        'Dynasty Warlords',
      );
    });
  });

  it('submits the imported Sleeper league and roster IDs', async () => {
    render(<NewDraftPage />);
    fireEvent.change(screen.getByTestId('sleeper-league-id'), {
      target: { value: '1360707683916734464' },
    });
    fireEvent.click(screen.getByTestId('sleeper-import-button'));
    await waitFor(() => expect(screen.getByTestId('sleeper-import-confirm')).toBeInTheDocument());

    fireEvent.submit(screen.getByTestId('new-draft-form'));

    await waitFor(() =>
      expect(createDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          sleeperLeagueId: '1360707683916734464',
          teams: expect.arrayContaining([expect.objectContaining({ sleeperRosterId: 1 })]),
        }),
      ),
    );
  });

  it('clears imported metadata when the league ID changes', async () => {
    render(<NewDraftPage />);
    fireEvent.change(screen.getByTestId('sleeper-league-id'), {
      target: { value: '1360707683916734464' },
    });
    fireEvent.click(screen.getByTestId('sleeper-import-button'));
    await waitFor(() => expect(screen.getByTestId('sleeper-import-confirm')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('sleeper-league-id'), {
      target: { value: 'new-league-id' },
    });
    fireEvent.submit(screen.getByTestId('new-draft-form'));

    await waitFor(() =>
      expect(createDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          sleeperLeagueId: undefined,
          teams: expect.not.arrayContaining([expect.objectContaining({ sleeperRosterId: 1 })]),
        }),
      ),
    );
  });

  it('accepts off-grid imported scoring values without step validation (step="any")', async () => {
    // Sleeper pass_yd of 0.05 → 20 yds/pt, which a step={5} input rejected on submit.
    mockImportFromSleeper.mockResolvedValueOnce({
      ok: true,
      data: {
        ...MOCK_IMPORT_RESULT,
        scoringSettings: { ...DEFAULT_SCORING_SETTINGS, passYdsPerPoint: 20 },
      },
    });
    render(<NewDraftPage />);
    fireEvent.change(screen.getByTestId('sleeper-league-id'), {
      target: { value: '1360707683916734464' },
    });
    fireEvent.click(screen.getByTestId('sleeper-import-button'));
    await waitFor(() => {
      const input = screen.getByTestId<HTMLInputElement>('scoring-passYdsPerPoint');
      expect(input.value).toBe('20');
      expect(input.step).toBe('any');
    });
  });
});

describe('player pool source', () => {
  it('does not show a source selector when the user has no custom ranking set', async () => {
    mockGetRankingSummary.mockResolvedValue(null);
    render(<NewDraftPage />);
    await waitFor(() => {
      expect(mockGetRankingSummary).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('player-source-custom')).not.toBeInTheDocument();
  });

  it('shows a source selector when a custom ranking set exists, defaulting to ETR', async () => {
    mockGetRankingSummary.mockResolvedValue({
      fileName: 'my_rankings.csv',
      uploadedAt: new Date('2026-07-01T00:00:00.000Z'),
      totalCount: 267,
      matchedCount: 260,
      unmatchedCount: 7,
    });
    render(<NewDraftPage />);

    expect(await screen.findByTestId('player-source-custom')).toBeInTheDocument();
    expect(screen.getByTestId('player-source-etr')).toBeChecked();
  });

  it('passes playerSource: custom to createDraft when selected', async () => {
    mockGetRankingSummary.mockResolvedValue({
      fileName: 'my_rankings.csv',
      uploadedAt: new Date('2026-07-01T00:00:00.000Z'),
      totalCount: 267,
      matchedCount: 260,
      unmatchedCount: 7,
    });
    const user = userEvent.setup();
    render(<NewDraftPage />);

    await user.click(await screen.findByTestId('player-source-custom'));
    fireEvent.change(screen.getByTestId('draft-name-input'), { target: { value: 'Test Draft' } });
    fireEvent.submit(screen.getByTestId('new-draft-form'));

    await waitFor(() => {
      expect(createDraft).toHaveBeenCalledWith(expect.objectContaining({ playerSource: 'custom' }));
    });
  });

  it('shows a visible fallback when getRankingSummary rejects, without blocking the form', async () => {
    mockGetRankingSummary.mockRejectedValue(new Error('Unauthorized'));
    render(<NewDraftPage />);

    expect(await screen.findByTestId('ranking-summary-error')).toBeInTheDocument();
    expect(screen.queryByTestId('player-source-custom')).not.toBeInTheDocument();
  });
});
