import { render, screen } from '@testing-library/react';
import { Button } from '../button';

describe('Button touch size variant', () => {
  it('the "touch" size renders a 44px-tall control', () => {
    render(<Button size="touch">Tap me</Button>);
    expect(screen.getByRole('button', { name: 'Tap me' })).toHaveClass('h-11');
  });
});
