# Rankings Upload UX Improvements — Design

## Context

`/rankings` (profile-level custom rankings upload, shipped under #7) currently under-serves users in a few ways:

1. The empty-state copy frames the upload as strictly an "ETR dynasty rankings export," and only lists the required columns — it doesn't mention the two optional columns the parser (`src/lib/rankingsImport.ts`) already honors (`SF/TE Prem`, `Notes`), and doesn't help a user coming from a non-ETR source (a spreadsheet, another ranking site) understand the expected shape.
2. There's no downloadable template, so getting the format right means reverse-engineering it from the error messages.
3. `/rankings` is not draft-scoped, so `NavLinks` (`src/components/NavBar/NavLinks.tsx`) renders an empty nav on that page (`LINKS` is gated on `hasDraftId`, which is always false here) — there is currently no way to navigate elsewhere from `/rankings` short of the browser back button.
4. A custom ranking set only seeds the `Player` table with exactly the rows it contains (`src/lib/actions.ts:143-165`) plus the hardcoded `PKG_PLAYERS` — nothing is backfilled from the full `SleeperPlayer` pool. If a manager nominates a skill player who isn't in the uploaded set, DraftOps has no record of them during a live draft. Users have no visibility into this gap today.

This spec covers four independent, additive changes to `/rankings` addressing all four points.

## Non-goals

- **No CSV header renaming.** Required/optional column names stay exactly as the parser defines them (`Player`, `Team`, `Position`, `Age`, `2QBAuction`, `SF/TE Prem`, `Notes`). Generalizing "not necessarily ETR" is a framing/copy change only, not a parsing contract change.
- **No alias/synonym header matching.** The parser does not attempt to accept multiple names for the same column.
- **No per-upload "which optional columns were detected" indicator.** This would require a new persisted flag on `UserRankingSet` (a migration) to know, after the fact, whether e.g. `SF/TE Prem` was present in the header of the file that produced the current set. Static documentation of what's optional is sufficient for this round.
- **No diff against the full `SleeperPlayer` table.** The coverage feature (point 4 below) diffs against the curated ~267-player ETR default pool (`src/data/players.ts`), not the full active roster pool (~600+ players), to avoid burying the signal under bench/practice-squad noise.
- **No auto-fill of missing players.** If a player is missing from the uploaded set, this spec only surfaces that fact — it does not attempt to backfill them from Sleeper or any other source at draft creation.

## 1. Copy generalization

`src/components/RankingsUpload/RankingsUploadForm.tsx`, empty-state branch (no `summary`):

Replace the current single sentence with:

- An opening line that doesn't assume ETR as the source, e.g. "Upload a custom rankings CSV to use your own player pool at draft creation — works with an ETR export or any spreadsheet matching the format below."
- A compact two-line legend:
  - **Required:** Player, Team, Position (QB/RB/WR/TE/Pick), Age, 2QBAuction (dollar value)
  - **Optional:** SF/TE Prem (explicit rank — used directly instead of deriving rank order from value), Notes
- A "Download template CSV" link (see section 2), placed directly under the legend.

Styling follows the existing inline-style convention in this file (CSS custom properties, `var(--font-barlow)` / `var(--font-mono)`), not Tailwind utility classes — consistent with the rest of `RankingsUpload/`.

## 2. Downloadable template CSV

New static file: `public/rankings-template.csv`.

Header row: `Player,Team,Position,Age,2QBAuction,SF/TE Prem,Notes`

Five example rows — one per QB/RB/WR/TE, plus one `PICK` row to demonstrate that future-pick entries are a supported position:

```
Player,Team,Position,Age,2QBAuction,SF/TE Prem,Notes
Josh Allen,BUF,QB,30.1,$51,2,
Bijan Robinson,ATL,RB,24.2,$68,1,
Ja'Marr Chase,CIN,WR,26.0,$72,3,
Brock Bowers,LV,TE,23.4,$44,4,
2027 1st Round Pick,NFL,PICK,,$12,5,Future pick
```

`SF/TE Prem` is filled on every row — the parser hard-rejects a partially-filled optional rank column once the header is present at all (`rankingsImport.ts:81-89`), so a template that only fills some rows would itself fail validation as a teaching example.

Linked from `RankingsUploadForm`'s empty state as a plain `<a href="/rankings-template.csv" download>Download template CSV</a>` — no route handler, no server logic.

## 3. Back navigation

`src/app/rankings/page.tsx`: add a small "← All Drafts" link at the top of the page, above the `<h1>Custom Rankings</h1>`, pointing to `/drafts`. This mirrors the existing "All Drafts" fallback destination already used inside `NavLinks.tsx` when navigating away from a specific draft, so it's a consistent, always-valid landing spot regardless of which draft (if any) the user came from.

This is a plain server-rendered `<Link>` — no client component needed.

## 4. Coverage warning + missing-players list

**Computation** — server-side in `src/app/rankings/page.tsx`, only when a `rankingSet` exists:

```ts
import { players as ETR_PLAYERS } from '@/data/players';
import { normalizeName } from '@/lib/sleeperNormalize';

const ETR_SKILL_PLAYERS = ETR_PLAYERS.filter((p) => ['QB', 'RB', 'WR', 'TE'].includes(p.pos));

const uploadedNames = new Set(rankingSet.players.map((p) => normalizeName(p.name)));
const missingFromEtr = ETR_SKILL_PLAYERS.filter((p) => !uploadedNames.has(normalizeName(p.player)));
```

`PICK`/`PKG` entries in `src/data/players.ts` are excluded — they're not real players a rankings CSV would ever list, and are seeded separately via `PKG_PLAYERS` regardless of source. Comparison uses all uploaded rows regardless of `matchStatus` (an unmatched row still represents an intended player).

**Summary line** — extend `RankingSummaryView` (`RankingsUploadForm.tsx`) with a new field, e.g. `etrCoverage: { covered: number; total: number }`, rendered as a line in the existing summary block: "Covers 245 of 267 ETR-ranked players."

**Missing-players list** — new sibling component (e.g. `MissingFromEtrList.tsx`), rendered from `page.tsx` next to `RankingsUploadForm`, only when `missingFromEtr.length > 0` — mirroring how `ResolveUnmatchedList` is already a separate component rendered conditionally next to the upload form. Collapsed by default (a `<details>` disclosure or equivalent toggle state) with a plain text filter input (`useState` + `useMemo`, no `cmdk` — there's no selection action here, just browsing/searching a read-only list), since the list can range from a handful of names to potentially all 267 depending on how different the uploaded source is from ETR's pool.

## Testing

- `RankingsUploadForm.test.tsx`: update the empty-state assertion for the new copy; add a summary-with-coverage-line case.
- New `MissingFromEtrList.test.tsx`: renders nothing when passed an empty list; renders collapsed by default; filters by text input.
- No changes needed to `rankingsImport.test.ts` or `rankings-actions.test.ts` — the parser contract is unchanged.
- Manual check: confirm `public/rankings-template.csv` itself passes `parseRankingsCsv` validation (it should — it's a template, not just documentation).
