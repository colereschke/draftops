import { render, screen } from '@testing-library/react';
import SignInPage from '@/app/sign-in/page';

const mockAuth = jest.fn();
const mockRedirect = jest.fn();

jest.mock('@/auth', () => ({
  auth: () => mockAuth(),
  signIn: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

const DEFAULT_SEARCH_PARAMS = { searchParams: Promise.resolve({}) };

describe('SignInPage', () => {
  it('renders the Discord sign-in button when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    render(await SignInPage(DEFAULT_SEARCH_PARAMS));
    expect(screen.getByRole('button', { name: /sign in with discord/i })).toBeInTheDocument();
  });

  it('renders the DraftOps wordmark', async () => {
    mockAuth.mockResolvedValue(null);
    render(await SignInPage(DEFAULT_SEARCH_PARAMS));
    expect(screen.getByText('DraftOps')).toBeInTheDocument();
  });

  it('redirects to / when already authenticated', async () => {
    mockAuth.mockResolvedValue({ user: { id: '123456789', name: 'Cole' } });
    await SignInPage(DEFAULT_SEARCH_PARAMS);
    expect(mockRedirect).toHaveBeenCalledWith('/');
  });
});
