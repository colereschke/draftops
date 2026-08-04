import type { LeagueTeam, Position } from '@/types';

export interface SleeperRosterSyncDialogProps {
  draftId: number;
  teams: LeagueTeam[];
  initiallyConfigured: boolean;
  sleeperLeagueId?: string | null;
  onClose: () => void;
}

export type SyncView = 'loading' | 'configuration' | 'preview' | 'error';

export interface SleeperRosterMappingOption {
  id: number;
  label: string;
  disabled: boolean;
}

export interface SleeperRosterMappingRow {
  rosterId: number;
  label: string;
  isAutoMatched: boolean;
  selectedTeamId: string;
  options: SleeperRosterMappingOption[];
}

export interface SleeperRosterPreviewRow {
  playerId: number;
  playerName: string;
  position: Position;
  nflTeam: string;
  targetBudget: number;
  teamHandle: string;
  price: string;
  conflictMessage: string | null;
}

export interface SleeperRosterSyncConfiguration {
  leagueId: string;
  isSyncing: boolean;
  mappingRows: SleeperRosterMappingRow[];
  hasMatchCandidates: boolean;
}

export interface SleeperRosterSyncPreview {
  rows: SleeperRosterPreviewRow[];
  unresolvedRows: Array<{
    sleeperId: string;
    sleeperRosterId: number;
  }>;
  alreadyLoggedCount: number;
  hasActionableRows: boolean;
}

export interface SleeperRosterSyncState {
  view: SyncView;
  error: string;
  successMessage: string;
  configuration: SleeperRosterSyncConfiguration;
  preview: SleeperRosterSyncPreview | null;
  loadPreview: () => Promise<void>;
  syncLeague: (idOverride?: string) => Promise<void>;
  saveConfiguration: () => Promise<void>;
  submitCatchUp: () => Promise<void>;
  setLeagueId: (leagueId: string) => void;
  updateMapping: (rosterId: number, teamId: string) => void;
  setPrice: (playerId: number, price: string) => void;
}
