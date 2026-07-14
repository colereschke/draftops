import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MissingFromEtrList from '@/components/RankingsUpload/MissingFromEtrList';

describe('MissingFromEtrList', () => {
  it('renders nothing when there are no missing players', () => {
    const { container } = render(<MissingFromEtrList names={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is collapsed by default', () => {
    render(<MissingFromEtrList names={['Josh Allen', 'Bijan Robinson']} />);
    expect(screen.getByTestId('missing-from-etr-toggle')).toHaveTextContent('2');
    expect(screen.queryByTestId('missing-from-etr-items')).not.toBeInTheDocument();
  });

  it('expands to show the list and filters by search text', async () => {
    const user = userEvent.setup();
    render(<MissingFromEtrList names={['Josh Allen', 'Bijan Robinson']} />);

    await user.click(screen.getByTestId('missing-from-etr-toggle'));
    expect(screen.getByTestId('missing-from-etr-items')).toHaveTextContent('Josh Allen');
    expect(screen.getByTestId('missing-from-etr-items')).toHaveTextContent('Bijan Robinson');

    await user.type(screen.getByTestId('missing-from-etr-search'), 'bijan');
    expect(screen.getByTestId('missing-from-etr-items')).toHaveTextContent('Bijan Robinson');
    expect(screen.getByTestId('missing-from-etr-items')).not.toHaveTextContent('Josh Allen');
  });
});
