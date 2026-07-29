'use client';

import MutationStatus from '@/components/MutationStatus';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import SleeperRosterConfiguration from './SleeperRosterConfiguration';
import SleeperRosterPreview from './SleeperRosterPreview';
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
          <SleeperRosterPreview
            preview={preview}
            onPriceChange={setPrice}
            onSubmit={submitCatchUp}
          />
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
