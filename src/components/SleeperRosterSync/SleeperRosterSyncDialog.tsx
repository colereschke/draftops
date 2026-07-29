'use client';

import { POS_COLORS } from '@/lib/posColors';
import MutationStatus from '@/components/MutationStatus';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSleeperRosterSyncState } from './useSleeperRosterSyncState';
import type { SleeperRosterSyncDialogProps } from './sleeperRosterSyncTypes';

export default function SleeperRosterSyncDialog(props: SleeperRosterSyncDialogProps) {
  const { onClose } = props;
  const {
    view,
    error,
    successMessage,
    configuration,
    preview,
    loadPreview,
    syncLeague,
    saveConfiguration,
    submitCatchUp,
    setLeagueId,
    updateMapping,
    setPrice,
  } = useSleeperRosterSyncState(props);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>Sleeper roster catch-up</DialogTitle>
        <MutationStatus message={error || successMessage} />
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
                  value={configuration.leagueId}
                  onChange={(event) => setLeagueId(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  data-testid="sleeper-sync-sync-button"
                  onClick={() => syncLeague()}
                  disabled={configuration.isSyncing}
                >
                  {configuration.isSyncing ? 'Syncing…' : 'Sync league'}
                </Button>
              </div>
            </div>
            {configuration.mappingRows.map((row) => {
              const rosterId = row.rosterId;
              return (
                <div key={rosterId} className="space-y-1.5">
                  <Label htmlFor={`sleeper-sync-roster-map-${rosterId}`}>
                    {row.label}
                    {row.isAutoMatched && (
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
                    value={row.selectedTeamId}
                    onChange={(event) => updateMapping(rosterId, event.target.value)}
                  >
                    <option value="">Select a draft team</option>
                    {row.options.map((option) => {
                      return (
                        <option
                          key={option.id}
                          value={option.id}
                          disabled={option.disabled}
                          data-testid={`sleeper-sync-roster-option-${rosterId}-${option.id}`}
                        >
                          {option.label}
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            })}
            {configuration.hasMatchCandidates && (
              <Button data-testid="sleeper-sync-save-mapping" onClick={saveConfiguration}>
                Save mapping and preview
              </Button>
            )}
          </div>
        )}

        {view === 'preview' && preview && (
          <div className="space-y-4">
            {preview.rows.map((row) => {
              const posColor = POS_COLORS[row.position] ?? POS_COLORS.PICK;
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
                          value={row.price}
                          onChange={(event) => setPrice(row.playerId, event.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  {row.conflictMessage && (
                    <p
                      data-testid={`sleeper-sync-conflict-${row.playerId}`}
                      className="mt-2 text-sm text-destructive"
                    >
                      {row.conflictMessage}
                    </p>
                  )}
                </div>
              );
            })}
            {preview.unresolvedRows.map((row) => (
              <p
                key={`${row.sleeperRosterId}-${row.sleeperId}`}
                data-testid={`sleeper-sync-unresolved-sleeper-${row.sleeperId}`}
                className="text-sm text-muted-foreground"
              >
                Unresolved Sleeper player {row.sleeperId} on roster {row.sleeperRosterId}; it was
                not imported.
              </p>
            ))}
            {preview.alreadyLoggedCount > 0 && (
              <p
                data-testid="sleeper-sync-already-reconciled"
                className="text-sm text-muted-foreground"
              >
                {preview.alreadyLoggedCount} player
                {preview.alreadyLoggedCount === 1 ? '' : 's'} already reconciled.
              </p>
            )}
            {!preview.hasActionableRows && <p>No unlogged, resolvable Sleeper players remain.</p>}
            <Button
              data-testid="sleeper-sync-submit"
              onClick={submitCatchUp}
              disabled={!preview.hasActionableRows}
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
      </DialogContent>
    </Dialog>
  );
}
