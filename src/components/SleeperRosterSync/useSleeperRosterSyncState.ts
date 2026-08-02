'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SleeperRosterCandidate } from '@/lib/sleeper';
import {
  logSleeperRosterCatchUp,
  previewSleeperRosterMatch,
  previewSleeperRosterSync,
  saveSleeperRosterMapping,
} from '@/lib/sleeper-roster-actions';
import type {
  SleeperRosterCatchUpResponse,
  SleeperRosterMatchResponse,
  SleeperRosterSyncResponse,
} from '@/lib/sleeper-roster-actions';
import type { LeagueTeam, Position } from '@/types';
import type { SleeperRosterPreview } from '@/lib/sleeperRosterSync';
import type {
  SleeperRosterMappingRow,
  SleeperRosterPreviewRow,
  SleeperRosterSyncDialogProps,
  SleeperRosterSyncState,
  SyncView,
} from './sleeperRosterSyncTypes';

type SleeperRosterActionFailureCode =
  | Exclude<SleeperRosterSyncResponse, { ok: true }>['code']
  | Exclude<SleeperRosterCatchUpResponse, { ok: true }>['code']
  | Exclude<SleeperRosterMatchResponse, { ok: true }>['code'];

function responseMessage(code: SleeperRosterActionFailureCode): string {
  switch (code) {
    case 'mapping_required':
      return 'Sleeper roster mapping needs repair before this roster can be reconciled.';
    case 'configuration_required':
      return 'Add a Sleeper league ID and map each roster before continuing.';
    case 'sleeper_error':
      return 'Sleeper could not be reached. Try again in a moment.';
    case 'invalid_league_id':
      return 'Enter a valid numeric Sleeper league ID.';
    case 'timeout':
      return 'Sleeper took too long to respond. Try again in a moment.';
    case 'rate_limited':
      return 'Sleeper is rate limiting requests. Try again in a moment.';
    case 'malformed_response':
      return 'Sleeper returned unexpected data. Try again in a moment.';
    case 'invalid_input':
      return 'Enter a whole-dollar price greater than zero.';
    case 'not_found':
      return 'This draft is no longer available.';
    case 'draft_complete':
      return 'This draft is complete and can no longer be changed.';
    default:
      return code satisfies never;
  }
}

function createMappingRows(
  matchCandidates: SleeperRosterCandidate[] | null,
  matchTeams: LeagueTeam[],
  teamMappings: Record<number, string>,
): SleeperRosterMappingRow[] {
  return (
    matchCandidates?.map((candidate) => {
      const rosterId = candidate.sleeperRosterId;
      const label = candidate.ownerDisplayName
        ? candidate.ownerTeamName
          ? `${candidate.ownerDisplayName} (${candidate.ownerTeamName})`
          : candidate.ownerDisplayName
        : `Unclaimed roster ${rosterId}`;
      return {
        rosterId,
        label,
        isAutoMatched: candidate.matchSource !== 'none',
        selectedTeamId: teamMappings[rosterId] ?? '',
        options: matchTeams.map((team) => ({
          id: team.id,
          label: team.displayName ?? team.handle,
          disabled: Object.entries(teamMappings).some(
            ([mappedRosterId, mappedTeamId]) =>
              Number(mappedRosterId) !== rosterId && mappedTeamId === String(team.id),
          ),
        })),
      };
    }) ?? []
  );
}

function createPreviewRows(
  preview: SleeperRosterPreview | null,
  prices: Record<number, string>,
  conflicts: Map<number, string>,
): SleeperRosterPreviewRow[] {
  return (
    preview?.actionable.map((row) => ({
      playerId: row.playerId,
      playerName: row.playerName,
      position: row.position as Position,
      nflTeam: row.nflTeam,
      targetBudget: row.targetBudget,
      teamHandle: row.teamHandle,
      price: prices[row.playerId] ?? '',
      conflictMessage: conflicts.has(row.playerId)
        ? conflicts.get(row.playerId) === 'already_logged'
          ? 'Already reconciled.'
          : 'Winner assignment changed in Sleeper.'
        : null,
    })) ?? []
  );
}

