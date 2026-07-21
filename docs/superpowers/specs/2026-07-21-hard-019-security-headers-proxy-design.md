# HARD-019 Security Headers, Report-Only CSP, and Proxy Migration

## Goal

Harden browser-facing responses without risking a production outage from an untested enforced
Content Security Policy (CSP). Migrate the request boundary to Next.js 16's `proxy.ts`
convention while preserving defense-in-depth authorization in server actions and API routes.

## Scope

- Replace the root `middleware.ts` file with `proxy.ts`, retaining the current protected-route
  matcher and redirect behavior.
- Add global enforced security headers for MIME sniffing, referrer disclosure, browser features,
  and framing.
- Add a `Content-Security-Policy-Report-Only` header plus a CSP-report endpoint that accepts only
  standard violation-report payloads and sends sanitized diagnostics through existing error
  observability.
- Add tests for the header contract, proxy behavior, report validation/sanitization, and direct
  authorization that does not depend on the proxy.

## Explicit non-goals

- Enforcing CSP in this change.
- Adding a nonce strategy or allowing arbitrary inline scripts/styles.
- Changing action or API authorization semantics.
- Adding a new third-party security reporting service.

## Design

`next.config.ts` owns the static, global response-header contract. The CSP starts in report-only
mode and lists only the known Next.js, Auth.js/Discord, Sentry, and application asset needs. A
dedicated API endpoint validates the report content type and body, strips sensitive and
high-cardinality fields, and reports a concise diagnostic using the existing observability path.
Malformed reports return a safe client error and are not observed.

The root request boundary becomes `proxy.ts`, exporting the Auth.js wrapper and the existing
matcher unchanged. It redirects unauthenticated page requests to `/sign-in` and continues to
exclude API and Next static routes. Server actions and API handlers continue to call their own
authorization guards; the proxy is not treated as an authorization boundary for direct calls.

## Rollout and enforcement gate

Deploy report-only CSP first and observe production violations across sign-in, OAuth return,
dialogs, value-sheet interactions, and error reporting. Before changing to enforced CSP, narrow
the policy from the observed legitimate sources, add any necessary nonce strategy, and run browser
acceptance flows. An enforced policy must not be added merely by renaming the header.

## Verification

- Unit tests assert the exact required headers and report-only CSP presence.
- Proxy tests retain the existing unauthenticated redirect/matcher behavior.
- Route tests reject malformed CSP reports and ensure sanitized reports do not include sensitive
  request data.
- Existing action/API authorization tests remain passing without proxy involvement.
- Browser smoke tests check the response headers and unauthenticated sign-in redirect.
