import { render, screen } from '@testing-library/react';
import NavLinks from '@/components/NavBar/NavLinks';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

import { usePathname } from 'next/navigation';
const mockUsePathname = usePathname as jest.Mock;

describe('NavLinks', () => {
  it('renders all nav links', () => {
    mockUsePathname.mockReturnValue('/');
    render(<NavLinks />);
    expect(screen.getByText('Value Sheet')).toBeInTheDocument();
    expect(screen.getByText('Team Rosters')).toBeInTheDocument();
    expect(screen.getByText('Budget Pressure')).toBeInTheDocument();
  });

  it('highlights the active route', () => {
    mockUsePathname.mockReturnValue('/budget');
    render(<NavLinks />);
    const active = screen.getByText('Budget Pressure').closest('a');
    const inactive = screen.getByText('Value Sheet').closest('a');
    expect(active).toHaveStyle({ color: '#e8a030' });
    expect(inactive).toHaveStyle({ color: '#4a5168' });
  });

  it('highlights value sheet when on root', () => {
    mockUsePathname.mockReturnValue('/');
    render(<NavLinks />);
    const active = screen.getByText('Value Sheet').closest('a');
    expect(active).toHaveStyle({ color: '#e8a030' });
  });
});
