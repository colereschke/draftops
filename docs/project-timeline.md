# DraftOps Project Timeline & Tracker

Last reconciled: 2026-08-04

This is the canonical cross-project tracker for DraftOps. It combines the product roadmap with the
engineering-hardening backlog and records the current state of shipped work, active initiatives,
and intentionally deferred follow-ups.

Detailed historical audit context remains in
[`docs/engineering-hardening.md`](engineering-hardening.md). The original product roadmap
remains in [`docs/roadmap.md`](roadmap.md) as a source of historical design context and legacy
item numbers; this file is the current planning view.

## ID conventions

- `HARD-###` — engineering hardening, correctness, security, and maintainability.
- `FEAT-###` — user-facing product capabilities and product-level improvements.
- `OPS-###` — deployment, monitoring, and operational work.

Legacy roadmap references such as `#5e` and `#10` are retained in the tracker so old plans, commits,
and discussions remain searchable.

## Current snapshot

- Product goal: make DraftOps shareable with the ETR dynasty Discord so each user can sign in,
  create a draft, and manage their own auction strategy.
- Product model: one owner observes and records a draft for all teams; DraftOps is not a
  multi-manager live-auction coordinator.
- Deployment milestone: complete on Vercel + Neon.
- Valuation and identity layers: complete, including draft-specific fallback values,
  projection-shaped active values, custom rankings, and Sleeper identity mapping.
