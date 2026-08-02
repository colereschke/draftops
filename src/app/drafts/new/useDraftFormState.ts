'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createDraft } from '@/lib/actions';
import { captureClientError, createIncidentId } from '@/lib/clientObservability';
import { draftInputSchema, MAX_TEAMS, MIN_TEAMS, type DraftInput } from '@/lib/draftInputSchema';
import type { DraftMutationCode } from '@/lib/draftMutation';
import { getRankingSummary, type RankingSummary } from '@/lib/rankings-actions';
import { importFromSleeper } from '@/lib/sleeper-actions';
import type { SleeperImportResult } from '@/lib/sleeper';
import { useNumericField, type UseNumericField } from '@/lib/useNumericField';
import {
  DEFAULT_SCORING_SETTINGS,
  DEFAULT_STARTING_LINEUP,
  DEFAULT_TARGET_ROSTER,
  type FuturePickAuctionMode,
  type StartingSlot,
} from '@/types';
import { defaultTeams, sortStartingLineup, type ImportState, type TeamRow } from './draftFormTypes';

export interface DraftFormState {
  name: string;
  setName: (name: string) => void;
  teamCountField: UseNumericField;
  budgetField: UseNumericField;
  rosterSizeField: UseNumericField;
  targetRosterFields: Record<'QB' | 'RB' | 'WR' | 'TE', UseNumericField>;
  teams: TeamRow[];
  error: string | null;
  isPending: boolean;
  leagueId: string;
  ownerUsername: string;
  importState: ImportState;
  isImporting: boolean;
  futurePickAuctionMode: FuturePickAuctionMode;
  setFuturePickAuctionMode: (mode: FuturePickAuctionMode) => void;
  startingLineup: StartingSlot[];
  pprFields: Record<'pprRB' | 'pprWR' | 'pprTE', UseNumericField>;
  fdBonusFields: Record<'recFD' | 'rbFDBonus' | 'wrFDBonus' | 'teFDBonus', UseNumericField>;
  passYdsPerPointField: UseNumericField;
  passTDField: UseNumericField;
  passIntField: UseNumericField;
  rushAttField: UseNumericField;
  rushFDField: UseNumericField;
  rankingSummary: RankingSummary | null;
  rankingSummaryError: boolean;
  playerSource: 'etr' | 'custom';
  setPlayerSource: (source: 'etr' | 'custom') => void;
  handleLeagueIdChange: (leagueId: string) => void;
  setOwnerUsername: (ownerUsername: string) => void;
  setMine: (index: number) => void;
  updateTeam: (index: number, field: 'handle' | 'displayName', value: string) => void;
  addSlot: () => void;
  removeSlot: (index: number) => void;
  updateSlot: (index: number, slot: StartingSlot) => void;
  handleImport: () => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

function describeCreateDraftError(code: DraftMutationCode): string {
  if (code === 'UNAUTHORIZED') return 'You must be signed in to create a draft.';
  if (code === 'NO_RANKING_SET') {
    return 'No custom ranking set found — upload one on the Rankings page first.';
  }
  if (code === 'DUPLICATE_TEAM') return 'Two teams share a handle or Sleeper roster ID.';
  return 'Something went wrong. Check your draft settings and try again.';
}

export function useDraftFormState(): DraftFormState {
  const [name, setName] = useState('');
  const teamCountField = useNumericField(12);
  const budgetField = useNumericField(1000);
  const rosterSizeField = useNumericField(30);
  const targetRosterQBField = useNumericField(DEFAULT_TARGET_ROSTER.QB ?? 4);
  const targetRosterRBField = useNumericField(DEFAULT_TARGET_ROSTER.RB ?? 9);
  const targetRosterWRField = useNumericField(DEFAULT_TARGET_ROSTER.WR ?? 11);
  const targetRosterTEField = useNumericField(DEFAULT_TARGET_ROSTER.TE ?? 3);
  const targetRosterFields = {
    QB: targetRosterQBField,
    RB: targetRosterRBField,
    WR: targetRosterWRField,
    TE: targetRosterTEField,
  } as const;
  const [teams, setTeams] = useState<TeamRow[]>(() => defaultTeams(12));
  const [syncedTeamCount, setSyncedTeamCount] = useState(12);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isImporting, startImportTransition] = useTransition();
  const [leagueId, setLeagueId] = useState('');
  const [importedLeagueId, setImportedLeagueId] = useState<string | null>(null);
  const [ownerUsername, setOwnerUsername] = useState('');
  const [importState, setImportState] = useState<ImportState>({ status: 'idle' });
  const [futurePickAuctionMode, setFuturePickAuctionMode] =
    useState<FuturePickAuctionMode>('packages');
  const [startingLineup, setStartingLineup] = useState<StartingSlot[]>([
    ...DEFAULT_STARTING_LINEUP,
  ]);
  const passYdsPerPointField = useNumericField(DEFAULT_SCORING_SETTINGS.passYdsPerPoint, {
    float: true,
  });
  const passTDField = useNumericField(DEFAULT_SCORING_SETTINGS.passTD, { float: true });
  const passIntField = useNumericField(DEFAULT_SCORING_SETTINGS.passInt, { float: true });
  const rushAttField = useNumericField(DEFAULT_SCORING_SETTINGS.rushAtt, { float: true });
  const rushFDField = useNumericField(DEFAULT_SCORING_SETTINGS.rushFD, { float: true });
  const pprRBField = useNumericField(DEFAULT_SCORING_SETTINGS.pprRB, { float: true });
  const pprWRField = useNumericField(DEFAULT_SCORING_SETTINGS.pprWR, { float: true });
  const pprTEField = useNumericField(DEFAULT_SCORING_SETTINGS.pprTE, { float: true });
  const recFDField = useNumericField(DEFAULT_SCORING_SETTINGS.recFD, { float: true });
  const rbFDBonusField = useNumericField(DEFAULT_SCORING_SETTINGS.rbFDBonus, { float: true });
  const wrFDBonusField = useNumericField(DEFAULT_SCORING_SETTINGS.wrFDBonus, { float: true });
  const teFDBonusField = useNumericField(DEFAULT_SCORING_SETTINGS.teFDBonus, { float: true });
  const pprFields = { pprRB: pprRBField, pprWR: pprWRField, pprTE: pprTEField } as const;
  const fdBonusFields = {
    recFD: recFDField,
    rbFDBonus: rbFDBonusField,
    wrFDBonus: wrFDBonusField,
    teFDBonus: teFDBonusField,
  } as const;
  const [rankingSummary, setRankingSummary] = useState<RankingSummary | null>(null);
  const [rankingSummaryError, setRankingSummaryError] = useState(false);
  const [playerSource, setPlayerSource] = useState<'etr' | 'custom'>('etr');
  const router = useRouter();

