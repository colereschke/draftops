# HARD-008 Rankings Ingestion Hardening

## Goal

Make profile-level custom-ranking imports deterministic and bounded, and ensure manual Sleeper
identity resolution cannot create invalid or conflicting assignments.

## CSV parsing

`src/lib/csv.ts` will use a full-document state machine rather than splitting on line breaks. The
parser will support UTF-8 BOMs, CRLF and LF line endings, commas and line breaks inside quoted
fields, and doubled quote escapes. It will reject malformed quoting rather than attempting a
best-effort interpretation.

The parser will enforce these limits before returning rows:

- input text: 1 MiB maximum;
- data rows: 2,000 maximum;
- field length: 10,000 characters maximum;
- accumulated validation errors: 25 maximum.

The existing generic CSV consumers will retain the successful `ParsedCsv` shape. Parse failures
will be represented explicitly so the rankings importer can return user-safe errors before any
database access or writes.

## Ranking validation

`parseRankingsCsv` will use the bounded parser and validate every retained skill-position row
before values are scaled. Values must be finite and within these ranges:

- age: 0 through 100, allowing decimals; PICK rows continue to have no age;
- explicit `SF/TE Prem` rank: integer 1 through 10,000;
- `2QBAuction`: 0 through 1,000,000.

The importer will reject, rather than silently reconcile, duplicate normalized player identities
and duplicate explicit ranks. Identity is the case-insensitive trimmed player name plus position;
this permits an intentionally distinct future-pick row while preventing one player from being
inserted twice. Unsupported positions remain omitted, preserving the current CSV compatibility.

## Manual Sleeper matching

`resolveRankingMatch` will load the owned ranking row and proposed `SleeperPlayer` target,
then reject a request unless all conditions hold:

1. the ranking row belongs to the signed-in user;
2. the target Sleeper ID exists;
3. the target and ranking-row positions match; and
4. no other row in the same ranking set already uses that Sleeper ID.

The database schema will add a uniqueness constraint for non-null `(rankingSetId, sleeperId)`.
The action will validate first for clear errors and will translate a concurrent uniqueness conflict
to the same safe failure response.

## Error handling and UI

The upload server action continues to return validation errors without entering its write
transaction. The client already renders returned errors and retains its generic failure fallback,
so no UI redesign is necessary. Manual-match failures will surface in the existing row error state.

## Tests

Characterization and new unit tests will cover BOMs, CRLF, escaped quotes, quoted multiline
notes, malformed quotes, and each size/error cap. Ranking tests will cover non-finite and
out-of-range values, duplicate names, and duplicate explicit ranks. Action tests will cover
missing, wrong-position, and already-used manual targets; a migration-backed integration test will
confirm the database uniqueness invariant if the existing integration harness supports it.

## Non-goals

This work does not add flexible column mapping, change automatic Sleeper matching, alter ranking
economics, or support multiple named ranking sets.
