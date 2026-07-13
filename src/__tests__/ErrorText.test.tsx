import { render, screen } from '@testing-library/react';
import ErrorText from '@/components/RankingsUpload/ErrorText';

describe('ErrorText', () => {
  it('renders nothing for an empty message list', () => {
    const { container } = render(<ErrorText messages={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a single message as a span', () => {
    render(<ErrorText messages={['Upload failed — please try again.']} testId="err" />);
    const el = screen.getByTestId('err');
    expect(el.tagName).toBe('SPAN');
    expect(el).toHaveTextContent('Upload failed — please try again.');
  });

  it('renders multiple messages as a list', () => {
    render(<ErrorText messages={['Row 2: bad', 'Row 3: bad']} testId="errs" />);
    const el = screen.getByTestId('errs');
    expect(el.tagName).toBe('UL');
    expect(screen.getByText('Row 2: bad')).toBeInTheDocument();
    expect(screen.getByText('Row 3: bad')).toBeInTheDocument();
  });
});
