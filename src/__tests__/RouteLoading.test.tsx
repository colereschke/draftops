import { render, screen } from '@testing-library/react';
import RouteLoading from '@/components/RouteLoading';

describe('RouteLoading', () => {
  it('renders exactly one status landmark announcing the given label', () => {
    render(<RouteLoading label="Loading value sheet…" />);
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveAttribute('id', 'main-content');
    expect(statuses[0]).toHaveTextContent('Loading value sheet…');
  });
});
