/** @jest-environment node */

import { renderToString } from 'react-dom/server';
import BudgetRefresher from '@/components/BudgetPressure/BudgetRefresher';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

describe('BudgetRefresher server rendering', () => {
  it('renders without reading browser globals', () => {
    expect(() => renderToString(<BudgetRefresher />)).not.toThrow();
  });
});
