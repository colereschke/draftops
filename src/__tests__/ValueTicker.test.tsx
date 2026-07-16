import { render, screen } from '@testing-library/react';
import ValueTicker from '@/components/SignIn/ValueTicker';
import { TICKER_PLAYERS } from '@/components/SignIn/tickerPlayers';

describe('ValueTicker', () => {
  it('renders the curated list twice for a seamless scroll loop', () => {
    render(<ValueTicker />);
    expect(screen.getAllByTestId('ticker-row')).toHaveLength(TICKER_PLAYERS.length * 2);
  });

  it('renders the first curated player name', () => {
    render(<ValueTicker />);
    expect(screen.getAllByTestId('ticker-name')[0]).toHaveTextContent(TICKER_PLAYERS[0].name);
  });
});
