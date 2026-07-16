import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SleeperRosterSyncDialog from '@/components/SleeperRosterSync/SleeperRosterSyncDialog';
import type { LeagueTeam } from '@/types';

const mockPreview = jest.fn();
const mockPreviewMatch = jest.fn();
const mockSaveMapping = jest.fn();
const mockLogCatchUp = jest.fn();
const mockRefresh = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
jest.mock('@/lib/sleeper-roster-actions', () => ({
  previewSleeperRosterSync: (...args: unknown[]) => mockPreview(...args),
  previewSleeperRosterMatch: (...args: unknown[]) => mockPreviewMatch(...args),
  saveSleeperRosterMapping: (...args: unknown[]) => mockSaveMapping(...args),
  logSleeperRosterCatchUp: (...args: unknown[]) => mockLogCatchUp(...args),
}));

const TEAMS: LeagueTeam[] = [
  { id: 7, handle: 'cole', displayName: 'Cole' },
  { id: 8, handle: 'rival', displayName: 'Rival' },
];

const PREVIEW = {
  actionable: [
    {
      playerId: 3,
      sleeperId: 's-3',
      playerName: 'Josh Allen',
      position: 'QB',
      nflTeam: 'BUF',
      targetBudget: 99,
      teamId: 7,
      teamHandle: 'cole',
      teamDisplayName: 'Cole',
      sleeperRosterId: 9,
    },
  ],
  unresolved: [{ sleeperId: 'missing', sleeperRosterId: 9 }],
  diagnostics: { alreadyLoggedCount: 1, unmappedRosterIds: [], duplicateMappedRosterIds: [] },
};

const MATCH_RESPONSE = {
  ok: true as const,
  leagueName: 'Dynasty Warlords',
  rosters: [
    {
      sleeperRosterId: 9,
      ownerDisplayName: 'cole',
      ownerTeamName: null,
      suggestedTeamId: 7,
      matchSource: 'handle' as const,
    },
    {
      sleeperRosterId: 10,
      ownerDisplayName: 'rival',
      ownerTeamName: null,
      suggestedTeamId: null,
      matchSource: 'none' as const,
    },
  ],
  teams: TEAMS,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPreview.mockResolvedValue({ ok: true, preview: PREVIEW });
  mockPreviewMatch.mockResolvedValue(MATCH_RESPONSE);
  mockSaveMapping.mockResolvedValue({ ok: true, preview: PREVIEW });
  mockLogCatchUp.mockResolvedValue({ ok: true, createdPlayerIds: [3], conflicts: [] });
});

