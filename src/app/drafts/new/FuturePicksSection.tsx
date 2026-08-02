import type { FuturePickAuctionMode } from '@/types';
import { inputStyle, labelStyle, sectionHeaderStyle } from './draftFormStyles';

interface FuturePicksSectionProps {
  futurePickAuctionMode: FuturePickAuctionMode;
  onFuturePickAuctionModeChange: (mode: FuturePickAuctionMode) => void;
}

export function FuturePicksSection({
  futurePickAuctionMode,
  onFuturePickAuctionModeChange,
}: FuturePicksSectionProps) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderRadius: '6px',
        padding: '1.25rem',
        marginBottom: '1rem',
      }}
    >
      <div style={sectionHeaderStyle}>Future Picks</div>
      <label style={labelStyle}>
        Next-year pick auction mode
        <select
          data-testid="future-pick-auction-mode"
          value={futurePickAuctionMode}
          onChange={(event) =>
            onFuturePickAuctionModeChange(event.target.value as FuturePickAuctionMode)
          }
          style={inputStyle}
        >
          <option value="packages">Team packages</option>
          <option value="individual">Individual team picks</option>
          <option value="none">Not auctioned</option>
        </select>
      </label>
    </div>
  );
}
