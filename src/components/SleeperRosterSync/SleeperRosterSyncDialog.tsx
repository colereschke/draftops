'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LeagueTeam, Position } from '@/types';
import type { SleeperRosterCandidate } from '@/lib/sleeper';
import {
  logSleeperRosterCatchUp,
  previewSleeperRosterMatch,
  previewSleeperRosterSync,
  saveSleeperRosterMapping,
} from '@/lib/sleeper-roster-actions';
import type { SleeperRosterPreview } from '@/lib/sleeperRosterSync';
import { POS_COLORS } from '@/lib/posColors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SleeperRosterSyncDialogProps {
  draftId: number;
  teams: LeagueTeam[];
  initiallyConfigured: boolean;
  sleeperLeagueId?: string | null;
  onClose: () => void;
}

type SyncView = 'loading' | 'configuration' | 'preview' | 'error';

function responseMessage(code: string): string {
  switch (code) {
    case 'mapping_required':
      return 'Sleeper roster mapping needs repair before this roster can be reconciled.';
    case 'configuration_required':
      return 'Add a Sleeper league ID and map each roster before continuing.';
    case 'sleeper_error':
      return 'Sleeper could not be reached. Try again in a moment.';
    case 'invalid_league_id':
      return 'Enter a Sleeper league ID.';
    case 'invalid_input':
      return 'Enter a whole-dollar price greater than zero.';
    case 'not_found':
      return 'This draft is no longer available.';
    default:
      return 'Unable to reconcile this roster. Please try again.';
  }
}