export function useSleeperRosterSyncState(
  props: SleeperRosterSyncDialogProps,
): SleeperRosterSyncState {
  const { draftId, teams, initiallyConfigured, sleeperLeagueId = null } = props;
  const router = useRouter();
  const [view, setView] = useState<SyncView>(initiallyConfigured ? 'loading' : 'configuration');
  const [preview, setPreview] = useState<SleeperRosterPreview | null>(null);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState('');
  const [leagueId, setLeagueId] = useState<string>(sleeperLeagueId ?? '');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [matchCandidates, setMatchCandidates] = useState<SleeperRosterCandidate[] | null>(null);
  const [matchTeams, setMatchTeams] = useState<LeagueTeam[]>(teams);
  const [teamMappings, setTeamMappings] = useState<Record<number, string>>({});
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [conflicts, setConflicts] = useState<Map<number, string>>(new Map());
  const autoSyncedRef = useRef(false);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    };
  }, []);

  // Setting `error`/`successMessage` to a string identical to their current value produces no
  // DOM mutation, so aria-live silently fails to re-announce a repeated identical outcome (e.g.
  // two consecutive validation failures with the same message). Routing every real message
  // through these clears the timeout, blanks the state (a real change), then re-sets it a tick
  // later so the live region always sees two distinct commits.
  const announceError = useCallback((text: string) => {
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    setError('');
    errorTimeoutRef.current = setTimeout(() => setError(text), 50);
  }, []);

  const clearError = useCallback(() => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
    setError('');
  }, []);

  const announceSuccess = useCallback((text: string) => {
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    setSuccessMessage('');
    successTimeoutRef.current = setTimeout(() => setSuccessMessage(text), 50);
  }, []);

  const clearSuccess = useCallback(() => {
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
    setSuccessMessage('');
  }, []);

  // loadPreview/fetchInitialPreview intentionally use plain setError, not announceError: their
  // outcome feeds straight into a view transition that can trigger the auto-sync effect below,
  // whose own clearError() would otherwise race the delayed re-set and cancel it before it ever
  // renders. They're not a repeated-click path anyway (mount-once or explicit Retry).
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
        announceError(responseMessage('invalid_league_id'));
        return;
      }
      setIsSyncing(true);
      clearError();
      try {
        const response = await previewSleeperRosterMatch({ draftId, leagueId: targetLeagueId });
        if (!response.ok) {
          announceError(responseMessage(response.code));
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
        announceError('Unable to sync with Sleeper. Please try again.');
        setIsSyncing(false);
      }
    },
    [draftId, leagueId, announceError, clearError],
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
      announceError('Sync with Sleeper before saving a mapping.');
      return;
    }
    const mappings = matchCandidates.flatMap((candidate) => {
      const teamId = Number(teamMappings[candidate.sleeperRosterId]);
      return Number.isSafeInteger(teamId) && teamId > 0
        ? [{ teamId, sleeperRosterId: candidate.sleeperRosterId }]
        : [];
    });
    if (!leagueId.trim() || mappings.length !== matchCandidates.length) {
      announceError('Enter a league ID and assign every Sleeper roster to one team.');
      return;
    }
    if (new Set(mappings.map((mapping) => mapping.teamId)).size !== mappings.length) {
      announceError('Each draft team can only be mapped to one Sleeper roster.');
      return;
    }

    setView('loading');
    clearError();
    clearSuccess();
    try {
      const response = await saveSleeperRosterMapping({
        draftId,
        leagueId: leagueId.trim(),
        mappings,
      });
      if (!response.ok) {
        announceError(responseMessage(response.code));
        setView('configuration');
        return;
      }
      setPreview(response.preview);
      setView('preview');
      announceSuccess('Sleeper roster mapping saved.');
    } catch {
      announceError('Unable to save the Sleeper roster mapping. Please try again.');
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
      announceError('Enter a whole-dollar price greater than zero for each filled row.');
      return;
    }
    if (entries.length === 0) {
      announceError('Enter at least one price to import. Blank rows are left untouched.');
      return;
    }

    clearError();
    clearSuccess();
    setConflicts(new Map());
    try {
      const response = await logSleeperRosterCatchUp({ draftId, entries });
      if (!response.ok) {
        announceError(responseMessage(response.code));
        return;
      }
      setConflicts(
        new Map(response.conflicts.map((conflict) => [conflict.playerId, conflict.reason])),
      );
      announceSuccess(`Imported ${entries.length} price${entries.length === 1 ? '' : 's'}.`);
      router.refresh();
    } catch {
      announceError('Unable to save the catch-up results. Please try again.');
    }
  }

  const configuration = useMemo(
    () => ({
      leagueId,
      isSyncing,
      mappingRows: createMappingRows(matchCandidates, matchTeams, teamMappings),
      hasMatchCandidates: matchCandidates !== null,
    }),
    [isSyncing, leagueId, matchCandidates, matchTeams, teamMappings],
  );

  const preparedPreview = useMemo(() => {
    if (!preview) return null;
    return {
      rows: createPreviewRows(preview, prices, conflicts),
      unresolvedRows: preview.unresolved,
      alreadyLoggedCount: preview.diagnostics.alreadyLoggedCount,
      hasActionableRows: preview.actionable.length > 0,
    };
  }, [conflicts, preview, prices]);

  function setPrice(playerId: number, price: string) {
    setPrices((current) => ({ ...current, [playerId]: price }));
  }

  return {
    view,
    error,
    successMessage,
    configuration,
    preview: preparedPreview,
    loadPreview,
    syncLeague,
    saveConfiguration,
    submitCatchUp,
    setLeagueId,
    updateMapping,
    setPrice,
  };
}
