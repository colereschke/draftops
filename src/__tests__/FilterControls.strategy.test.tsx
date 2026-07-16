import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterControls from '@/components/AuctionSheet/FilterControls';

const BASE_PROPS = {
  posFilter: 'ALL' as const,
  onPosFilterChange: () => {},
  search: '',
  onSearchChange: () => {},
  showNotes: false,
  onShowNotesChange: () => {},
  availableOnly: false,
  onAvailableOnlyChange: () => {},
  resultCount: 10,
  strategyFilter: 'ALL' as const,
};

describe('FilterControls archetype chips', () => {
  it('renders chips when showStrategyFilter is true', () => {
    render(<FilterControls {...BASE_PROPS} showStrategyFilter onStrategyFilterChange={() => {}} />);
    expect(screen.getByTestId('strategy-chip-WIN-NOW')).toBeInTheDocument();
    expect(screen.getByTestId('strategy-chip-FADE')).toBeInTheDocument();
  });

  it('hides chips when showStrategyFilter is false', () => {
    render(
      <FilterControls
        {...BASE_PROPS}
        showStrategyFilter={false}
        onStrategyFilterChange={() => {}}
      />,
    );
    expect(screen.queryByTestId('strategy-chip-WIN-NOW')).not.toBeInTheDocument();
  });

  it('fires onStrategyFilterChange when a chip is clicked', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FilterControls {...BASE_PROPS} showStrategyFilter onStrategyFilterChange={onChange} />);
    await user.click(screen.getByTestId('strategy-chip-WIN-NOW'));
    expect(onChange).toHaveBeenCalledWith('WIN-NOW');
  });
});
