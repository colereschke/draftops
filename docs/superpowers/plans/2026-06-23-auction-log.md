# Live Auction Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users log completed auction bids during a live draft, persisting them to SQLite and immediately reflecting claimed players in the value sheet.

**Architecture:** `page.tsx` (server component) fetches claimed bids + league teams from the DB in parallel and passes them as props to `AuctionSheet`. The `AuctionSheet` client component merges the `players` array with claimed bids via a `Map` for O(1) lookups, shows a "Claimed" column for logged bids, and delegates mutations to three server actions (`logBid`, `updateBid`, `deleteBid`). Optimistic updates via `useOptimistic` give instant feedback during a live auction.

**Tech Stack:** Next.js 16 App Router, React 19 (`useOptimistic`, `useTransition`), Prisma 7 + SQLite, TypeScript strict mode, Jest + React Testing Library

## Global Constraints

- Use `pnpm` — never `npm` or `yarn`
- Single quotes, trailing commas, 2-space indent, 100 char line width (enforced by Prettier on commit)
- No `any` types (ESLint warns); no unused vars (ESLint errors)
- Pre-commit hook runs lint-staged + `tsc --noEmit` — do not skip with `--no-verify`
- Prisma v7: PrismaClient constructed with `@prisma/adapter-better-sqlite3` adapter (already in `src/lib/db.ts`) — never instantiate PrismaClient directly
- Import alias `@/` maps to `src/`

---

## File Map

| File                                           | Status | Responsibility                                                    |
| ---------------------------------------------- | ------ | ----------------------------------------------------------------- |
| `src/types/index.ts`                           | Modify | Add `ClaimedBid` and `LeagueTeam` types                           |
| `src/lib/actions.ts`                           | Create | Server actions: `logBid`, `updateBid`, `deleteBid`                |
| `src/__tests__/actions.test.ts`                | Create | Unit tests for server actions                                     |
| `src/app/page.tsx`                             | Modify | Async server component; fetch bids + teams; pass as props         |
| `src/components/BidModal/BidModal.tsx`         | Create | Modal for logging / editing a bid                                 |
| `src/components/BidModal/index.ts`             | Create | Barrel export                                                     |
| `src/__tests__/BidModal.test.tsx`              | Create | RTL tests for BidModal                                            |
| `src/components/AuctionSheet/AuctionSheet.tsx` | Modify | Accept props; claimed column; row click → modal; optimistic state |
| `src/__tests__/AuctionSheet.claimed.test.tsx`  | Create | RTL tests for claimed-bid rendering                               |

---

## Task 1: Types + Server Actions

**Files:**

- Modify: `src/types/index.ts`
- Create: `src/lib/actions.ts`
- Create: `src/__tests__/actions.test.ts`

**Interfaces:**

- Produces:
  - `ClaimedBid` — slim bid record passed across the RSC boundary
  - `LeagueTeam` — team record used by the BidModal dropdown
  - `logBid(data)`, `updateBid(data)`, `deleteBid(data)` — server actions consumed by AuctionSheet

---

- [ ] **Step 1: Add types to `src/types/index.ts`**

Append after the existing `AuctionResultEntry` interface:

```ts
export interface ClaimedBid {
  id: number;
  player: string;
  position: string;
  price: number;
  teamId: number;
  teamHandle: string;
}

export interface LeagueTeam {
  id: number;
  handle: string;
  displayName: string | null;
}
```

- [ ] **Step 2: Write failing tests for server actions**

Create `src/__tests__/actions.test.ts`:

