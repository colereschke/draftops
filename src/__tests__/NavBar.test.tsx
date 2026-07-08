import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NavBar from '@/components/NavBar';
import type { Session } from 'next-auth';

jest.mock('@/auth', () => ({
  signOut: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useParams: () => ({}),
}));

global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

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
});
