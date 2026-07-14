# First-Run Onboarding Design

**Date:** 2026-07-14  
**Status:** Approved for implementation

## Goal

Help a new DraftOps owner create a first draft, then understand the app's live
auction decision tools through a short, dismissible tour of their real draft.

DraftOps is a single-operator tool: the owner logs their league's auction
results and uses values, buying power, roster context, and nomination scoring
to make better decisions. The onboarding should teach that workflow without
duplicating the existing league-setup form or creating a separate demo draft.

## Scope and decisions

- Onboarding applies to a user's first DraftOps experience only.
- The existing `/drafts/new` form remains the draft-creation destination. The
  product guides users to it; it does not introduce a separate setup wizard.
- The app tour begins after successful creation of the user's first draft.
- The tour is a compact overlay on the real application and automatically
  navigates through its pages.
- Each optional state-changing exercise is performed against the real draft and
  is immediately followed by guidance for reversing that exact action.
- Completing or dismissing onboarding permanently suppresses it for the
  authenticated Discord account, across drafts, browsers, and devices. There
  is no restart control in beta.
- Users who already have a draft when this feature ships are not interrupted.

## User lifecycle

### First authenticated arrival

When an account has no onboarding record and no drafts, render a compact
welcome panel on `/drafts`. The panel explains the value proposition and sends
the user to `/drafts/new`. Its create action first creates an
`OnboardingProgress` record in `DRAFT_SETUP`; this avoids performing a database
write during server-page rendering.

The welcome panel has a dismiss action. Dismissing it marks onboarding
`COMPLETED`; the account will not receive the feature tour later.

### Draft creation

The existing create-draft flow continues to validate settings, teams, Sleeper
imports, player seeding, and projections exactly as it does today. After its
successful transaction, an `OnboardingProgress` record in `DRAFT_SETUP`
advances to `FEATURE_TOUR`, records the created draft ID, and begins at the
first Value Sheet step. The redirect remains to that draft's value sheet.

If a user leaves after choosing to create a draft, onboarding remains in
`DRAFT_SETUP`. If they later create one, the feature tour begins then. A user
who bypasses the welcome panel and directly creates their first draft receives
the same feature tour: `createDraft` detects the absence of prior drafts and
creates the `FEATURE_TOUR` record as part of the successful creation flow.

### Feature tour

For `FEATURE_TOUR`, draft-scoped pages load the user's progress for its
recorded draft and mount the client tour controller. The controller restores
the stored step after refresh, navigation, or a device change.

Finishing the final step or choosing Skip marks the record `COMPLETED` with a
completion timestamp. A completed record never renders a welcome panel or
tour, including for later drafts.

## Tour sequence

The controller presents one anchored popover at a time, with a progress
indicator, Skip control, and primary action. Its primary navigation action
automatically takes the user to the next page; it does not require users to
find the navigation link themselves.

1. **Value Sheet — market board**
   - Highlight search/filter controls, player market values, and bid logging.
   - Offer an optional real bid exercise by opening the existing bid modal.
   - After a successful bid, highlight the resulting entry and explain where
     to edit or delete it. The user may undo the bid or continue; undoing is
     never required to progress.
2. **Budget Pressure — who can still spend**
   - Navigate automatically to Budget Pressure.
   - Highlight buying power and explain how it differs from remaining budget.
   - Relate the calculation to the optional logged bid when one exists.
3. **Team Rosters — room context**
   - Navigate automatically to Team Rosters.
   - Highlight team spend, roster needs, and player-level delta versus target
     value.
4. **Nominate — make rivals spend**
   - Navigate automatically to Nominate.
   - Highlight rival-demand scoring and its owner-team perspective.
   - Offer an optional real nomination exercise.
   - After a successful nomination, point to the existing un-nominate control
     and explain how to reverse it.
5. **Completion**
   - Confirm that the user is ready to use DraftOps and mark onboarding
     complete. Leave the user on Nominate, the differentiating decision tool.

## Data model and server behavior

Add a user-scoped `OnboardingProgress` model. It is intentionally separate
from `Draft`, because completion applies to the authenticated account rather
than a particular league.

Required fields:

- `userId`: unique authenticated Discord user ID.
- `phase`: `DRAFT_SETUP`, `FEATURE_TOUR`, or `COMPLETED`.
- `draftId`: nullable draft association used only while the feature tour is
  active.
- `step`: the current named tour step, so incomplete work resumes reliably.
- `createdAt`, `updatedAt`, and nullable `completedAt` timestamps.

All reads and writes verify the active authenticated user. `createDraft`
advances progress only after successful draft creation. Dedicated server
actions (or one scoped action) update the step and completion state; client
state is never the authority for permanent dismissal.

Existing users with drafts and no progress record receive no new record and no
interruption. This is a deliberate beta rollout choice.

## Client architecture

- A server-side draft layout resolves whether incomplete tour progress applies
  to the current draft.
- A client `OnboardingTour` controller mounts once in that layout, preserving
  the overlay while route content changes.
- A declarative step map owns route, target anchor, title, explanatory copy,
  and the next route/step. This keeps page components independent of tour
  sequencing.
- Page controls expose stable `data-onboarding-target` attributes. They are
  separate from test IDs unless the same stable identifier already serves both
  purposes clearly.
- BidModal and NominationHelper notify a small onboarding context after a
  successful mutation. The controller advances to the relevant undo guidance;
  the existing components remain responsible for the actual bid, delete,
  nomination, and un-nomination behavior.

## Failure handling and accessibility

- Mutation failures stay visible in their existing component error states. The
  tour remains on the optional-action step and offers a way to continue.
- If a target is unavailable because data or responsive layout changed, the
  controller skips that step rather than trapping the user.
- The popover supports keyboard focus, Escape/Skip dismissal, sensible focus
  restoration, and narrow-viewport placement. It must not prevent ordinary
  navigation or draft work.
- No artificial sample players, bids, or nominations are created. All optional
  exercises use the owner's real draft state.

## Validation

- Unit tests cover onboarding authorization and phase/step transitions.
- Component tests cover first-run welcome visibility, suppression after
  completion, automatic route progression, and resume behavior.
- Extend bid and nomination component tests to ensure successful mutations
  notify the tour without changing normal mutation behavior; verify the undo
  guidance step follows each successful optional action.
- Perform a browser pass for keyboard behavior, small-screen popover
  positioning, route transitions, refresh/resume, skip persistence, and bid or
  nomination failure behavior.

## Out of scope

- A separate setup wizard or demo draft.
- Re-running onboarding from settings or navigation.
- Interrupting users who already had drafts at rollout.
- Product analytics beyond persisted timestamps needed for support and basic
  beta diagnosis.
