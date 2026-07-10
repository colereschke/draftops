'use client';

import { ChevronRight } from 'lucide-react';
import type { TeamWithRoster } from '@/types';
import type { ManagerTendency } from '@/lib/tendencies';
import { cn } from '@/lib/utils';
import DossierFace from './DossierFace';
import TeamRosterDetail from './TeamRosterDetail';

export interface DossierCardProps {
  team: TeamWithRoster;
  tendency: ManagerTendency;
  isOwner: boolean;
  isExpanded: boolean;
  isSelected?: boolean;
  onToggle: (id: number) => void;
}

export default function DossierCard({
  team,
  tendency,
  isOwner,
  isExpanded,
  isSelected = false,
  onToggle,
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
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} roster for ${team.handle}`}
        data-testid={`dossier-expand-${team.id}`}
        className="relative w-full cursor-pointer px-4 pt-3 pb-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            'absolute top-3 right-4 size-4 shrink-0 text-muted-foreground transition-transform duration-150',
            isExpanded && 'rotate-90',
          )}
        />
        <DossierFace team={team} tendency={tendency} isOwner={isOwner} />
      </div>

      {isExpanded && (
        <div className="border-t border-border-subtle border-l-[3px] border-l-primary bg-background px-4 pt-2.5 pb-3.5">
          <TeamRosterDetail results={team.results} />
        </div>
      )}
    </div>
  );
}
