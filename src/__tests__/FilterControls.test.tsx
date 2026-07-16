import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterControls from '@/components/AuctionSheet/FilterControls';

function renderControls(overrides: Partial<React.ComponentProps<typeof FilterControls>> = {}) {
  const onPosFilterChange = jest.fn();
  const onSearchChange = jest.fn();
  const onShowNotesChange = jest.fn();
  const onAvailableOnlyChange = jest.fn();
  const onStrategyFilterChange = jest.fn();
  render(
    <FilterControls
      posFilter="ALL"
      onPosFilterChange={onPosFilterChange}
      search=""
      onSearchChange={onSearchChange}
      showNotes={false}
      onShowNotesChange={onShowNotesChange}
      availableOnly={false}
      onAvailableOnlyChange={onAvailableOnlyChange}
      resultCount={267}
      strategyFilter="ALL"
      onStrategyFilterChange={onStrategyFilterChange}
      {...overrides}
    />,
  );
  return {
    onPosFilterChange,
    onSearchChange,
    onShowNotesChange,
    onAvailableOnlyChange,
    onStrategyFilterChange,
  };
}

describe('FilterControls', () => {
  it('calls onPosFilterChange with the clicked position', async () => {
    const user = userEvent.setup();
    const { onPosFilterChange } = renderControls();

    await user.click(screen.getByRole('button', { name: 'QB' }));

    await waitFor(() => expect(onPosFilterChange).toHaveBeenCalledWith('QB'));
  });

  it('falls back to ALL when the active pill is clicked again', async () => {
    const user = userEvent.setup();
    const { onPosFilterChange } = renderControls({ posFilter: 'QB' });

    await user.click(screen.getByRole('button', { name: 'QB' }));

    await waitFor(() => expect(onPosFilterChange).toHaveBeenCalledWith('ALL'));
  });

  it('calls onSearchChange as the user types', async () => {
    const user = userEvent.setup();
    const { onSearchChange } = renderControls();

    await user.type(screen.getByPlaceholderText('Search player or team...'), 'a');

    expect(onSearchChange).toHaveBeenCalledWith('a');
  });

  it('calls onShowNotesChange when Show Notes is toggled', async () => {
    const user = userEvent.setup();
    const { onShowNotesChange } = renderControls();

    await user.click(screen.getByRole('button', { name: /show notes/i }));

    await waitFor(() => expect(onShowNotesChange).toHaveBeenCalledWith(true, expect.anything()));
  });

  it('calls onAvailableOnlyChange when Available Only is toggled', async () => {
    const user = userEvent.setup();
    const { onAvailableOnlyChange } = renderControls();

    await user.click(screen.getByRole('button', { name: /available only/i }));

    await waitFor(() =>
      expect(onAvailableOnlyChange).toHaveBeenCalledWith(true, expect.anything()),
    );
  });

  it('renders the result count', () => {
    renderControls({ resultCount: 42 });

    expect(screen.getByText('42 players shown')).toBeInTheDocument();
  });

  it('does not render strategy lens controls while lens valuation is deferred', () => {
    renderControls();

    expect(screen.queryByText('Strategy')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /contend/i })).not.toBeInTheDocument();
  });

  it('renders a year-specific package legend', () => {
    renderControls({ futurePickYear: 2027 });

    expect(screen.getByTestId('pkg-legend')).toHaveTextContent('PKG = 2027 pick package');
    expect(screen.queryByText(/next-year pick package/)).not.toBeInTheDocument();
  });
});
