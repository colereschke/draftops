# DraftOps

A dynasty fantasy football auction startup draft tool. Built for a 12-team Superflex league on Sleeper — tracks player values, live team budgets, and completed bids across all 12 managers.

## League Context

| Setting        | Value                                  |
| -------------- | -------------------------------------- |
| Platform       | Sleeper                                |
| Format         | Dynasty (keep players year-over-year)  |
| Teams          | 12 — 30-player rosters                 |
| Scoring        | Full PPR + TE premium                  |
| QB Format      | **Superflex** — QBs are premium assets |
| Auction Budget | **$1,000 per team**                    |
| Draft Style    | Slow auction (OTC, 12-hour timer)      |

## Getting Started

**Prerequisites:** [Node.js](https://nodejs.org) 20+, [pnpm](https://pnpm.io) 11+

```bash
git clone <repo-url>
cd draftops
make setup   # install deps, run migrations, seed 12 teams
make dev     # start at http://localhost:3000
```

That's it.

## Features

- **Value sheet** (`/`) — ~270 players ranked by SF position with floor / target / ceiling bid prices, position filters, search, sort, age color coding, and bid logging via modal
- **Live auction log** — log, edit, and delete bids as they happen; won players dim in the sheet; nominated players show a teal "LIVE" badge
- **Team roster tracker** (`/teams`) — expandable rows per team showing won players, spend/remaining/buying power, and delta vs. target budget per player
- **Budget pressure view** (`/budget`) — teams sorted by buying power with a visual bar; auto-refreshes every 20 seconds
- **Nomination helper** (`/nominate`) — ranks available players by rival demand score; personal watchlist sidebar persists to DB and excludes players from suggestions
- **In-auction tracking** — "Nom" button marks a player as currently up for bidding; persists to DB so state survives page refreshes; auto-clears when the bid is logged

## Make Commands

```bash
make setup          # First-time setup (install + migrate + seed)
make dev            # Start dev server
make test           # Run test suite
make check          # Full quality pass (typecheck + lint + format + test)
make db-seed        # Re-seed league teams
make db-reset       # Wipe and re-seed (destructive)
make db-studio      # Open Prisma Studio (visual DB browser)
make help           # Show all commands
```

## Tech Stack

| Layer           | Choice                                                   |
| --------------- | -------------------------------------------------------- |
| Framework       | Next.js 16 (App Router)                                  |
| Language        | TypeScript 5                                             |
| Styling         | Tailwind CSS 4 + CSS custom properties                   |
| Database        | SQLite via Prisma 7                                      |
| Package manager | pnpm 11                                                  |
| Testing         | Jest + React Testing Library                             |
| Linting         | ESLint 9 + typescript-eslint + eslint-plugin-react-hooks |
| Formatting      | Prettier                                                 |
| Pre-commit      | Husky + lint-staged                                      |

## Project Structure

```
src/
├── app/                        # Next.js App Router pages and layouts
│   ├── api/                    # API routes (nomination-data, watchlist, nominated)
│   ├── budget/                 # /budget — buying power view
│   ├── nominate/               # /nominate — nomination helper
│   └── teams/                  # /teams — team roster tracker
├── components/
│   ├── AuctionSheet/           # Main player value sheet + bid logging
│   ├── BidModal/               # Log/edit/delete bid modal
│   ├── BudgetPressure/         # Budget pressure table + auto-refresh
│   ├── NominationHelper/       # Nomination scorer + watchlist + in-auction sidebar
│   └── RosterTracker/          # Expandable team roster view
├── data/players.ts             # ~270 players with scaled bid values
├── lib/
│   ├── actions.ts              # Server actions: logBid, updateBid, deleteBid
│   ├── nominationScoring.ts    # Core nomination scoring logic
│   ├── db.ts                   # Prisma client singleton
│   └── teams.ts                # League team definitions
└── types/index.ts              # Shared TypeScript types
prisma/
├── schema.prisma               # Team + AuctionResult + PlayerWatchlist + NominatedPlayer models
├── seed.ts                     # Seeds 12 league teams
└── dev.db                      # Local SQLite database (gitignored)
```

## Roadmap

DraftOps is being generalized from a single hardcoded league into a tool anyone can deploy and use for their own draft. See [`ROADMAP.md`](./ROADMAP.md) for the full plan (Postgres migration → auth → multi-draft → configurable settings → custom rankings upload).

**Future ideas (not yet scheduled):**

- **1QB / single-QB scoring support** — values currently derive from FantasyCalc's 2QB (Superflex) column, so a 1QB league would need a different source column, not just a different multiplier. Deferred until the configurable-settings work lands.

## Contributing / Feedback

This tool is shared with the **Establish The Run dynasty Discord** for feedback. If you're testing it:

- Open an issue for bugs or confusing UX
- Use Discussions for feature ideas or questions
- PRs welcome — run `make check` before opening one
