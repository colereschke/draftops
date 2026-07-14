import React from 'react';
import { render, screen } from '@testing-library/react';
import AuctionHeader from '@/components/AuctionSheet/AuctionHeader';
import { DEFAULT_SCORING_SETTINGS } from '@/types';

const POS_STATS = {
  QB: { count: 2, total: 200 },
  RB: { count: 2, total: 300 },
  WR: { count: 2, total: 400 },
  TE: { count: 1, total: 100 },
};

describe('AuctionHeader', () => {
  it('renders budget, spent, and remaining dollar values', () => {
    render(
      <AuctionHeader
        ownerBudget={1000}
        mySpent={250}
        remaining={750}
        posStats={POS_STATS}
        grandTotal={1000}
        totalPlayerCount={267}
        scoringSettings={{ ...DEFAULT_SCORING_SETTINGS }}
      />,
    );

    expect(screen.getByText('$1000')).toBeInTheDocument();
    expect(screen.getByText('$250')).toBeInTheDocument();
    expect(screen.getByText('$750')).toBeInTheDocument();
  });

  it('renders the total player count in the subtitle', () => {
    render(
      <AuctionHeader
        ownerBudget={1000}
        mySpent={0}
        remaining={1000}
        posStats={POS_STATS}
        grandTotal={1000}
        totalPlayerCount={267}
        scoringSettings={{ ...DEFAULT_SCORING_SETTINGS }}
      />,
    );

    expect(screen.getByText(/267 players/)).toBeInTheDocument();
  });

  it('renders a market-weight segment for each of QB/RB/WR/TE', () => {
    render(
      <AuctionHeader
        ownerBudget={1000}
        mySpent={0}
        remaining={1000}
        posStats={POS_STATS}
        grandTotal={1000}
        totalPlayerCount={267}
        scoringSettings={{ ...DEFAULT_SCORING_SETTINGS }}
      />,
    );

    expect(screen.getByText(/20% · 2 · \$200/)).toBeInTheDocument(); // QB: 200/1000
    expect(screen.getByText(/40% · 2 · \$400/)).toBeInTheDocument(); // WR: 400/1000
  });
});

describe('AuctionHeader — TE caption', () => {
  it('omits the TE clause entirely for default scoring settings', () => {
    render(
      <AuctionHeader
        ownerBudget={1000}
        mySpent={0}
        remaining={1000}
        posStats={POS_STATS}
        grandTotal={1000}
        totalPlayerCount={267}
        scoringSettings={{ ...DEFAULT_SCORING_SETTINGS }}
      />,
    );
    expect(screen.queryByText(/TE PPR/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1st Down/)).not.toBeInTheDocument();
  });

  it('shows only the PPR clause when only pprTE differs from pprWR', () => {
    render(
      <AuctionHeader
        ownerBudget={1000}
        mySpent={0}
        remaining={1000}
        posStats={POS_STATS}
        grandTotal={1000}
        totalPlayerCount={267}
        scoringSettings={{ ...DEFAULT_SCORING_SETTINGS, pprTE: 2 }}
      />,
    );
    expect(screen.getByText(/TE PPR\+1/)).toBeInTheDocument();
    expect(screen.queryByText(/1st Down/)).not.toBeInTheDocument();
  });

  it('omits the TE first-down clause when only the all-position receiving first-down bonus differs', () => {
    render(
      <AuctionHeader
        ownerBudget={1000}
        mySpent={0}
        remaining={1000}
        posStats={POS_STATS}
        grandTotal={1000}
        totalPlayerCount={267}
        scoringSettings={{ ...DEFAULT_SCORING_SETTINGS, recFD: 0.25 }}
      />,
    );
    expect(screen.queryByText(/TE PPR/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1st Down/)).not.toBeInTheDocument();
  });

  it('shows only the 1st down clause when only the TE first-down bonus differs', () => {
    render(
      <AuctionHeader
        ownerBudget={1000}
        mySpent={0}
        remaining={1000}
        posStats={POS_STATS}
        grandTotal={1000}
        totalPlayerCount={267}
        scoringSettings={{ ...DEFAULT_SCORING_SETTINGS, teFDBonus: 0.25 }}
      />,
    );
    expect(screen.queryByText(/TE PPR/)).not.toBeInTheDocument();
    expect(screen.getByText(/TE 1st Down\+0\.25/)).toBeInTheDocument();
  });

  it('shows both clauses joined with a slash when both differ', () => {
    render(
      <AuctionHeader
        ownerBudget={1000}
        mySpent={0}
        remaining={1000}
        posStats={POS_STATS}
        grandTotal={1000}
        totalPlayerCount={267}
        scoringSettings={{ ...DEFAULT_SCORING_SETTINGS, pprTE: 2, teFDBonus: 0.25 }}
      />,
    );
    expect(screen.getByText(/TE PPR\+1 \/ 1st Down\+0\.25/)).toBeInTheDocument();
  });
});
