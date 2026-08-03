'use client';

import { ChevronRight } from 'lucide-react';
import type { TeamWithRoster } from '@/types';
import type { ManagerTendency } from '@/lib/tendencies';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import DossierFace from './DossierFace';
import TeamRosterDetail from './TeamRosterDetail';

export interface DossierCardProps {
  team: TeamWithRoster;
  tendency: ManagerTendency;
  isOwner: boolean;
  isExpanded: boolean;
  isSelected?: boolean;
  // 'expand' (default): mobile grid — clicking discloses/collapses the inline
  // roster on this same card. 'select': desktop split-view list — clicking
  // picks this team into a separate detail pane; nothing on the card itself
  // expands, so the disclosure affordance (chevron, aria-expanded) is wrong here.
  mode?: 'expand' | 'select';
  onToggle: (id: number) => void;
  onLogTrade: (teamId: number) => void;
  isReadOnly?: boolean;
}

export default function DossierCard({
  team,
  tendency,
  isOwner,
  isExpanded,
  isSelected = false,
  mode = 'expand',
  onToggle,
  onLogTrade,
  isReadOnly = false,
}: DossierCardProps) {
  return (
    <div
      className={cn('rounded-lg border border-border-subtle bg-card', isSelected && 'bg-accent')}
      style={{ borderLeft: `3px solid ${isOwner ? 'var(--primary)' : 'var(--border)'}` }}
      data-testid={`dossier-card-${team.id}`}
    >
      {/* The whole face toggles the roster drawer — a full-width target, not just the
          chevron. It is the only interactive element here (the chips below are inert),
          so a role="button" div with keyboard support is safe and a11y-correct. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onToggle(team.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle(team.id);
          }
        }}
        aria-expanded={mode === 'expand' ? isExpanded : undefined}
        aria-pressed={mode === 'select' ? isSelected : undefined}
        aria-label={
          mode === 'select'
            ? `Show roster for ${team.handle}`
            : `${isExpanded ? 'Collapse' : 'Expand'} roster for ${team.handle}`
        }
        data-testid={`dossier-expand-${team.id}`}
        className="relative w-full cursor-pointer px-4 pt-3 pb-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {mode === 'expand' && (
          <ChevronRight
            aria-hidden
            className={cn(
              'absolute top-3 right-4 size-4 shrink-0 text-muted-foreground transition-transform duration-150',
              isExpanded && 'rotate-90',
            )}
          />
        )}
        <DossierFace team={team} tendency={tendency} isOwner={isOwner} />
      </div>

      {/* Sibling of the role="button" face — never nested inside it. A button inside a
          role="button" container is a nested-interactive-control a11y violation, and its
          click would also fire the face's own toggle handler. stopPropagation is
          defense-in-depth in case a future edit moves this back inside. Hidden entirely
          (not disabled) on a completed draft, matching the repo's isReadOnly convention
          (e.g. WatchlistSidebar's action controls). */}
      {!isReadOnly ? (
        <div className="flex justify-end px-4 pb-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid={`dossier-log-trade-${team.id}`}
            onClick={(event) => {
              event.stopPropagation();
              onLogTrade(team.id);
            }}
          >
            Log Trade
          </Button>
        </div>
      ) : null}

      {isExpanded && (
        <div className="border-t border-border-subtle border-l-[3px] border-l-primary bg-background px-4 pt-2.5 pb-3.5">
          <TeamRosterDetail results={team.results} />
        </div>
      )}
    </div>
  );
}
