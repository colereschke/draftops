# DraftOps

A dynasty fantasy football auction startup draft tool. Built for a 12-team Superflex league on Sleeper — tracks player values, live team budgets, and completed bids across all 12 managers.

## League Context

| Setting | Value |
|---|---|
| Platform | Sleeper |
| Format | Dynasty (keep players year-over-year) |
| Teams | 12 — 30-player rosters |
| Scoring | Full PPR + TE premium |
| QB Format | **Superflex** — QBs are premium assets |
| Auction Budget | **$1,000 per team** |
| Draft Style | Slow auction (OTC, 12-hour timer) |

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

- **Value sheet** — ~270 players ranked by SF position with floor / target / ceiling bid prices
- **Position filters** — QB / RB / WR / TE / PICK / PKG tabs with search and sort
- **Budget tracker** — manual spend entry with live remaining balance
- **Market weight bar** — positional distribution of total auction dollars
- **Age color coding** — ≤24 green, 25–27 white, 28–30 amber, 31+ red
- **2027 pick packages** — kicker placeholder system (winning a kicker bid nets full 1st+2nd+3rd)

**Coming next:** team roster tracker, live auction log, budget pressure view, nomination helper

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

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 + CSS custom properties |
| Database | SQLite via Prisma 7 |
| Package manager | pnpm 11 |
| Testing | Jest + React Testing Library |
| Linting | ESLint 9 + typescript-eslint + eslint-plugin-react-hooks |
| Formatting | Prettier |
| Pre-commit | Husky + lint-staged |

## Project Structure

```
src/
├── app/                    # Next.js App Router pages and layouts
├── components/AuctionSheet # Main auction value sheet UI
├── data/players.ts         # Full player list with scaled bid values
├── lib/
│   ├── db.ts               # Prisma client singleton
│   └── teams.ts            # League team definitions
└── types/index.ts          # Shared TypeScript types
prisma/
├── schema.prisma           # Team + AuctionResult models
├── seed.ts                 # Seeds 12 league teams
└── dev.db                  # Local SQLite database (gitignored)
```

## Contributing / Feedback

This tool is shared with the **Establish The Run dynasty Discord** for feedback. If you're testing it:

- Open an issue for bugs or confusing UX
- Use Discussions for feature ideas or questions
- PRs welcome — run `make check` before opening one
