import { render, screen, fireEvent } from '@testing-library/react';
import FilterControls from '@/components/AuctionSheet/FilterControls';
import MissingFromEtrList from '@/components/RankingsUpload/MissingFromEtrList';

describe('search input accessible names', () => {
  it('FilterControls player/team search has an accessible name', () => {
    render(
      <FilterControls
        posFilter="ALL"
        onPosFilterChange={jest.fn()}
        search=""
        onSearchChange={jest.fn()}
        showNotes={false}
        onShowNotesChange={jest.fn()}
        availableOnly={false}
        onAvailableOnlyChange={jest.fn()}
        resultCount={0}
        strategyFilter="ALL"
        onStrategyFilterChange={jest.fn()}
      />,
    );
    expect(screen.getByRole('textbox', { name: /search player or team/i })).toBeInTheDocument();
  });

  it('MissingFromEtrList filter input has an accessible name', () => {
    render(<MissingFromEtrList names={['Foo Bar']} />);
    // The toggle button must be opened first to reveal the filter input.
    fireEvent.click(screen.getByTestId('missing-from-etr-toggle'));
    expect(
      screen.getByRole('textbox', { name: /filter missing-from-etr players/i }),
    ).toBeInTheDocument();
  });
});
