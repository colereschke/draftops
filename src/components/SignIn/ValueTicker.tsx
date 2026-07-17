import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TICKER_PLAYERS, type TickerEntry } from './tickerPlayers';

function TickerRow({ name, value, delta }: TickerEntry) {
  const Arrow = delta > 0 ? ArrowUp : ArrowDown;
  const deltaColor = delta > 0 ? 'var(--age-young)' : 'var(--age-old)';

  return (
    <div
      data-testid="ticker-row"
      className="border-border-subtle flex items-center gap-3 border-b px-6 py-2.5 text-sm"
    >
      <span data-testid="ticker-name" className="text-secondary-fg flex-1 truncate">
        {name}
      </span>
      <span className="font-mono text-foreground tabular-nums">${value}</span>
      <span
        className="flex items-center gap-0.5 font-mono text-xs tabular-nums"
        style={{ color: deltaColor }}
      >
        <Arrow className="size-3" />
        {Math.abs(delta)}
      </span>
    </div>
  );
}

interface ValueTickerProps {
  className?: string;
}

export default function ValueTicker({ className }: ValueTickerProps) {
  return (
    <div data-testid="ticker-container" className={cn('relative overflow-hidden', className)}>
      <div className="from-background pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b to-transparent md:h-14" />
      <div className="ticker-scroll">
        {TICKER_PLAYERS.map((p) => (
          <TickerRow key={`a-${p.name}`} {...p} />
        ))}
        {TICKER_PLAYERS.map((p) => (
          <TickerRow key={`b-${p.name}`} {...p} />
        ))}
      </div>
      <div className="from-background pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t to-transparent md:h-14" />
    </div>
  );
}
