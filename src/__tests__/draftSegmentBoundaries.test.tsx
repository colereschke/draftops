import { render, screen } from '@testing-library/react';
import ValueSheetLoading from '@/app/draft/[draftId]/loading';
import TeamsLoading from '@/app/draft/[draftId]/teams/loading';
import BudgetLoading from '@/app/draft/[draftId]/budget/loading';
import NominateLoading from '@/app/draft/[draftId]/nominate/loading';
import DraftNotFound from '@/app/draft/not-found';
import DraftError from '@/app/draft/[draftId]/error';
import TeamsError from '@/app/draft/[draftId]/teams/error';
import BudgetError from '@/app/draft/[draftId]/budget/error';
import NominateError from '@/app/draft/[draftId]/nominate/error';

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
}));

describe('draft segment loading states', () => {
  it.each([
    [ValueSheetLoading, 'Loading value sheet…'],
    [TeamsLoading, 'Loading team rosters…'],
    [BudgetLoading, 'Loading budget pressure…'],
    [NominateLoading, 'Loading nomination helper…'],
  ])('renders a status landmark with the expected label', (Component, label) => {
    render(<Component />);
    expect(screen.getByRole('status')).toHaveTextContent(label);
  });
});

describe('draft not-found state', () => {
  it('renders a tailored message with a link back to /drafts', () => {
    render(<DraftNotFound />);
    expect(screen.getByTestId('not-found-title')).toHaveTextContent('Draft not found');
    expect(screen.getByTestId('not-found-back-link')).toHaveAttribute('href', '/drafts');
  });
});

describe('draft segment error states', () => {
  it.each([
    [DraftError, 'Failed to load the value sheet'],
    [TeamsError, 'Failed to load team rosters'],
    [BudgetError, 'Failed to load budget pressure'],
    [NominateError, 'Failed to load the nomination helper'],
  ])('renders the tailored title', (Component, title) => {
    render(<Component error={new Error('boom')} reset={jest.fn()} />);
    expect(screen.getByTestId('route-error-title')).toHaveTextContent(title);
  });
});
