# HARD-014 Error Observability Design

## Goal

Prevent internal errors from reaching users while making production failures safe to correlate,
group, alert on, and investigate.

## Scope

This work integrates Sentry's official Next.js SDK for browser, server, and edge error capture;
removes the redundant client-error report endpoint; and standardizes safe structured error logs
for Vercel. It also adds one bounded health route for Sentry uptime monitoring.

It does not add a Vercel log drain, session replay, performance tracing, or a database-backed
incident store.

## User Experience

`error.tsx` and `global-error.tsx` show generic recovery copy only. Each error display includes a
stable incident ID that follows one rule:

- If Next.js supplies `error.digest`, the boundary displays that digest. The server capture and
  structured log attach the same value as `incident.id`, and the client boundary does not capture
  the processed server error a second time.
- If no digest exists, the boundary captures the client error once with `Sentry.captureException`
  and displays the returned Sentry event ID.
- If Sentry is disabled or does not return an event ID, the boundary creates one opaque UUID,
  retains it for the lifetime of that error instance, and displays it as a local-only incident ID.

Users can share the identifier without seeing provider, database, or application error messages.

## Error Capture and Correlation

Sentry is initialized through `src/instrumentation-client.ts`, `src/sentry.server.config.ts`,
`src/sentry.edge.config.ts`, and `src/instrumentation.ts`. `next.config.ts` is wrapped with
`withSentryConfig` for release metadata and production source maps.

`src/instrumentation.ts` captures processed server errors through Next.js `onRequestError`. The
capture attaches the digest as `incident.id`, the route type as `action`, the route pattern, a
draft ID parsed only from a recognized `/draft/[draftId]` path, `x-vercel-id` when present, and the
Vercel deployment and environment variables. Client-only errors are captured once by the error
boundary. The capture paths must not report the same error to Sentry twice.

Raw account identifiers are never sent to Sentry or written to logs. Code that already has an
authenticated user ID may derive an optional `user.correlation_id` with an HMAC-SHA-256 keyed by a
dedicated server-only `OBSERVABILITY_HASH_KEY`. Global instrumentation does not attempt to recover
an Auth.js session and omits user context when it is unavailable. The HMAC input, key, and raw user
ID are never logged or attached to an event.

Sentry's `beforeSend` hook and the shared sanitizer remove or redact secrets and personally
identifying values before any event is sent. The implementation never attaches raw request bodies,
cookies, authorization headers, full URLs with query strings, email addresses, Discord IDs, or
unbounded stacks.

Server error logs use the same sanitized fields and are emitted as one JSON object through
`console.error`, preserving Vercel's native request/deployment inspection as a complementary
diagnostic path. The log contains the event name, incident ID, route pattern, action, safe draft
ID, optional user correlation ID, `x-vercel-id`, deployment ID, environment, and a sanitized error
summary. Client-only failures rely on Sentry and do not make a second request to create a Vercel
log.

## Client Error Ingestion

`POST /api/log-error` and `src/lib/reportClientError.ts` are removed. The browser reports errors
through Sentry's SDK, which avoids maintaining a second unauthenticated ingestion surface and still
works when Auth.js or the application API is failing. Sentry quota controls and inbound filters
remain the abuse boundary for the public DSN.

## Configuration and Operations

The runtime configuration uses `NEXT_PUBLIC_SENTRY_DSN` and is a no-op when it is absent, so local
development and tests do not need credentials. Production source-map uploads use the server-only
`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` values. `OBSERVABILITY_HASH_KEY` is required
only where optional authenticated-user correlation is emitted.

All three Sentry runtimes set `sendDefaultPii: false`, disable session replay and Sentry log
forwarding, and start with `tracesSampleRate: 0`. Error events remain unsampled. `beforeSend`
removes cookies, authorization headers, raw user objects, request bodies, query strings, URL
fragments, and unknown context fields; sanitizes retained strings; and applies explicit length
limits. The same pure sanitizer feeds structured Vercel logs. Sentry-side inbound filters, email
alerts for new or escalating issues, quota notifications, and leaving pay-as-you-go disabled are
part of the deployment checklist.

`GET /api/health` is public and returns only `{ "ok": true }` after a `SELECT 1` database probe
subject to a short application deadline. It returns a generic `{ "ok": false }` with status 503 on
failure or timeout, never exposes provider or database details, and emits a sanitized structured
error. Sentry uptime monitoring checks this route, providing an independent signal that both the
deployed application and its database are reachable.

## Testing

Unit and route tests prove that:

- error boundaries render generic text and an incident ID, never `error.message`;
- a processed server error is captured once and its digest is used consistently as `incident.id`;
- a client error is captured once and displays the returned Sentry event ID;
- the fallback incident UUID remains stable across re-renders when Sentry is disabled;
- sanitizer redacts known secrets, drops URL query strings, and bounds every retained field; and
- structured reports include safe correlation fields while excluding raw user identity;
- the user correlation helper produces a keyed HMAC and never returns the source user ID; and
- the health route returns 200 for a successful probe and a detail-free 503 for a failed probe.

The implementation also includes a manual production smoke check that triggers a known test error,
confirms a scrubbed Sentry issue, validates its deployment/release tags, verifies that the
corresponding server-side Vercel structured log can be located by its request or incident ID, and
confirms the uptime monitor succeeds against `/api/health`.

## Acceptance Mapping

- Generic boundary UI and sanitizer coverage ensure internal provider/database messages never
  reach users.
- Removing the custom ingestion route eliminates its unauthenticated, unbounded request surface.
- The canonical incident-ID rules, Sentry event tags, and server-side Vercel structured logs
  provide correlation from a user-reported incident to deployment and failing action.
