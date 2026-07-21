# HARD-014 Error Observability Design

## Goal

Prevent internal errors from reaching users while making production failures safe to correlate,
group, alert on, and investigate.

## Scope

This work integrates Sentry's official Next.js SDK for browser, server, and edge error capture;
hardens the existing client-error report endpoint; and standardizes safe structured error logs for
Vercel. It also documents one synthetic monitoring check using Sentry uptime monitoring.

It does not add a Vercel log drain, session replay, performance tracing beyond a conservative
baseline, or a database-backed incident store.

## User Experience

`error.tsx` and `global-error.tsx` show generic recovery copy only. Each error display includes a
safe incident ID. If Next.js supplies an error digest, the client uses that digest; otherwise it
generates a short opaque identifier. Users can share the identifier without seeing provider,
database, or application error messages.

## Error Capture and Correlation

Sentry is initialized through the standard Next.js client, server, and edge configuration files,
plus root `instrumentation.ts`. It captures unhandled application errors and reports from the
error boundaries. Events include safe tags for deployment ID, Vercel environment, request ID when
available, action, and draft ID. A one-way hash of the authenticated user ID provides correlation
without transmitting the raw Discord/account ID.

Sentry's `beforeSend` hook and the shared sanitizer remove or redact secrets and personally
identifying values before any event is sent. The implementation never attaches raw request bodies,
cookies, authorization headers, full URLs with query strings, email addresses, Discord IDs, or
unbounded stacks.

Server error logs use the same sanitized fields and are emitted with `console.error`, preserving
Vercel's native request/deployment inspection as a complementary diagnostic path.

## Client Error Ingestion

`POST /api/log-error` requires an authenticated Auth.js session. The route reads the request body
as a stream and stops once it exceeds the fixed byte limit; it never trusts `Content-Length` as the
only limit. It decodes and parses only the bounded content, validates an explicit payload
allowlist, sanitizes valid values, and returns generic 400, 401, or 413 responses. The route
captures the sanitized report using the shared observability utility.

The client report helper sends only the incident ID, bounded error metadata, and the URL pathname.
It treats failure to report as non-fatal because the user is already in an error state.

## Configuration and Operations

The production environment provides Sentry's public DSN plus release/deployment values supplied
by Vercel. Configuration is a no-op when the DSN is absent, so local development and tests do not
need credentials. Sampling remains conservative and error-focused. Inbound filtering and the
sanitizer are both enabled to defend against accidental sensitive-data collection.

The deployment checklist configures Sentry email alerting for new or escalating issues and one
uptime monitor for a public, unauthenticated route. The monitor verifies a successful production
response and provides an independent availability signal.

## Testing

Unit and route tests prove that:

- error boundaries render generic text and an incident ID, never `error.message`;
- a body without `Content-Length` is rejected when actual streamed bytes exceed the limit;
- unauthenticated client reports receive 401;
- malformed, oversize, and disallowed payloads are rejected without logging their contents;
- sanitizer redacts known secrets, drops URL query strings, and bounds every retained field; and
- structured reports include the safe correlation fields while excluding raw user identity.

The implementation also includes a manual production smoke check that triggers a known test error,
confirms a scrubbed Sentry issue, validates its deployment/release tags, and verifies that the
corresponding Vercel structured log can be located by its request or incident ID.

## Acceptance Mapping

- Generic boundary UI and sanitizer coverage ensure internal provider/database messages never
  reach users.
- Streamed-byte enforcement proves oversized chunked or headerless bodies are rejected.
- Sentry event tags and Vercel structured logs provide correlation from a user-reported incident
  to deployment and failing action.