```ts
import { logBid, updateBid, deleteBid } from '@/lib/actions';

const mockCreate = jest.fn().mockResolvedValue({});
const mockUpdate = jest.fn().mockResolvedValue({});
const mockDelete = jest.fn().mockResolvedValue({});
const mockRevalidatePath = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    auctionResult: {
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
}));

jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('logBid', () => {
  it('inserts a bid record with all fields', async () => {
    await logBid({
      player: 'Josh Allen',
      position: 'QB',
      nflTeam: 'BUF',
      price: 120,
      sfRank: 1,
      teamId: 3,
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        player: 'Josh Allen',
        position: 'QB',
        nflTeam: 'BUF',
        price: 120,
        sfRank: 1,
        teamId: 3,
      },
    });
  });

  it('calls revalidatePath after insert', async () => {
    await logBid({
      player: 'Josh Allen',
      position: 'QB',
      nflTeam: 'BUF',
      price: 120,
      sfRank: 1,
      teamId: 3,
    });

    expect(mockRevalidatePath).toHaveBeenCalledWith('/');
  });
});

describe('updateBid', () => {
  it('updates price and teamId for the given id', async () => {
    await updateBid({ id: 5, price: 95, teamId: 2 });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { price: 95, teamId: 2 },
    });
  });

  it('calls revalidatePath after update', async () => {
    await updateBid({ id: 5, price: 95, teamId: 2 });

    expect(mockRevalidatePath).toHaveBeenCalledWith('/');
  });
});

describe('deleteBid', () => {
  it('deletes the record for the given id', async () => {
    await deleteBid({ id: 7 });

    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 7 } });
  });

  it('calls revalidatePath after delete', async () => {
    await deleteBid({ id: 7 });

    expect(mockRevalidatePath).toHaveBeenCalledWith('/');
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
pnpm test src/__tests__/actions.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/actions'`

- [ ] **Step 4: Create `src/lib/actions.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';

export async function logBid(data: {
  player: string;
  position: string;
  nflTeam: string;
  price: number;
  sfRank: number | null;
  teamId: number;
}): Promise<void> {
  await prisma.auctionResult.create({
    data: {
      player: data.player,
      position: data.position,
      nflTeam: data.nflTeam,
      price: data.price,
      sfRank: data.sfRank,
      teamId: data.teamId,
    },
  });
  revalidatePath('/');
}

export async function updateBid(data: {
  id: number;
  price: number;
  teamId: number;
}): Promise<void> {
  await prisma.auctionResult.update({
    where: { id: data.id },
    data: { price: data.price, teamId: data.teamId },
  });
  revalidatePath('/');
}

export async function deleteBid(data: { id: number }): Promise<void> {
  await prisma.auctionResult.delete({ where: { id: data.id } });
  revalidatePath('/');
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
pnpm test src/__tests__/actions.test.ts
```

Expected: 6 tests pass, 0 failures

- [ ] **Step 6: Run full quality gate**

```bash
pnpm check
```

Expected: typecheck, lint, format, and all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/lib/actions.ts src/__tests__/actions.test.ts
git commit -m "feat: add ClaimedBid/LeagueTeam types and server actions for auction log"
```

---

## Task 2: Update page.tsx to fetch claimed bids and teams

**Files:**

- Modify: `src/app/page.tsx`

**Interfaces:**

- Consumes: `ClaimedBid`, `LeagueTeam` from `@/types`; `prisma` from `@/lib/db`
- Produces: `claimedBids: ClaimedBid[]` and `teams: LeagueTeam[]` props passed to `<AuctionSheet />`

Note: `AuctionSheet` does not yet accept these props — Task 4 adds that. After this task the page will have a TypeScript error until Task 4 is complete. That is expected; run typecheck only after Task 4.

---

- [ ] **Step 1: Rewrite `src/app/page.tsx`**

```tsx
import { prisma } from '@/lib/db';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import type { ClaimedBid, LeagueTeam } from '@/types';