- Engineering hardening: `HARD-001` through `HARD-022` complete on `main`.
- Latest completed initiative: `FEAT-010` budget-for-picks trading (PR #105).
- Next planned product work: `FEAT-006` UI polish informed by real user feedback.
- No completed audit item is currently waiting for integration.

## Master ticket table

| ID                    | Initiative                                              | Type                        | Status                       | Phase                   | Dependencies                        | PRs / commits                                              | Next action                                                              |
| --------------------- | ------------------------------------------------------- | --------------------------- | ---------------------------- | ----------------------- | ----------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| `FEAT-001`            | PostgreSQL migration                                    | Feature / infrastructure    | Complete                     | Foundation              | —                                   | `12623ea`                                                  | —                                                                        |
| `FEAT-002`            | Discord authentication                                  | Feature / infrastructure    | Complete                     | Foundation              | —                                   | `eff7520`, `7099641`                                       | —                                                                        |
| `FEAT-003`            | Multi-draft schema and route scoping                    | Feature / data architecture | Complete                     | Foundation              | `FEAT-001`, `FEAT-002`              | See `docs/roadmap.md` #3 history                           | —                                                                        |
| `FEAT-004`            | Draft creation and management                           | Feature                     | Complete                     | Foundation              | `FEAT-002`, `FEAT-003`              | PR #18 (`53ac7a4`), PR #93 (`2953ded`)                     | —                                                                        |
| `OPS-001`             | Vercel + Neon deployment milestone                      | Operations                  | Complete                     | Deployment              | `FEAT-001`–`FEAT-004`               | Deployment docs and build configuration                    | Verify region/connection settings after production changes               |
| `FEAT-005A`           | Configurable league settings and per-draft player table | Feature                     | Complete                     | Valuation foundation    | `FEAT-003`, `FEAT-004`              | PR #20 (`2d6aefe`)                                         | —                                                                        |
| `FEAT-005B`           | Draft-budget fallback value adjustment                  | Feature / valuation         | Complete                     | Valuation foundation    | `FEAT-005A`                         | PR #56 (`dfd5eac`)                                         | Revisit only if valuation calibration requires it                        |
| `FEAT-005C`           | Sleeper league import                                   | Feature                     | Complete                     | League setup            | `FEAT-005A`                         | PR #21 (`631abc0`)                                         | —                                                                        |
| `FEAT-005D`           | Projection ETL and Sleeper identity mapping             | Feature / data architecture | Complete                     | Projection layer        | `FEAT-005A`                         | PR #24 (`f5f777b`), PR #32 (`7a47e60`)                     | See `docs/projections-architecture.md`; add an admin/setup wrapper later |
| `FEAT-005E`           | Projection-aware active values                          | Feature / valuation         | Complete                     | Projection layer        | `FEAT-005B`, `FEAT-005D`            | PR #35 and follow-up projection work                       | Rebuild the deferred strategy lens with a shape-preserving signal        |
| `FEAT-006`            | UI redesign                                             | Product                     | Partial — foundation shipped | Product experience      | Deployment milestone                | PR #26 (`c640a73`), PR #28 (`96741e2`), PR #54 (`bde57ea`) | Define the next polish pass using real user feedback                     |
| `FEAT-007`            | Custom rankings upload and matching                     | Feature                     | Complete                     | Valuation inputs        | `FEAT-005A`                         | PR #38 (`5cd6acb`), PR #74 (`d9f26a4`)                     | Consider deferred replacement/multiple-set workflows                     |
| `FEAT-008`            | Dynamic pick/package valuation                          | Feature / valuation         | Partial — baseline shipped   | Draft intelligence      | `FEAT-005B`                         | PR #39, PR #43 (`429b0de`)                                 | Decide whether richer posture signals belong before or after trading     |
| `FEAT-009`            | Sleeper roster sync and catch-up                        | Feature                     | Complete                     | Live-draft operations   | `FEAT-005D`                         | PR #50, PR #51 (`81d53e3`), PR #52                         | Explore native-auction polling only as a separate future feature         |
| `FEAT-010`            | Budget-for-picks trading                                | Feature                     | Complete                     | Live-draft intelligence | `FEAT-003`, `FEAT-005A`, `FEAT-008` | PR #105                                                    | —                                                                        |
| `FEAT-011`            | Seasonal projection-source imports                      | Feature / data ingestion    | Discovery — permission-gated | Projection layer        | `FEAT-005D`, `FEAT-005E`            | —                                                          | Obtain Sleeper data-use confirmation, then scope separately              |
| `HARD-001`–`HARD-022` | Engineering hardening audit                             | Hardening                   | Complete                     | Cross-cutting           | Foundation and valuation layers     | PRs #53, #56–#81, #93, #97, #98, #103                      | —                                                                        |
| `OPS-002`             | Production monitoring and feedback loop                 | Operations                  | Planned                      | Operations              | Production domain and traffic       | —                                                          | Add uptime monitoring for `/api/health` and a lightweight feedback path  |

## Timeline

### Foundation and deployment

- PostgreSQL replaced the SQLite runtime.
- Discord OAuth and protected route/action boundaries were added.
- Draft ownership, draft-scoped data, draft creation, and draft navigation were implemented.
- Vercel + Neon deployment support was completed, including migration/runtime connection roles.

### Valuation and data architecture

- Configurable league settings and per-draft player rows replaced hardcoded league assumptions.
- Fallback values became draft-budget-scaled and scoring/scarcity-aware.
- Sleeper league import and shared Sleeper identity mapping were added.
- Projection ETL, normalized projection storage, atomic projection activation, and
  projection-shaped active values were added.
- Custom rankings upload and manual identity resolution were added.

### Product experience

- The first UI redesign established the current dark, token-based DraftOps visual system.
- Manager dossiers, budget pressure, nomination intelligence, value spreads, onboarding, and
  Sleeper catch-up workflows were added around the core auction sheet.
- The remaining UI work is a polish pass informed by real user feedback, not a replacement of the
  existing application shell.

### Engineering hardening

`HARD-001` through `HARD-022` are complete on `main`. The audit delivered transactional draft
immutability, atomic bid legality, same-draft database constraints, canonical active values and
team statistics, hardened imports, production-shaped CI, browser coverage, accessibility fixes,
security headers, safe observability, build/runtime hardening, URL state restoration, setup-smoke
coverage, and behavior-preserving module decomposition.

See the engineering-hardening document for the individual acceptance criteria, verification evidence, and merged
PR mapping.

### Latest completed product work

`FEAT-010` shipped the complete budget-for-picks workflow in PR #105. Its ledger, mutations,
recovery archive, current-holder UI, and budget/valuation integrations keep three concepts
separate:

1. Budget-transfer effects on buying power.
2. Pick ownership and transfer history.
3. Pick value based on the origin team's posture, not the current holder's roster.

The durable design rationale now lives in `docs/DECISIONS.md`; operational recovery guidance lives
in `docs/operations/bid-recovery.md`.

## Next queue

### `FEAT-006` — UI polish follow-up

- Status: Planned after the active trading work and user feedback.
- Goal: refine typography, spacing, tables, modals, navigation, and interaction primitives while
  preserving the current design-token system and accessibility guarantees.
- Constraint: this is an incremental polish pass, not a wholesale framework replacement. The
  former standalone UI critique has been distilled into `docs/roadmap.md` and retired.

## Deferred and operational follow-ups

These are intentionally not counted as incomplete audit tickets:

- Add production uptime monitoring for `https://<production-domain>/api/health` once the domain is
  finalized and traffic is flowing.
- Add or refine the one-click feedback path for Discord users.
- Review report-only CSP violations before enforcing CSP.
- Revisit the draft-creation projection read-back optimization if production timing justifies it.
- Rebuild the deferred strategy lens using a shape-preserving projection signal rather than raw
  VOR-dollar deltas.
- Evaluate `FEAT-011`, a potential server-side seasonal Sleeper projection import, only after
  written confirmation that DraftOps may fetch, cache, derive values from, and display the data.
  A future design must preserve the existing source snapshots and Mike Clay fallback.
- Decide whether dynamic pick valuation needs richer posture signals after real use of trading.
- Consider first-class future-pick assets for more advanced post-draft trading and roster
  operations.
- Consider existing-draft custom-ranking replacement and multiple named ranking sets.

## Dependency view

```text
Foundation: FEAT-001 + FEAT-002
    ↓
Draft spine: FEAT-003 + FEAT-004
    ↓
Valuation foundation: FEAT-005A + FEAT-005B
    ├── FEAT-005C Sleeper league import
    ├── FEAT-005D projection ETL / identity
    │       ↓
    │   FEAT-005E projection-aware values
    │       ↓
    │   FEAT-011 optional seasonal projection imports (permission-gated)
    └── FEAT-007 custom rankings

FEAT-008 dynamic pick valuation ──┐
                                  ├── FEAT-010 budget-for-picks trading
FEAT-009 Sleeper roster sync ─────┘

FEAT-006 UI polish and OPS-002 monitoring can proceed independently when capacity allows.
HARD-001–HARD-022 are complete and should be treated as repository constraints for new work.
```

## Maintenance rules

- Update the master table when status, dependencies, ownership, or next action changes.
- Add the merged PR and short outcome when work completes.
- Keep detailed implementation plans and durable rationale in their dedicated documents; do not
  duplicate them here.
- Use `FEAT-`, `HARD-`, and `OPS-` IDs for new work rather than adding another numbering system.
- When a design/spec is completed, extract durable decisions to `docs/DECISIONS.md` and retire the
  source planning document according to `AGENTS.md`.
