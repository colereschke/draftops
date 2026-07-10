import type { TeamWithRoster } from '@/types';
import type { ManagerTendency } from '@/lib/tendencies';
import DossierFace from './DossierFace';
import TeamRosterDetail from './TeamRosterDetail';

export interface TeamDetailPaneProps {
  team: TeamWithRoster;
  tendency: ManagerTendency;
  isOwner: boolean;
}

export default function TeamDetailPane({ team, tendency, isOwner }: TeamDetailPaneProps) {
  return (
    <div
      data-testid="team-detail-pane"
      className="rounded-lg border border-border-subtle bg-card px-4 pt-3 pb-3.5"
    >
      <DossierFace team={team} tendency={tendency} isOwner={isOwner} testIdSuffix="-detail" />
      <div className="mt-3 border-t border-border-subtle pt-2.5">
        <TeamRosterDetail results={team.results} />
      </div>
    </div>
  );
}
