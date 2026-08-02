'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SleeperRosterSyncConfiguration } from './sleeperRosterSyncTypes';

interface SleeperRosterConfigurationProps extends SleeperRosterSyncConfiguration {
  onLeagueIdChange: (leagueId: string) => void;
  onSync: () => void;
  onMappingChange: (rosterId: number, teamId: string) => void;
  onSave: () => void;
}

export default function SleeperRosterConfiguration({
  leagueId,
  isSyncing,
  mappingRows,
  hasMatchCandidates,
  onLeagueIdChange,
  onSync,
  onMappingChange,
  onSave,
}: SleeperRosterConfigurationProps) {
  return (
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
            onChange={(event) => onLeagueIdChange(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            data-testid="sleeper-sync-sync-button"
            onClick={onSync}
            disabled={isSyncing}
          >
            {isSyncing ? 'Syncing…' : 'Sync league'}
          </Button>
        </div>
      </div>
      {mappingRows.map((row) => {
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
              onChange={(event) => onMappingChange(rosterId, event.target.value)}
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
      {hasMatchCandidates && (
        <Button data-testid="sleeper-sync-save-mapping" onClick={onSave}>
          Save mapping and preview
        </Button>
      )}
    </div>
  );
}
