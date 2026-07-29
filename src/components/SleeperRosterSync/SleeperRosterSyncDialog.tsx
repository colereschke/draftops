'use client';

import { POS_COLORS } from '@/lib/posColors';
import MutationStatus from '@/components/MutationStatus';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SleeperRosterConfiguration from './SleeperRosterConfiguration';
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
          <SleeperRosterConfiguration
            {...configuration}
            onLeagueIdChange={setLeagueId}
            onSync={() => void syncLeague()}
            onMappingChange={updateMapping}
            onSave={() => void saveConfiguration()}
          />
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
