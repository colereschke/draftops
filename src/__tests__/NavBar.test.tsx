import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NavBar from '@/components/NavBar';
import type { Session } from 'next-auth';

jest.mock('@/auth', () => ({
  signOut: jest.fn(),
}));

const mockUsePathname = jest.fn();
const mockUseParams = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useParams: () => mockUseParams(),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

function mockFetchResponses({ drafts = [] as { id: number; name: string }[] } = {}) {
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/drafts') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(drafts) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUsePathname.mockReturnValue('/');
  mockUseParams.mockReturnValue({});
  mockFetchResponses();
});

const MOCK_SESSION: Session = {
  user: { id: '123456789', name: 'Cole', email: null, image: null },
  expires: '2099-01-01',
};

describe('NavBar', () => {
  it('displays the signed-in username when a session is provided', () => {
    render(<NavBar session={MOCK_SESSION} />);
    expect(screen.getByText('Cole')).toBeInTheDocument();
  });

  it('displays sign-out inside the account menu when a session is provided', async () => {
    const user = userEvent.setup();
    render(<NavBar session={MOCK_SESSION} />);

    await user.click(screen.getByRole('button', { name: /cole/i }));

    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
    });
  });

  it('does not display username or sign-out when session is null', () => {
    render(<NavBar session={null} />);
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
  });

  it('always renders the DraftOps wordmark', () => {
    render(<NavBar session={null} />);
    expect(screen.getByText('DraftOps')).toBeInTheDocument();
  });

  it('always renders the DraftOps wordmark even without nav links', () => {
    render(<NavBar session={null} />);
    expect(screen.getByText('DraftOps')).toBeInTheDocument();
  });

  it('renders a hamburger menu trigger for mobile', () => {
    render(<NavBar session={MOCK_SESSION} />);
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument();
  });

  it('opens the hamburger menu to reveal Feedback and sign out', async () => {
    const user = userEvent.setup();
    render(<NavBar session={MOCK_SESSION} />);

    await user.click(screen.getByRole('button', { name: /open menu/i }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /feedback/i })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
  });

  it('omits sign out from the hamburger menu when session is null', async () => {
    const user = userEvent.setup();
    render(<NavBar session={null} />);

    await user.click(screen.getByRole('button', { name: /open menu/i }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: /sign out/i })).not.toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /feedback/i })).toBeInTheDocument();
  });

  it('lists draft-scoped nav links in the hamburger menu when inside a draft', async () => {
    mockUseParams.mockReturnValue({ draftId: '1' });
    mockUsePathname.mockReturnValue('/draft/1/teams');
    mockFetchResponses({ drafts: [{ id: 1, name: "Cole's Draft" }] });
    const user = userEvent.setup();
    render(<NavBar session={MOCK_SESSION} />);

    await user.click(screen.getByRole('button', { name: /open menu/i }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Team Rosters' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Value Sheet' })).toBeInTheDocument();
  });

  it('links to /rankings from the account dropdown', async () => {
    const user = userEvent.setup();
    render(<NavBar session={MOCK_SESSION} />);

    await user.click(screen.getByRole('button', { name: /cole/i }));

    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: /rankings/i })).toHaveAttribute(
        'href',
        '/rankings',
      );
    });
  });

  it('links to /rankings from the mobile hamburger menu', async () => {
    const user = userEvent.setup();
    render(<NavBar session={MOCK_SESSION} />);

    await user.click(screen.getByRole('button', { name: /open menu/i }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /rankings/i })).toHaveAttribute(
      'href',
      '/rankings',
    );
  });

  it('links the logo back to home', () => {
    render(<NavBar session={null} />);
    expect(screen.getByTestId('nav-logo-link')).toHaveAttribute('href', '/');
  });
});
