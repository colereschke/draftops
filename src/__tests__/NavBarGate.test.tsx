import { render, screen } from '@testing-library/react';
import NavBarGate from '@/components/NavBar/NavBarGate';

const mockUsePathname = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('NavBarGate', () => {
  it('renders nothing on /sign-in', () => {
    mockUsePathname.mockReturnValue('/sign-in');
    render(
      <NavBarGate>
        <div data-testid="nav-content">nav</div>
      </NavBarGate>,
    );
    expect(screen.queryByTestId('nav-content')).not.toBeInTheDocument();
  });

  it('renders its children on other routes', () => {
    mockUsePathname.mockReturnValue('/');
    render(
      <NavBarGate>
        <div data-testid="nav-content">nav</div>
      </NavBarGate>,
    );
    expect(screen.getByTestId('nav-content')).toBeInTheDocument();
  });
});
