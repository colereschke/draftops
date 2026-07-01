import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import NewDraftPage from '@/app/drafts/new/page';

jest.mock('@/lib/actions', () => ({
  createDraft: jest.fn(),
}));

describe('NewDraftPage — roster settings and lineup', () => {
  it('renders the roster size input with default 30', () => {
    render(<NewDraftPage />);
    const input = screen.getByTestId<HTMLInputElement>('roster-size-input');
    expect(input.value).toBe('30');
  });

  it('renders target roster inputs for all four positions', () => {
    render(<NewDraftPage />);
    expect(screen.getByTestId<HTMLInputElement>('target-roster-QB').value).toBe('4');
    expect(screen.getByTestId<HTMLInputElement>('target-roster-RB').value).toBe('9');
    expect(screen.getByTestId<HTMLInputElement>('target-roster-WR').value).toBe('11');
    expect(screen.getByTestId<HTMLInputElement>('target-roster-TE').value).toBe('3');
  });

  it('renders 10 starting lineup slots by default', () => {
    render(<NewDraftPage />);
    const slots = screen.getAllByTestId(/^lineup-slot-\d+$/);
    expect(slots).toHaveLength(10);
  });

  it('first slot defaults to QB and last slot defaults to SUPER_FLEX', () => {
    render(<NewDraftPage />);
    expect(screen.getByTestId<HTMLSelectElement>('lineup-slot-0').value).toBe('QB');
    expect(screen.getByTestId<HTMLSelectElement>('lineup-slot-9').value).toBe('SUPER_FLEX');
  });

  it('adds a FLEX slot when Add slot is clicked', () => {
    render(<NewDraftPage />);
    fireEvent.click(screen.getByTestId('add-lineup-slot'));
    const slots = screen.getAllByTestId(/^lineup-slot-\d+$/);
    expect(slots).toHaveLength(11);
    expect(screen.getByTestId<HTMLSelectElement>('lineup-slot-10').value).toBe('FLEX');
  });

  it('removes the correct slot when × is clicked', () => {
    render(<NewDraftPage />);
    // Remove slot 0 (QB)
    fireEvent.click(screen.getByTestId('remove-lineup-slot-0'));
    const slots = screen.getAllByTestId(/^lineup-slot-\d+$/);
    expect(slots).toHaveLength(9);
    // Slot 0 should now be what was previously slot 1 (RB)
    expect(screen.getByTestId<HTMLSelectElement>('lineup-slot-0').value).toBe('RB');
  });

  it('changes slot type when a different option is selected', () => {
    render(<NewDraftPage />);
    fireEvent.change(screen.getByTestId('lineup-slot-0'), { target: { value: 'SUPER_FLEX' } });
    expect(screen.getByTestId<HTMLSelectElement>('lineup-slot-0').value).toBe('SUPER_FLEX');
  });
});

describe('NewDraftPage — scoring settings', () => {
  it('renders passing yards per point input with default 25', () => {
    render(<NewDraftPage />);
    const input = screen.getByTestId<HTMLInputElement>('scoring-passYdsPerPoint');
    expect(input.value).toBe('25');
  });

  it('renders passing TD input with default 4', () => {
    render(<NewDraftPage />);
    const input = screen.getByTestId<HTMLInputElement>('scoring-passTD');
    expect(input.value).toBe('4');
  });

  it('renders all PPR inputs defaulting to 1', () => {
    render(<NewDraftPage />);
    expect(screen.getByTestId<HTMLInputElement>('scoring-pprRB').value).toBe('1');
    expect(screen.getByTestId<HTMLInputElement>('scoring-pprWR').value).toBe('1');
    expect(screen.getByTestId<HTMLInputElement>('scoring-pprTE').value).toBe('1');
  });
});

describe('NewDraftPage — lineup validation', () => {
  it('shows error when submitting with no QB or SUPER_FLEX slot', () => {
    render(<NewDraftPage />);
    // Change slot 0 from QB to RB
    fireEvent.change(screen.getByTestId('lineup-slot-0'), { target: { value: 'RB' } });
    // Change slot 9 from SUPER_FLEX to FLEX
    fireEvent.change(screen.getByTestId('lineup-slot-9'), { target: { value: 'FLEX' } });
    // Provide draft name to pass earlier validations
    fireEvent.change(screen.getByTestId('draft-name-input'), {
      target: { value: 'Test Draft' },
    });
    fireEvent.submit(screen.getByTestId('new-draft-form'));
    expect(screen.getByText(/at least one QB or SUPER_FLEX/i)).toBeInTheDocument();
  });
});
