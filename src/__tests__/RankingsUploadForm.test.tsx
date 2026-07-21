import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RankingsUploadForm from '@/components/RankingsUpload/RankingsUploadForm';

const mockUpload = jest.fn();
jest.mock('@/lib/rankings-actions', () => ({
  uploadRankingsCsv: (...args: unknown[]) => mockUpload(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

function makeFile(contents: string, name = 'rankings.csv') {
  return new File([contents], name, { type: 'text/csv' });
}

describe('RankingsUploadForm', () => {
  it('shows upload prompt with no existing summary', () => {
    render(<RankingsUploadForm summary={null} />);
    expect(screen.getByTestId('rankings-upload-button')).toHaveTextContent('Upload CSV');
  });

  it('documents required and optional columns in the empty state', () => {
    render(<RankingsUploadForm summary={null} />);
    const legend = screen.getByTestId('rankings-column-legend');
    expect(legend).toHaveTextContent('Player, Team');
    expect(legend).toHaveTextContent('2QBAuction');
    expect(screen.getByText(/SF\/TE Prem/)).toBeInTheDocument();
  });

  it('links to the downloadable template CSV', () => {
    render(<RankingsUploadForm summary={null} />);
    const link = screen.getByTestId('rankings-template-link');
    expect(link).toHaveAttribute('href', '/rankings-template.csv');
  });

  it('shows the summary card when a ranking set exists', () => {
    render(
      <RankingsUploadForm
        summary={{
          fileName: 'my_rankings.csv',
          uploadedAt: '2026-07-01T00:00:00.000Z',
          totalCount: 267,
          matchedCount: 260,
          unmatchedCount: 7,
          etrCoverage: { covered: 300, total: 327 },
        }}
      />,
    );
    expect(screen.getByTestId('rankings-summary')).toHaveTextContent('267');
    expect(screen.getByTestId('rankings-upload-button')).toHaveTextContent('Re-upload CSV');
    expect(screen.getByTestId('rankings-etr-coverage')).toHaveTextContent(
      'Covers 300 of 327 ETR-ranked players',
    );
  });

  it('uploads the selected file and shows no errors on success', async () => {
    mockUpload.mockResolvedValue({ ok: true });
    render(<RankingsUploadForm summary={null} />);
    const input = screen.getByTestId('rankings-upload-button').querySelector('input')!;
    const user = userEvent.setup();

    await user.upload(
      input,
      makeFile('Player,Team,Position,Age,2QBAuction\nJosh Allen,BUF,QB,30.1,$51'),
    );

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledWith(
        'rankings.csv',
        'Player,Team,Position,Age,2QBAuction\nJosh Allen,BUF,QB,30.1,$51',
      );
    });
    expect(screen.queryByTestId('rankings-upload-errors')).not.toBeInTheDocument();
  });

  it('displays returned errors without throwing', async () => {
    mockUpload.mockResolvedValue({ ok: false, errors: ['Missing required column(s): Age'] });
    render(<RankingsUploadForm summary={null} />);
    const input = screen.getByTestId('rankings-upload-button').querySelector('input')!;
    const user = userEvent.setup();

    await user.upload(input, makeFile('Player,Team\nJosh Allen,BUF'));

    expect(await screen.findByTestId('rankings-upload-errors')).toHaveTextContent(
      'Missing required column(s): Age',
    );
  });

  it('shows a generic error and resets the file input when the upload throws', async () => {
    mockUpload.mockRejectedValue(new Error('Unauthorized'));
    render(<RankingsUploadForm summary={null} />);
    const input = screen
      .getByTestId('rankings-upload-button')
      .querySelector('input')! as HTMLInputElement;
    const user = userEvent.setup();

    await user.upload(
      input,
      makeFile('Player,Team,Position,Age,2QBAuction\nJosh Allen,BUF,QB,30.1,$51'),
    );

    expect(await screen.findByTestId('rankings-upload-errors')).toHaveTextContent(
      'Upload failed — please try again.',
    );
    expect(input.value).toBe('');
  });

  it('announces a successful upload through the shared live region', async () => {
    mockUpload.mockResolvedValue({ ok: true });
    render(<RankingsUploadForm summary={null} />);
    const input = screen.getByTestId('rankings-upload-button').querySelector('input')!;
    const user = userEvent.setup();

    await user.upload(
      input,
      makeFile('Player,Team,Position,Age,2QBAuction\nJosh Allen,BUF,QB,30.1,$51'),
    );

    await waitFor(() => {
      expect(screen.getByTestId('mutation-status')).toHaveTextContent(/uploaded successfully/i);
    });
  });

  it('announces a failed upload through the shared live region', async () => {
    mockUpload.mockResolvedValue({ ok: false, errors: ['Missing required column(s): Age'] });
    render(<RankingsUploadForm summary={null} />);
    const input = screen.getByTestId('rankings-upload-button').querySelector('input')!;
    const user = userEvent.setup();

    await user.upload(input, makeFile('Player,Team\nJosh Allen,BUF'));

    await waitFor(() => {
      expect(screen.getByTestId('mutation-status')).toHaveTextContent(
        /missing required column\(s\): age/i,
      );
    });
  });
});
