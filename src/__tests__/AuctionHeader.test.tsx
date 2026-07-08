import React from 'react';
import { render, screen } from '@testing-library/react';
import AuctionHeader from '@/components/AuctionSheet/AuctionHeader';

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
      />,
    );

    expect(screen.getByText(/20% · 2 · \$200/)).toBeInTheDocument(); // QB: 200/1000
    expect(screen.getByText(/40% · 2 · \$400/)).toBeInTheDocument(); // WR: 400/1000
  });
});
