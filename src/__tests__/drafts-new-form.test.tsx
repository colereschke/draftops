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
