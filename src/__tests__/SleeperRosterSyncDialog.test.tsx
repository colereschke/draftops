import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SleeperRosterSyncDialog from '@/components/SleeperRosterSync/SleeperRosterSyncDialog';
import type { LeagueTeam } from '@/types';

const mockPreview = jest.fn();
const mockSaveMapping = jest.fn();
const mockLogCatchUp = jest.fn();
const mockRefresh = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
jest.mock('@/lib/sleeper-roster-actions', () => ({
  previewSleeperRosterSync: (...args: unknown[]) => mockPreview(...args),
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

beforeEach(() => {
  jest.clearAllMocks();
  mockPreview.mockResolvedValue({ ok: true, preview: PREVIEW });
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

  it('shows configuration when roster mappings are not configured', () => {
    render(
      <SleeperRosterSyncDialog
        draftId={4}
        teams={TEAMS}
        initiallyConfigured={false}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByTestId('sleeper-sync-league-id')).toBeInTheDocument();
    expect(screen.getByTestId('sleeper-sync-team-map-1')).toBeInTheDocument();
  });

  it('disables a team already assigned to another Sleeper roster', async () => {
    const user = userEvent.setup();
    render(
      <SleeperRosterSyncDialog
        draftId={4}
        teams={TEAMS}
        initiallyConfigured={false}
        onClose={jest.fn()}
      />,
    );

    await user.selectOptions(screen.getByTestId('sleeper-sync-team-map-1'), '7');
    expect(screen.getByTestId('sleeper-sync-team-option-2-7')).toBeDisabled();
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

  it('reports already reconciled rows and action errors', async () => {
    const user = userEvent.setup();
    mockPreview.mockResolvedValueOnce({ ok: false, code: 'mapping_required' });
    render(
      <SleeperRosterSyncDialog
        draftId={4}
        teams={TEAMS}
        initiallyConfigured={true}
        onClose={jest.fn()}
      />,
    );
    expect(await screen.findByTestId('sleeper-sync-error')).toHaveTextContent('mapping');

    mockPreview.mockResolvedValue({
      ok: true,
      preview: {
        ...PREVIEW,
        actionable: [],
        unresolved: [],
        diagnostics: { ...PREVIEW.diagnostics, alreadyLoggedCount: 2 },
      },
    });
    await user.click(screen.getByTestId('sleeper-sync-retry'));
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
});
