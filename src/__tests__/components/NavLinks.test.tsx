import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NavLinks from '@/components/NavBar/NavLinks';

// Must be declared before import to satisfy jest.mock hoisting
const mockUsePathname = jest.fn();
const mockUseParams = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useParams: () => mockUseParams(),
}));

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

function mockFetchResponses({
  drafts = [{ id: 1, name: "Cole's Draft 2025" }],
  info = { id: 1, name: "Cole's Draft 2025", status: 'ACTIVE' },
}: {
  drafts?: { id: number; name: string }[];
  info?: { id: number; name: string; status: string };
} = {}) {
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/drafts') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(drafts) });
    }
    if (url.includes('/info')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(info) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUsePathname.mockReturnValue('/draft/1');
  mockUseParams.mockReturnValue({ draftId: '1' });
  mockFetchResponses();
});

describe('NavLinks — without draftId', () => {
  it('renders no nav links when not inside a draft', () => {
    mockUseParams.mockReturnValue({});
    render(<NavLinks />);
    expect(screen.queryByText('Value Sheet')).not.toBeInTheDocument();
    expect(screen.queryByText('Team Rosters')).not.toBeInTheDocument();
  });
});

describe('NavLinks — with draftId', () => {
  it('renders all four draft-scoped nav links', async () => {
    render(<NavLinks />);
    await waitFor(() => {
      expect(screen.getByText('Value Sheet')).toBeInTheDocument();
      expect(screen.getByText('Team Rosters')).toBeInTheDocument();
      expect(screen.getByText('Budget Pressure')).toBeInTheDocument();
      expect(screen.getByText('Nominate')).toBeInTheDocument();
    });
  });

  it('links point to the correct draft-scoped paths', async () => {
    render(<NavLinks />);
    await waitFor(() => {
      expect(screen.getByText('Value Sheet').closest('a')).toHaveAttribute('href', '/draft/1');
      expect(screen.getByText('Team Rosters').closest('a')).toHaveAttribute(
        'href',
        '/draft/1/teams',
      );
    });
  });

  it('highlights the active route', async () => {
    mockUsePathname.mockReturnValue('/draft/1/teams');
    render(<NavLinks />);
    await waitFor(() => {
      const active = screen.getByText('Team Rosters').closest('a');
      const inactive = screen.getByText('Value Sheet').closest('a');
      expect(active).toHaveStyle({ color: '#e8eaf0' });
      expect(inactive).toHaveStyle({ color: '#4a5168' });
    });
  });

  it('shows the current draft name in the switcher chip', async () => {
    render(<NavLinks />);
    await waitFor(() => {
      expect(screen.getByText(/Cole's Draft 2025/)).toBeInTheDocument();
    });
  });

  it('opens dropdown and shows other drafts + All Drafts link', async () => {
    const user = userEvent.setup();
    mockFetchResponses({
      drafts: [
        { id: 1, name: "Cole's Draft 2025" },
        { id: 2, name: 'Other Draft' },
      ],
      info: { id: 1, name: "Cole's Draft 2025", status: 'ACTIVE' },
    });
    render(<NavLinks />);
    await waitFor(() => screen.getByText(/Cole's Draft 2025/));
    await act(async () => {
      await user.click(screen.getByRole('button'));
    });
    expect(screen.getByText('Other Draft')).toBeInTheDocument();
    expect(screen.getByText('All Drafts')).toBeInTheDocument();
    // Current draft should NOT appear in the dropdown
    // There's one nav link (Value Sheet goes to /draft/1) but the chip label text
    // is in a button; the dropdown list should only show other drafts.
    expect(screen.getAllByText("Cole's Draft 2025").length).toBe(1); // only the chip
  });
});