export default function SleeperRosterSyncDialog({
  draftId,
  teams,
  initiallyConfigured,
  sleeperLeagueId = null,
  onClose,
}: SleeperRosterSyncDialogProps) {
  const router = useRouter();
  const [view, setView] = useState<SyncView>(initiallyConfigured ? 'loading' : 'configuration');
  const [preview, setPreview] = useState<SleeperRosterPreview | null>(null);
  const [error, setError] = useState<string>('');
  const [leagueId, setLeagueId] = useState<string>(sleeperLeagueId ?? '');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [matchCandidates, setMatchCandidates] = useState<SleeperRosterCandidate[] | null>(null);
  const [matchTeams, setMatchTeams] = useState<LeagueTeam[]>(teams);
  const [teamMappings, setTeamMappings] = useState<Record<number, string>>({});
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [conflicts, setConflicts] = useState<Map<number, string>>(new Map());
  const autoSyncedRef = useRef(false);

  async function loadPreview() {
    setView('loading');
    setError('');
    try {
      const response = await previewSleeperRosterSync({ draftId });
      if (!response.ok) {
        setError(responseMessage(response.code));
        setView(
          response.code === 'configuration_required' || response.code === 'mapping_required'
            ? 'configuration'
            : 'error',
        );
        return;
      }
      setPreview(response.preview);
      setView('preview');
    } catch {
      setError('Unable to load the Sleeper roster preview. Please try again.');
      setView('error');
    }
  }

  useEffect(() => {
    if (!initiallyConfigured) return;
    async function fetchInitialPreview() {
      try {
        const response = await previewSleeperRosterSync({ draftId });
        if (!response.ok) {
          setError(responseMessage(response.code));
          setView(
            response.code === 'configuration_required' || response.code === 'mapping_required'
              ? 'configuration'
              : 'error',
          );
          return;
        }
        setPreview(response.preview);
        setView('preview');
      } catch {
        setError('Unable to load the Sleeper roster preview. Please try again.');
        setView('error');
      }
    }
    void fetchInitialPreview();
  }, [draftId, initiallyConfigured]);

  const syncLeague = useCallback(
    async (idOverride?: string) => {
      const targetLeagueId = (idOverride ?? leagueId).trim();
      if (!targetLeagueId) {
        setError(responseMessage('invalid_league_id'));
        return;
      }
      setIsSyncing(true);
      setError('');
      try {
        const response = await previewSleeperRosterMatch({ draftId, leagueId: targetLeagueId });
        if (!response.ok) {
          setError(responseMessage(response.code));
          setIsSyncing(false);
          return;
        }
        setMatchCandidates(response.rosters);
        setMatchTeams(response.teams);
        setTeamMappings((current) => {
          const next = { ...current };
          for (const candidate of response.rosters) {
            if (
              next[candidate.sleeperRosterId] === undefined &&
              candidate.suggestedTeamId !== null
            ) {
              next[candidate.sleeperRosterId] = String(candidate.suggestedTeamId);
            }
          }
          return next;
        });
        setIsSyncing(false);
      } catch {
        setError('Unable to sync with Sleeper. Please try again.');
        setIsSyncing(false);
      }
    },
    [draftId, leagueId],
  );

  // Auto-sync only from a league ID the draft already had saved (the `sleeperLeagueId` prop) —
  // never from the user still typing into the league ID field, which would fire on every
  // keystroke's first non-empty value.
  useEffect(() => {
    if (view !== 'configuration') return;
    if (autoSyncedRef.current) return;
    if (!sleeperLeagueId?.trim()) return;
    autoSyncedRef.current = true;
    // queueMicrotask: syncLeague sets state before its first await; calling it directly
    // here trips react-hooks/set-state-in-effect.
    queueMicrotask(() => void syncLeague(sleeperLeagueId));
  }, [view, sleeperLeagueId, syncLeague]);

  function updateMapping(rosterId: number, teamId: string) {
    setTeamMappings((current) => ({ ...current, [rosterId]: teamId }));
  }

  async function saveConfiguration() {
    if (!matchCandidates) {
      setError('Sync with Sleeper before saving a mapping.');
      return;
    }
    const mappings = matchCandidates.flatMap((candidate) => {
      const teamId = Number(teamMappings[candidate.sleeperRosterId]);
      return Number.isSafeInteger(teamId) && teamId > 0
        ? [{ teamId, sleeperRosterId: candidate.sleeperRosterId }]
        : [];
    });
    if (!leagueId.trim() || mappings.length !== matchCandidates.length) {
      setError('Enter a league ID and assign every Sleeper roster to one team.');
      return;
    }
    if (new Set(mappings.map((mapping) => mapping.teamId)).size !== mappings.length) {
      setError('Each draft team can only be mapped to one Sleeper roster.');
      return;
    }

    setView('loading');
    setError('');
    try {
      const response = await saveSleeperRosterMapping({
        draftId,
        leagueId: leagueId.trim(),
        mappings,
      });
      if (!response.ok) {
        setError(responseMessage(response.code));
        setView('configuration');
        return;
      }
      setPreview(response.preview);
      setView('preview');
    } catch {
      setError('Unable to save the Sleeper roster mapping. Please try again.');
      setView('configuration');
    }
  }

  async function submitCatchUp() {
    if (!preview) return;
    const entries = preview.actionable.flatMap((row) => {
      const rawPrice = prices[row.playerId]?.trim() ?? '';
      if (!rawPrice) return [];
      const price = Number(rawPrice);
      return Number.isInteger(price) && price > 0
        ? [{ playerId: row.playerId, teamId: row.teamId, price }]
        : [];
    });
    const hasInvalidPrice = preview.actionable.some((row) => {
      const rawPrice = prices[row.playerId]?.trim() ?? '';
      return rawPrice !== '' && (!Number.isInteger(Number(rawPrice)) || Number(rawPrice) <= 0);
    });
    if (hasInvalidPrice) {
      setError('Enter a whole-dollar price greater than zero for each filled row.');
      return;
    }
    if (entries.length === 0) {
      setError('Enter at least one price to import. Blank rows are left untouched.');
      return;
    }

    setError('');
    setConflicts(new Map());
    try {
      const response = await logSleeperRosterCatchUp({ draftId, entries });
      if (!response.ok) {
        setError(responseMessage(response.code));
        return;
      }
      setConflicts(
        new Map(response.conflicts.map((conflict) => [conflict.playerId, conflict.reason])),
      );
      router.refresh();
    } catch {
      setError('Unable to save the catch-up results. Please try again.');
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>Sleeper roster catch-up</DialogTitle>
        {view === 'loading' && <p data-testid="sleeper-sync-loading">Loading Sleeper roster…</p>}

        {view === 'configuration' && (
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Map each Sleeper roster before importing completed auctions.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="sleeper-sync-league-id">Sleeper league ID</Label>
              <div className="flex gap-2">
                <Input
                  id="sleeper-sync-league-id"
                  data-testid="sleeper-sync-league-id"
                  value={leagueId}
                  onChange={(event) => setLeagueId(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  data-testid="sleeper-sync-sync-button"
                  onClick={() => syncLeague()}
                  disabled={isSyncing}
                >
                  {isSyncing ? 'Syncing…' : 'Sync league'}
                </Button>
              </div>
            </div>
            {matchCandidates?.map((candidate) => {
              const rosterId = candidate.sleeperRosterId;
              const label = candidate.ownerDisplayName
                ? candidate.ownerTeamName
                  ? `${candidate.ownerDisplayName} (${candidate.ownerTeamName})`
                  : candidate.ownerDisplayName
                : `Unclaimed roster ${rosterId}`;
              return (
                <div key={rosterId} className="space-y-1.5">
                  <Label htmlFor={`sleeper-sync-roster-map-${rosterId}`}>
                    {label}
                    {candidate.matchSource !== 'none' && (
                      <span
                        data-testid={`sleeper-sync-auto-matched-${rosterId}`}
                        className="ml-2 text-xs text-muted-foreground"
                      >
                        Auto-matched
                      </span>
                    )}
                  </Label>
                  <select
                    id={`sleeper-sync-roster-map-${rosterId}`}
                    data-testid={`sleeper-sync-roster-map-${rosterId}`}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={teamMappings[rosterId] ?? ''}
                    onChange={(event) => updateMapping(rosterId, event.target.value)}
                  >
                    <option value="">Select a draft team</option>
                    {matchTeams.map((team) => {
                      const selectedElsewhere = Object.entries(teamMappings).some(
                        ([mappedRosterId, mappedTeamId]) =>
                          Number(mappedRosterId) !== rosterId && mappedTeamId === String(team.id),
                      );
                      return (
                        <option
                          key={team.id}
                          value={team.id}
                          disabled={selectedElsewhere}
                          data-testid={`sleeper-sync-roster-option-${rosterId}-${team.id}`}
                        >
                          {team.displayName ?? team.handle}
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            })}
            {matchCandidates && (
              <Button data-testid="sleeper-sync-save-mapping" onClick={saveConfiguration}>
                Save mapping and preview
              </Button>
            )}
          </div>
        )}

        {view === 'preview' && preview && (
          <div className="space-y-4">
            {preview.actionable.map((row) => {
              const posColor = POS_COLORS[row.position as Position] ?? POS_COLORS.PICK;
              return (
                <div
                  key={row.playerId}
                  data-testid={`sleeper-sync-player-${row.playerId}`}
                  className="rounded-md border p-3"
                  style={{ borderLeft: `3px solid ${posColor.accent}` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{row.playerName}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.position} · {row.nflTeam}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Target ${row.targetBudget}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div
                        data-testid={`sleeper-sync-winner-${row.playerId}`}
                        className="text-sm font-medium"
                      >
                        {row.teamHandle}
                      </div>
                      <div className="flex items-center gap-1">
                        <Label htmlFor={`sleeper-sync-price-${row.playerId}`} className="sr-only">
                          Winning price
                        </Label>
                        <span className="text-xs text-muted-foreground">$</span>
                        <Input
                          id={`sleeper-sync-price-${row.playerId}`}
                          data-testid={`sleeper-sync-price-${row.playerId}`}
                          type="number"
                          min={1}
                          step={1}
                          className="h-8 w-20 text-right text-sm"
                          value={prices[row.playerId] ?? ''}
                          onChange={(event) =>
                            setPrices((current) => ({
                              ...current,
                              [row.playerId]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                  {conflicts.has(row.playerId) && (
                    <p
                      data-testid={`sleeper-sync-conflict-${row.playerId}`}
                      className="mt-2 text-sm text-destructive"
                    >
                      {conflicts.get(row.playerId) === 'already_logged'
                        ? 'Already reconciled.'
                        : 'Winner assignment changed in Sleeper.'}
                    </p>
                  )}
                </div>
              );
            })}
            {preview.unresolved.map((row) => (
              <p
                key={`${row.sleeperRosterId}-${row.sleeperId}`}
                data-testid={`sleeper-sync-unresolved-sleeper-${row.sleeperId}`}
                className="text-sm text-muted-foreground"
              >
                Unresolved Sleeper player {row.sleeperId} on roster {row.sleeperRosterId}; it was
                not imported.
              </p>
            ))}
            {preview.diagnostics.alreadyLoggedCount > 0 && (
              <p
                data-testid="sleeper-sync-already-reconciled"
                className="text-sm text-muted-foreground"
              >
                {preview.diagnostics.alreadyLoggedCount} player
                {preview.diagnostics.alreadyLoggedCount === 1 ? '' : 's'} already reconciled.
              </p>
            )}
            {preview.actionable.length === 0 && (
              <p>No unlogged, resolvable Sleeper players remain.</p>
            )}
            <Button
              data-testid="sleeper-sync-submit"
              onClick={submitCatchUp}
              disabled={preview.actionable.length === 0}
            >
              Import entered prices
            </Button>
          </div>
        )}

        {view === 'error' && (
          <Button data-testid="sleeper-sync-retry" onClick={loadPreview}>
            Retry preview
          </Button>
        )}
        {error && (
          <p data-testid="sleeper-sync-error" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
