# HARD-009 Sleeper Import Hardening Design

## Goal

Make Sleeper league import and roster-sync calls authenticated, bounded, runtime-validated, and
truthful about settings DraftOps does not support. Draft creation remains permissive: unsupported
settings are excluded and reported once, not treated as a failed import.

## Scope

The work covers the Sleeper service boundary in `src/lib/sleeper.ts`, the new-draft import server
action in `src/lib/sleeper-actions.ts`, and Sleeper roster-sync actions in
`src/lib/sleeper-roster-actions.ts`.

It does not add support for IDP, kickers, defense, IR, taxi, or other non-auction settings.

## Service boundary

Create a single internal request helper used by the league, users, and rosters endpoints. It:

- validates a trimmed numeric Sleeper league ID before any network request;
- uses a defined `AbortSignal.timeout` timeout;
- retries only safe transient failures (network failures, 5xx responses, and rate limits), with a
  small bounded retry count;
- parses response JSON at runtime; and
- returns typed outcomes for invalid ID, not found, timeout, rate limit, unavailable, and malformed
  response.

The endpoint wrappers return validated domain payloads only. No type assertion may allow an
unknown external payload into league mapping, roster matching, or roster reconciliation.

## Import behavior

`importFromSleeper` authenticates before inspecting the league ID or contacting Sleeper. It maps
typed service outcomes to distinct, actionable user messages and applies no partial import data on
failure.

On success, `SleeperImportResult` includes `warnings: string[]`. The new-draft form combines these
with the existing owner-username matching warning in its one-time import confirmation.

## Settings translation

DraftOps imports QB, RB, WR, TE, FLEX, and SUPER_FLEX as starting slots. Bench (`BN`) counts toward
the auction roster size. IR, taxi, K, defense/DST, IDP positions, and unknown slots are excluded
from both the starter list and auction roster size. A warning explicitly identifies excluded slot
categories.

Only the scoring settings DraftOps models are translated. Unsupported scoring settings are omitted
and reported in the same one-time warning; they never affect stored draft scoring values.

## Roster-sync actions

Roster preview, matching, mapping save, and catch-up continue to use their existing action-specific
response contracts. They call the shared validated Sleeper endpoint wrappers and distinguish external
payload failures from ordinary unavailable Sleeper service failures where their UI can surface that
difference. Ownership checks continue to happen before any Sleeper request.

## Verification

Add or update focused tests that verify:

- anonymous import actions return before Sleeper is contacted;
- malformed and invalid league IDs return before Sleeper is contacted;
- timeout, rate-limit, not-found, unavailable, and malformed-response outcomes are distinct;
- bounded retry behavior applies only to transient failures;
- malformed league, user, and roster payloads cannot reach domain mapping;
- supported starters and bench are counted correctly; unsupported slots and scoring settings are
  excluded and yield warnings; and
- successful imports, owner matching, roster mapping, and catch-up continue to work.