  useEffect(() => {
    getRankingSummary()
      .then(setRankingSummary)
      .catch((err) => {
        console.error('Failed to load ranking summary:', err);
        setRankingSummaryError(true);
      });
  }, []);

  // Resize the `teams` array to track the team count field, clamped to [2, 32] so an
  // unclamped negative or extreme value can't corrupt `Array.prototype.slice` behavior or
  // generate an absurd roster table. This intentionally adjusts state during render (the
  // React-documented pattern for "state derived from a changed value while preserving prior
  // state") rather than in a useEffect, since a synchronous setState in an effect body here
  // would trigger a needless extra commit/render pass.
  const safeTeamCount = Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, teamCountField.numericValue));
  if (safeTeamCount !== syncedTeamCount) {
    setSyncedTeamCount(safeTeamCount);
    setTeams((prev) => {
      if (safeTeamCount > prev.length) {
        const added = Array.from({ length: safeTeamCount - prev.length }, (_, i) => ({
          handle: `team-${prev.length + i + 1}`,
          displayName: '',
          isMine: false,
        }));
        return [...prev, ...added];
      }
      return prev.slice(0, safeTeamCount);
    });
  }

  function setMine(index: number) {
    setTeams((prev) => prev.map((t, i) => ({ ...t, isMine: i === index })));
  }

  function updateTeam(index: number, field: 'handle' | 'displayName', value: string) {
    setTeams((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  function addSlot() {
    setStartingLineup((prev) => sortStartingLineup([...prev, 'FLEX']));
  }

  function removeSlot(index: number) {
    setStartingLineup((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSlot(index: number, slot: StartingSlot) {
    setStartingLineup((prev) => sortStartingLineup(prev.map((s, i) => (i === index ? slot : s))));
  }

  function handleLeagueIdChange(nextLeagueId: string) {
    setLeagueId(nextLeagueId);
    if (importedLeagueId && nextLeagueId.trim() !== importedLeagueId) {
      setImportedLeagueId(null);
      setTeams((prev) => prev.map(({ sleeperRosterId: _, ...team }) => team));
      setImportState({ status: 'idle' });
    }
  }

  function handleImport() {
    if (!leagueId.trim()) return;
    setImportState({ status: 'idle' });
    const trimmedUsername = ownerUsername.trim();
    startImportTransition(async () => {
      const result = await importFromSleeper(leagueId.trim(), trimmedUsername || undefined);
      if (!result.ok) {
        setImportState({ status: 'error', message: result.error });
        return;
      }
      const { data } = result;
      if (data.leagueName) setName(data.leagueName);
      teamCountField.setNumericValue(data.teamCount);
      rosterSizeField.setNumericValue(data.rosterSize);
      setStartingLineup(data.startingLineup);
      passYdsPerPointField.setNumericValue(data.scoringSettings.passYdsPerPoint);
      passTDField.setNumericValue(data.scoringSettings.passTD);
      passIntField.setNumericValue(data.scoringSettings.passInt);
      rushAttField.setNumericValue(data.scoringSettings.rushAtt);
      rushFDField.setNumericValue(data.scoringSettings.rushFD);
      pprRBField.setNumericValue(data.scoringSettings.pprRB);
      pprWRField.setNumericValue(data.scoringSettings.pprWR);
      pprTEField.setNumericValue(data.scoringSettings.pprTE);
      recFDField.setNumericValue(data.scoringSettings.recFD);
      rbFDBonusField.setNumericValue(data.scoringSettings.rbFDBonus);
      wrFDBonusField.setNumericValue(data.scoringSettings.wrFDBonus);
      teFDBonusField.setNumericValue(data.scoringSettings.teFDBonus);
      setTeams(
        data.teams.map((t: SleeperImportResult['teams'][number], i: number) => ({
          handle: t.handle,
          displayName: t.displayName,
          isMine: data.ownerIndex !== null ? i === data.ownerIndex : i === 0,
          sleeperRosterId: t.sleeperRosterId,
        })),
      );
      setImportedLeagueId(leagueId.trim());
      const warnings = [...data.warnings];
      if (trimmedUsername && data.ownerIndex === null) {
        warnings.push(
          `Couldn't match '${trimmedUsername}' to a team in this league — select yours manually.`,
        );
      }
      setImportState({
        status: 'success',
        confirm: `Imported from Sleeper · ${data.teamCount} teams · ${data.startingLineup.length} starting slots`,
        warnings,
      });
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const requiredNumericFields = [
      { label: 'Team count', value: teamCountField.value },
      { label: 'Budget per team', value: budgetField.value },
      { label: 'Roster size', value: rosterSizeField.value },
      { label: 'Target roster QB', value: targetRosterFields.QB.value },
      { label: 'Target roster RB', value: targetRosterFields.RB.value },
      { label: 'Target roster WR', value: targetRosterFields.WR.value },
      { label: 'Target roster TE', value: targetRosterFields.TE.value },
      { label: 'Passing yards per point', value: passYdsPerPointField.value },
      { label: 'Passing TD', value: passTDField.value },
      { label: 'Interception', value: passIntField.value },
      { label: 'Rush attempt bonus', value: rushAttField.value },
      { label: 'Rush first-down bonus', value: rushFDField.value },
      { label: 'RB PPR', value: pprRBField.value },
      { label: 'WR PPR', value: pprWRField.value },
      { label: 'TE PPR', value: pprTEField.value },
      { label: 'Receiving first-down bonus', value: recFDField.value },
      { label: 'RB receiving first-down bonus', value: rbFDBonusField.value },
      { label: 'WR receiving first-down bonus', value: wrFDBonusField.value },
      { label: 'TE receiving first-down bonus', value: teFDBonusField.value },
    ];
    const blankNumericField = requiredNumericFields.find((field) => field.value.trim() === '');
    if (blankNumericField) {
      setError(`${blankNumericField.label} is required.`);
      return;
    }

    const candidate: DraftInput = {
      name,
      budgetPerTeam: budgetField.numericValue,
      rosterSize: rosterSizeField.numericValue,
      futurePickAuctionMode,
      targetRoster: {
        QB: targetRosterFields.QB.numericValue,
        RB: targetRosterFields.RB.numericValue,
        WR: targetRosterFields.WR.numericValue,
        TE: targetRosterFields.TE.numericValue,
      },
      startingLineup,
      scoringSettings: {
        passYdsPerPoint: passYdsPerPointField.numericValue,
        passTD: passTDField.numericValue,
        passInt: passIntField.numericValue,
        rushAtt: rushAttField.numericValue,
        rushFD: rushFDField.numericValue,
        pprRB: pprRBField.numericValue,
        pprWR: pprWRField.numericValue,
        pprTE: pprTEField.numericValue,
        recFD: recFDField.numericValue,
        rbFDBonus: rbFDBonusField.numericValue,
        wrFDBonus: wrFDBonusField.numericValue,
        teFDBonus: teFDBonusField.numericValue,
      },
      teams,
      playerSource,
      sleeperLeagueId: importedLeagueId ?? undefined,
    };

    const parsed = draftInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid draft settings.');
      return;
    }

    startTransition(async () => {
      try {
        const result = await createDraft(parsed.data);
        if (!result.ok) {
          setError(describeCreateDraftError(result.code));
          return;
        }
        router.push(`/draft/${result.data.draftId}`);
      } catch (error) {
        const reportedError =
          error instanceof Error ? error : new Error('Unknown draft creation error');
        setError('Draft creation failed. Please try again.');
        try {
          captureClientError(reportedError, createIncidentId());
        } catch {
          // Reporting must never prevent the inline recovery UI from rendering.
        }
      }
    });
  }

  return {
    name,
    setName,
    teamCountField,
    budgetField,
    rosterSizeField,
    targetRosterFields,
    teams,
    error,
    isPending,
    leagueId,
    ownerUsername,
    importState,
    isImporting,
    futurePickAuctionMode,
    setFuturePickAuctionMode,
    startingLineup,
    pprFields,
    fdBonusFields,
    passYdsPerPointField,
    passTDField,
    passIntField,
    rushAttField,
    rushFDField,
    rankingSummary,
    rankingSummaryError,
    playerSource,
    setPlayerSource,
    handleLeagueIdChange,
    setOwnerUsername,
    setMine,
    updateTeam,
    addSlot,
    removeSlot,
    updateSlot,
    handleImport,
    handleSubmit,
  };
}