describe('SleeperRosterSyncDialog', () => {
  it('previews locked winners and submits only entered prices', async () => {
    const user = userEvent.setup();
    render(
      <SleeperRosterSyncDialog
        draftId={4}
        teams={TEAMS}
        initiallyConfigured={true}
        onClose={jest.fn()}
      />,
    );

    await waitFor(() => expect(mockPreview).toHaveBeenCalledWith({ draftId: 4 }));
    expect(await screen.findByTestId('sleeper-sync-player-3')).toBeInTheDocument();
    expect(screen.getByTestId('sleeper-sync-winner-3')).toHaveTextContent('Cole');
    expect(screen.getByTestId('sleeper-sync-unresolved-sleeper-missing')).toBeInTheDocument();

    await user.type(screen.getByTestId('sleeper-sync-price-3'), '42');
    await user.click(screen.getByTestId('sleeper-sync-submit'));

    await waitFor(() =>
      expect(mockLogCatchUp).toHaveBeenCalledWith({
        draftId: 4,
        entries: [{ playerId: 3, teamId: 7, price: 42 }],
      }),
    );
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows the league ID entry with no roster rows until a sync completes', () => {
    render(
      <SleeperRosterSyncDialog
        draftId={4}
        teams={TEAMS}
        initiallyConfigured={false}
        sleeperLeagueId={null}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByTestId('sleeper-sync-league-id')).toBeInTheDocument();
    expect(screen.getByTestId('sleeper-sync-sync-button')).toBeInTheDocument();
    expect(screen.queryByTestId('sleeper-sync-roster-map-9')).not.toBeInTheDocument();
    expect(mockPreviewMatch).not.toHaveBeenCalled();
  });

  it('auto-syncs and pre-fills auto-matched rosters when the league ID is already known', async () => {
    render(
      <SleeperRosterSyncDialog
        draftId={4}
        teams={TEAMS}
        initiallyConfigured={false}
        sleeperLeagueId="league-1"
        onClose={jest.fn()}
      />,
    );

    await waitFor(() =>
      expect(mockPreviewMatch).toHaveBeenCalledWith({ draftId: 4, leagueId: 'league-1' }),
    );
    expect(await screen.findByTestId('sleeper-sync-roster-map-9')).toHaveValue('7');
    expect(screen.getByTestId('sleeper-sync-auto-matched-9')).toBeInTheDocument();
    expect(screen.getByTestId('sleeper-sync-roster-map-10')).toHaveValue('');
    expect(screen.queryByTestId('sleeper-sync-auto-matched-10')).not.toBeInTheDocument();
  });

  it('syncs on demand and lets the user override a suggested match before saving', async () => {
    const user = userEvent.setup();
    render(
      <SleeperRosterSyncDialog
        draftId={4}
        teams={TEAMS}
        initiallyConfigured={false}
        sleeperLeagueId={null}
        onClose={jest.fn()}
      />,
    );

    await user.type(screen.getByTestId('sleeper-sync-league-id'), 'league-1');
    await user.click(screen.getByTestId('sleeper-sync-sync-button'));
    expect(await screen.findByTestId('sleeper-sync-roster-map-9')).toHaveValue('7');

    await user.selectOptions(screen.getByTestId('sleeper-sync-roster-map-10'), '8');
    await user.click(screen.getByTestId('sleeper-sync-save-mapping'));

    await waitFor(() =>
      expect(mockSaveMapping).toHaveBeenCalledWith({
        draftId: 4,
        leagueId: 'league-1',
        mappings: [
          { teamId: 7, sleeperRosterId: 9 },
          { teamId: 8, sleeperRosterId: 10 },
        ],
      }),
    );
  });

  it('disables a team already assigned to another Sleeper roster', async () => {
    render(
      <SleeperRosterSyncDialog
        draftId={4}
        teams={TEAMS}
        initiallyConfigured={false}
        sleeperLeagueId="league-1"
        onClose={jest.fn()}
      />,
    );

    await screen.findByTestId('sleeper-sync-roster-map-9');
    // Roster 9 auto-matches to team 7 on load; team 7 must now be disabled on roster 10's list.
    expect(screen.getByTestId('sleeper-sync-roster-option-10-7')).toBeDisabled();
  });

  it('omits blank prices and shows an inline error for invalid prices', async () => {
    const user = userEvent.setup();
    render(
      <SleeperRosterSyncDialog
        draftId={4}
        teams={TEAMS}
        initiallyConfigured={true}
        onClose={jest.fn()}
      />,
    );
    await screen.findByTestId('sleeper-sync-price-3');

    await user.type(screen.getByTestId('sleeper-sync-price-3'), '4.5');
    await user.click(screen.getByTestId('sleeper-sync-submit'));
    expect(screen.getByTestId('sleeper-sync-error')).toHaveTextContent('whole-dollar');
    expect(mockLogCatchUp).not.toHaveBeenCalled();
  });

  it('routes a mapping_required preview response to the configuration view for repair', async () => {
    mockPreview.mockResolvedValueOnce({ ok: false, code: 'mapping_required' });
    render(
      <SleeperRosterSyncDialog
        draftId={4}
        teams={TEAMS}
        initiallyConfigured={true}
        sleeperLeagueId="league-1"
        onClose={jest.fn()}
      />,
    );
    expect(await screen.findByTestId('sleeper-sync-error')).toHaveTextContent('mapping');
    expect(screen.getByTestId('sleeper-sync-league-id')).toBeInTheDocument();
    expect(await screen.findByTestId('sleeper-sync-roster-map-9')).toBeInTheDocument();
    expect(screen.queryByTestId('sleeper-sync-retry')).not.toBeInTheDocument();
  });

  it('reports already reconciled rows from an initial preview', async () => {
    mockPreview.mockResolvedValueOnce({
      ok: true,
      preview: {
        ...PREVIEW,
        actionable: [],
        unresolved: [],
        diagnostics: { ...PREVIEW.diagnostics, alreadyLoggedCount: 2 },
      },
    });
    render(
      <SleeperRosterSyncDialog
        draftId={4}
        teams={TEAMS}
        initiallyConfigured={true}
        onClose={jest.fn()}
      />,
    );
    expect(await screen.findByTestId('sleeper-sync-already-reconciled')).toHaveTextContent('2');
  });

  it.each(['sleeper_error', 'mapping_required'] as const)('explains %s responses', async (code) => {
    mockPreview.mockResolvedValueOnce({ ok: false, code });
    render(
      <SleeperRosterSyncDialog
        draftId={4}
        teams={TEAMS}
        initiallyConfigured={true}
        onClose={jest.fn()}
      />,
    );
    expect(await screen.findByTestId('sleeper-sync-error')).toHaveTextContent(
      code === 'sleeper_error' ? 'Sleeper' : 'mapping',
    );
  });

  it('refreshes after a batch submit where every row conflicts and nothing is created', async () => {
    const user = userEvent.setup();
    mockLogCatchUp.mockResolvedValueOnce({
      ok: true,
      createdPlayerIds: [],
      conflicts: [{ playerId: 3, reason: 'already_logged' }],
    });
    render(
      <SleeperRosterSyncDialog
        draftId={4}
        teams={TEAMS}
        initiallyConfigured={true}
        onClose={jest.fn()}
      />,
    );
    await screen.findByTestId('sleeper-sync-price-3');
    await user.type(screen.getByTestId('sleeper-sync-price-3'), '42');
    await user.click(screen.getByTestId('sleeper-sync-submit'));

    expect(await screen.findByTestId('sleeper-sync-conflict-3')).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('omits rows without an entered price from the submitted batch', async () => {
    const user = userEvent.setup();
    const twoRowPreview = {
      ...PREVIEW,
      actionable: [
        PREVIEW.actionable[0],
        {
          playerId: 5,
          sleeperId: 's-5',
          playerName: 'Justin Jefferson',
          position: 'WR',
          nflTeam: 'MIN',
          targetBudget: 120,
          teamId: 8,
          teamHandle: 'rival',
          teamDisplayName: 'Rival',
          sleeperRosterId: 10,
        },
      ],
    };
    mockPreview.mockResolvedValueOnce({ ok: true, preview: twoRowPreview });
    render(
      <SleeperRosterSyncDialog
        draftId={4}
        teams={TEAMS}
        initiallyConfigured={true}
        onClose={jest.fn()}
      />,
    );
    await screen.findByTestId('sleeper-sync-price-3');
    await screen.findByTestId('sleeper-sync-price-5');

    await user.type(screen.getByTestId('sleeper-sync-price-3'), '42');
    await user.click(screen.getByTestId('sleeper-sync-submit'));

    await waitFor(() =>
      expect(mockLogCatchUp).toHaveBeenCalledWith({
        draftId: 4,
        entries: [{ playerId: 3, teamId: 7, price: 42 }],
      }),
    );
  });
});