export default async function Home() {
  const [rawBids, teams] = await Promise.all([
    prisma.auctionResult.findMany({
      select: {
        id: true,
        player: true,
        position: true,
        price: true,
        teamId: true,
        team: { select: { handle: true } },
      },
    }),
    prisma.team.findMany({
      select: { id: true, handle: true, displayName: true },
      orderBy: { handle: 'asc' },
    }),
  ]);

  const claimedBids: ClaimedBid[] = rawBids.map((r) => ({
    id: r.id,
    player: r.player,
    position: r.position,
    price: r.price,
    teamId: r.teamId,
    teamHandle: r.team.handle,
  }));

  const leagueTeams: LeagueTeam[] = teams;

  return <AuctionSheet claimedBids={claimedBids} teams={leagueTeams} />;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: fetch claimed bids and teams in page.tsx server component"
```

---

## Task 3: BidModal component

**Files:**

- Create: `src/components/BidModal/BidModal.tsx`
- Create: `src/components/BidModal/index.ts`
- Create: `src/__tests__/BidModal.test.tsx`

**Interfaces:**

- Consumes: `ClaimedBid`, `LeagueTeam`, `Player` from `@/types`
- Produces:
  ```ts
  interface BidModalProps {
    player: Player;
    teams: LeagueTeam[];
    existingBid?: ClaimedBid;
    onClose: () => void;
    onSubmit: (data: { price: number; teamId: number }) => void;
    onDelete?: () => void;
  }
  ```

---

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/BidModal.test.tsx`:

```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BidModal from '@/components/BidModal/BidModal';
import type { Player, ClaimedBid, LeagueTeam } from '@/types';

const mockPlayer: Player = {
  player: 'Josh Allen',
  team: 'BUF',
  pos: 'QB',
  age: 28,
  sfRank: 1,
  budget: 120,
  ceiling: 138,
  floor: 104,
  notes: '',
};

const mockTeams: LeagueTeam[] = [
  { id: 1, handle: 'coreschke', displayName: 'Cole' },
  { id: 2, handle: 'chappy72', displayName: null },
];

const mockExistingBid: ClaimedBid = {
  id: 10,
  player: 'Josh Allen',
  position: 'QB',
  price: 115,
  teamId: 1,
  teamHandle: 'coreschke',
};

describe('BidModal — add mode', () => {
  it('displays the player name and position', () => {
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={jest.fn()} />,
    );

    expect(screen.getByText('Josh Allen')).toBeInTheDocument();
    expect(screen.getByText('QB')).toBeInTheDocument();
  });

  it('calls onSubmit with price and teamId when submitted', () => {
    const onSubmit = jest.fn();
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={onSubmit} />,
    );

    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '110' } });
    fireEvent.change(screen.getByLabelText('Won By'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /log bid/i }));

    expect(onSubmit).toHaveBeenCalledWith({ price: 110, teamId: 2 });
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = jest.fn();
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={onClose} onSubmit={jest.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = jest.fn();
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={onClose} onSubmit={jest.fn()} />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('does not show a Remove button in add mode', () => {
    render(
      <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={jest.fn()} />,
    );

    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });
});

describe('BidModal — edit mode', () => {
  it('pre-fills price from existingBid', () => {
    render(
      <BidModal
        player={mockPlayer}
        teams={mockTeams}
        existingBid={mockExistingBid}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );

    expect(screen.getByLabelText<HTMLInputElement>('Price').value).toBe('115');
  });

  it('shows a Remove button in edit mode', () => {
    render(
      <BidModal
        player={mockPlayer}
        teams={mockTeams}
        existingBid={mockExistingBid}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it('calls onDelete when Remove is clicked', () => {
    const onDelete = jest.fn();
    render(
      <BidModal
        player={mockPlayer}
        teams={mockTeams}
        existingBid={mockExistingBid}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    expect(onDelete).toHaveBeenCalled();
  });

  it('shows "Update Bid" as the submit label in edit mode', () => {
    render(
      <BidModal
        player={mockPlayer}
        teams={mockTeams}
        existingBid={mockExistingBid}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /update bid/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm test src/__tests__/BidModal.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/BidModal/BidModal'`

- [ ] **Step 3: Create `src/components/BidModal/BidModal.tsx`**

```tsx
'use client';

import { useState, useEffect } from 'react';
import type { Player, ClaimedBid, LeagueTeam } from '@/types';

interface BidModalProps {
  player: Player;
  teams: LeagueTeam[];
  existingBid?: ClaimedBid;
  onClose: () => void;
  onSubmit: (data: { price: number; teamId: number }) => void;
  onDelete?: () => void;
}

export default function BidModal({
  player,
  teams,
  existingBid,
  onClose,
  onSubmit,
  onDelete,
}: BidModalProps) {
  const isEdit = !!existingBid;
  const [price, setPrice] = useState<string>(existingBid ? String(existingBid.price) : '');
  const [teamId, setTeamId] = useState<number>(existingBid?.teamId ?? teams[0]?.id ?? 0);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function handleSubmit() {
    const p = Number(price);
    if (!price || isNaN(p) || p <= 0) {
      setError('Enter a valid price.');
      return;
    }
    if (!teamId) {
      setError('Select a team.');
      return;
    }
    setError('');
    onSubmit({ price: p, teamId });
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#141824',
          border: '1px solid #2a3048',
          borderRadius: 10,
          padding: '24px 28px',
          width: 360,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* Header */}
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: 2,
              color: '#4a5168',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-barlow), sans-serif',
              marginBottom: 4,
            }}
          >
            {isEdit ? 'Edit Bid' : 'Log Bid'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e8eaf0' }}>{player.player}</div>
          <div style={{ fontSize: 12, color: '#4a5168', marginTop: 2 }}>
            <span style={{ color: '#8892a4' }}>{player.pos}</span>
            {' · '}
            {player.team}
            {' · '}
            Target:{' '}
            <span style={{ fontFamily: 'var(--font-mono), monospace' }}>${player.budget}</span>
          </div>
        </div>

        {/* Price */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            htmlFor="bid-price"
            style={{
              fontSize: 10,
              letterSpacing: 1,
              color: '#4a5168',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-barlow), sans-serif',
            }}
          >
            Price
          </label>
          <input
            id="bid-price"
            aria-label="Price"
            type="number"
            min={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            autoFocus
            style={{
              background: '#1a1f2e',
              border: '1px solid #2a3048',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 16,
              fontWeight: 700,
              color: '#e8eaf0',
              outline: 'none',
              fontFamily: 'var(--font-mono), monospace',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Won By */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            htmlFor="bid-team"
            style={{
              fontSize: 10,
              letterSpacing: 1,
              color: '#4a5168',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-barlow), sans-serif',
            }}
          >
            Won By
          </label>
          <select
            id="bid-team"
            aria-label="Won By"
            value={teamId}
            onChange={(e) => setTeamId(Number(e.target.value))}
            style={{
              background: '#1a1f2e',
              border: '1px solid #2a3048',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 13,
              color: '#e8eaf0',
              outline: 'none',
              width: '100%',
              cursor: 'pointer',
            }}
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName ?? t.handle} ({t.handle})
              </option>
            ))}
          </select>
        </div>

        {error && <div style={{ fontSize: 11, color: '#e05050' }}>{error}</div>}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          {isEdit && onDelete && (
            <button
              onClick={onDelete}
              style={{
                marginRight: 'auto',
                padding: '7px 14px',
                borderRadius: 6,
                border: '1px solid #e05050',
                background: 'transparent',
                color: '#e05050',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Remove
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '7px 14px',
              borderRadius: 6,
              border: '1px solid #2a3048',
              background: 'transparent',
              color: '#4a5168',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: 'none',
              background: '#4f83e8',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isEdit ? 'Update Bid' : 'Log Bid'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/components/BidModal/index.ts`**

```ts
export { default } from './BidModal';
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
pnpm test src/__tests__/BidModal.test.tsx
```

Expected: 8 tests pass, 0 failures

- [ ] **Step 6: Run full quality gate**

```bash
pnpm check
```

Expected: all checks pass (ignore the page.tsx prop mismatch — it's resolved in Task 4)

- [ ] **Step 7: Commit**

```bash
git add src/components/BidModal/BidModal.tsx src/components/BidModal/index.ts src/__tests__/BidModal.test.tsx
git commit -m "feat: add BidModal component for logging and editing auction bids"
```

---

## Task 4: AuctionSheet — claimed bids integration

**Files:**

- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`
- Create: `src/__tests__/AuctionSheet.claimed.test.tsx`

**Interfaces:**

- Consumes:
  - `ClaimedBid`, `LeagueTeam` from `@/types`
  - `logBid`, `updateBid`, `deleteBid` from `@/lib/actions`
  - `BidModal` from `@/components/BidModal`
- New props for `AuctionSheet`:
  ```ts
  interface AuctionSheetProps {
    claimedBids: ClaimedBid[];
    teams: LeagueTeam[];
  }
  ```

---

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/AuctionSheet.claimed.test.tsx`:

```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import type { ClaimedBid, LeagueTeam } from '@/types';

jest.mock('@/data/players', () => ({
  players: [
    {
      player: 'Josh Allen',
      team: 'BUF',
      pos: 'QB',
      age: 28,
      sfRank: 1,
      budget: 120,
      ceiling: 138,
      floor: 104,
      notes: '',
    },
    {
      player: 'Justin Jefferson',
      team: 'MIN',
      pos: 'WR',
      age: 25,
      sfRank: 5,
      budget: 95,
      ceiling: 109,
      floor: 83,
      notes: '',
    },
  ],
}));

jest.mock('@/lib/actions', () => ({
  logBid: jest.fn().mockResolvedValue(undefined),
  updateBid: jest.fn().mockResolvedValue(undefined),
  deleteBid: jest.fn().mockResolvedValue(undefined),
}));

const mockTeams: LeagueTeam[] = [
  { id: 1, handle: 'coreschke', displayName: 'Cole' },
  { id: 2, handle: 'chappy72', displayName: null },
];

const mockClaim: ClaimedBid = {
  id: 1,
  player: 'Josh Allen',
  position: 'QB',
  price: 110,
  teamId: 1,
  teamHandle: 'coreschke',
};

describe('AuctionSheet with claimed bids', () => {
  it('renders without claimed bids and does not show a Claimed column', () => {
    render(<AuctionSheet claimedBids={[]} teams={mockTeams} />);

    expect(screen.queryByText('Claimed')).not.toBeInTheDocument();
  });

  it('shows a Claimed column header when at least one bid exists', () => {
    render(<AuctionSheet claimedBids={[mockClaim]} teams={mockTeams} />);

    expect(screen.getByText('Claimed')).toBeInTheDocument();
  });

  it('shows team handle and price in the claimed column for a claimed player', () => {
    render(<AuctionSheet claimedBids={[mockClaim]} teams={mockTeams} />);

    expect(screen.getByText(/coreschke/)).toBeInTheDocument();
    expect(screen.getByText(/\$110/)).toBeInTheDocument();
  });

  it('shows EV diff with ▼ and green color when bought under target', () => {
    // mockClaim.price = 110, player.budget = 120, diff = -10 → ▼$10
    render(<AuctionSheet claimedBids={[mockClaim]} teams={mockTeams} />);

    expect(screen.getByText(/▼\$10/)).toBeInTheDocument();
  });

  it('shows EV diff with ▲ and red when overpaid', () => {
    const overClaim: ClaimedBid = { ...mockClaim, price: 130 };
    render(<AuctionSheet claimedBids={[overClaim]} teams={mockTeams} />);

    // price 130, budget 120, diff = +10 → ▲$10
    expect(screen.getByText(/▲\$10/)).toBeInTheDocument();
  });

  it('opens the modal when a claimed player row is clicked', () => {
    render(<AuctionSheet claimedBids={[mockClaim]} teams={mockTeams} />);

    fireEvent.click(screen.getAllByText('Josh Allen')[0]);

    // Modal opens in edit mode
    expect(screen.getByRole('button', { name: /update bid/i })).toBeInTheDocument();
  });

  it('opens the modal when an unclaimed player row is clicked', () => {
    render(<AuctionSheet claimedBids={[]} teams={mockTeams} />);

    fireEvent.click(screen.getByText('Justin Jefferson'));

    // Modal opens in add mode
    expect(screen.getByRole('button', { name: /log bid/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm test src/__tests__/AuctionSheet.claimed.test.tsx
```

Expected: FAIL — `AuctionSheet` does not yet accept `claimedBids` or `teams` props

- [ ] **Step 3: Update `AuctionSheet.tsx`**

At the top of the file, add imports after existing ones:

```tsx
import { useOptimistic, useTransition } from 'react';
import type { ClaimedBid, LeagueTeam } from '@/types';
import { logBid, updateBid, deleteBid } from '@/lib/actions';
import BidModal from '@/components/BidModal';
```

Add the `OptimisticAction` type before the component:

```tsx
type OptimisticAction =
  | { type: 'add'; bid: ClaimedBid }
  | { type: 'update'; bid: ClaimedBid }
  | { type: 'delete'; id: number };
```

Change the component signature from:

```tsx
export default function AuctionSheet() {
```

to:

```tsx
interface AuctionSheetProps {
  claimedBids: ClaimedBid[];
  teams: LeagueTeam[];
}

export default function AuctionSheet({ claimedBids, teams }: AuctionSheetProps) {
```

Inside the component, after the existing `useState` declarations, add:

```tsx
const [modalPlayer, setModalPlayer] = useState<(typeof players)[0] | null>(null);
const [, startTransition] = useTransition();

const [optimisticBids, dispatchOptimistic] = useOptimistic<ClaimedBid[], OptimisticAction>(
  claimedBids,
  (state, action) => {
    if (action.type === 'add') return [...state, action.bid];
    if (action.type === 'update')
      return state.map((b) => (b.id === action.bid.id ? action.bid : b));
    if (action.type === 'delete') return state.filter((b) => b.id !== action.id);
    return state;
  },
);

const claimMap = useMemo(() => new Map(optimisticBids.map((b) => [b.player, b])), [optimisticBids]);

const hasClaims = optimisticBids.length > 0;
```

Add the submit and delete handlers after `claimMap`:

```tsx
function handleModalSubmit({ price, teamId }: { price: number; teamId: number }) {
  if (!modalPlayer) return;
  const existingBid = claimMap.get(modalPlayer.player);
  const team = teams.find((t) => t.id === teamId);
  if (!team) return;

  if (existingBid) {
    const updated: ClaimedBid = { ...existingBid, price, teamId, teamHandle: team.handle };
    startTransition(async () => {
      dispatchOptimistic({ type: 'update', bid: updated });
      await updateBid({ id: existingBid.id, price, teamId });
    });
  } else {
    const tempBid: ClaimedBid = {
      id: -Date.now(),
      player: modalPlayer.player,
      position: modalPlayer.pos,
      price,
      teamId,
      teamHandle: team.handle,
    };
    startTransition(async () => {
      dispatchOptimistic({ type: 'add', bid: tempBid });
      await logBid({
        player: modalPlayer.player,
        position: modalPlayer.pos,
        nflTeam: modalPlayer.team,
        price,
        sfRank: modalPlayer.sfRank,
        teamId,
      });
    });
  }
  setModalPlayer(null);
}

function handleModalDelete() {
  if (!modalPlayer) return;
  const existingBid = claimMap.get(modalPlayer.player);
  if (!existingBid) return;
  startTransition(async () => {
    dispatchOptimistic({ type: 'delete', id: existingBid.id });
    await deleteBid({ id: existingBid.id });
  });
  setModalPlayer(null);
}
```

In the `return` statement, add the modal just before the closing `</div>` of the root element:

```tsx
{
  modalPlayer && (
    <BidModal
      player={modalPlayer}
      teams={teams}
      existingBid={claimMap.get(modalPlayer.player)}
      onClose={() => setModalPlayer(null)}
      onSubmit={handleModalSubmit}
      onDelete={claimMap.has(modalPlayer.player) ? handleModalDelete : undefined}
    />
  );
}
```

Update the `<thead>` to conditionally add the Claimed column. Find the existing array of column headers passed to `.map()` and after the last `{ key: 'ceiling', label: '🔺 Ceiling' }` entry, add a conditional column in the JSX. The cleanest approach is to add `hasClaims` as a guard on an extra `<th>` after the map:

After the existing `</th>` that closes the `{showNotes && ...}` block, the full header row's final columns become:

```tsx
{
  hasClaims && (
    <th
      style={{
        padding: '9px 10px',
        textAlign: 'left',
        fontSize: 10,
        fontWeight: 600,
        color: '#4a5168',
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontFamily: 'var(--font-barlow), sans-serif',
      }}
    >
      Claimed
    </th>
  );
}
```

Update each `<tr>` in the `<tbody>` to:

1. Make the row clickable and open the modal
2. Apply muted text when claimed
3. Append the claimed column cell

Replace the `onMouseEnter`/`onMouseLeave` `<tr>` opening with:

```tsx
<tr
  key={p.player + i}
  onClick={() => setModalPlayer(p)}
  style={{
    borderBottom: '1px solid #141824',
    background: i % 2 === 0 ? 'transparent' : '#0a0c10',
    borderLeft: `3px solid ${c.accent}`,
    cursor: 'pointer',
    opacity: claimMap.has(p.player) ? 0.5 : 1,
  }}
  onMouseEnter={(e: React.MouseEvent<HTMLTableRowElement>) =>
    (e.currentTarget.style.background = '#141824')
  }
  onMouseLeave={(e: React.MouseEvent<HTMLTableRowElement>) =>
    (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : '#0a0c10')
  }
>
```

At the end of each row (after the `{showNotes && ...}` cell), add:

```tsx
{
  hasClaims &&
    (() => {
      const claim = claimMap.get(p.player);
      if (!claim) return <td key="claimed" style={{ padding: '8px 10px' }} />;
      const diff = claim.price - p.budget;
      const over = diff > 0;
      return (
        <td key="claimed" style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 11, color: '#8892a4' }}>{claim.teamHandle}</span>
          <span
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono), monospace',
              color: '#8892a4',
              marginLeft: 4,
            }}
          >
            ${claim.price}
          </span>
          <span
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono), monospace',
              color: over ? '#e05050' : '#4caf6e',
              marginLeft: 4,
            }}
          >
            {over ? `▲$${diff}` : `▼$${Math.abs(diff)}`}
          </span>
        </td>
      );
    })();
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm test src/__tests__/AuctionSheet.claimed.test.tsx
```

Expected: 7 tests pass, 0 failures

- [ ] **Step 5: Run the full test suite**

```bash
pnpm test
```

Expected: all 17+ tests pass across all test files

- [ ] **Step 6: Run full quality gate**

```bash
pnpm check
```

Expected: typecheck, lint, format, and all tests pass

- [ ] **Step 7: Start dev server and verify manually**

```bash
make db-reset  # ensures teams are seeded
make dev       # http://localhost:3000
```

Verify:

- Page loads with no Claimed column visible
- Clicking a player row opens the modal pre-filled with player name/pos/team
- Logging a bid closes the modal and immediately marks the player as claimed (greyed, Claimed column appears)
- Clicking the claimed player opens edit mode with existing price pre-filled
- Updating the bid reflects instantly
- Remove button deletes the bid and ungreys the player

- [ ] **Step 8: Commit**

```bash
git add src/components/AuctionSheet/AuctionSheet.tsx src/__tests__/AuctionSheet.claimed.test.tsx
git commit -m "feat: integrate claimed bids into AuctionSheet with modal and optimistic updates"
```
