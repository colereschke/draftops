# HARD-019 Security Headers, Report-Only CSP, and Proxy Migration

## Goal

Harden browser-facing responses without risking a production outage from an untested enforced
Content Security Policy (CSP). Migrate the request boundary to Next.js 16's `proxy.ts`
convention while preserving defense-in-depth authorization in server actions and API routes.

## Decisions

- Enforce the low-risk security headers in this change.
- Ship CSP in report-only mode. Enforcement is a separate change after browser violations are
  understood and the nonce/performance tradeoff is chosen explicitly.
- Do not add a public CSP-report ingestion route. HARD-014 removed an unauthenticated,
  rate-unlimited client-error endpoint; recreating that log-spam and cost-amplification surface
  under a new name would regress the security posture.
- Collect CSP violations in controlled Playwright acceptance runs. Production collection requires
  a separately approved, rate-limited reporting sink.

## Scope

- Move the request boundary from root `middleware.ts` to `src/proxy.ts`, alongside `src/app` as
  required for a project using the `src` convention.
- Preserve the existing authenticated-page redirect behavior and API exclusion.
- Exclude the current `icon.svg` metadata route as well as Next.js static/image assets so public
  metadata is not routed through authentication.
- Add enforced response headers for MIME sniffing, referrer disclosure, browser capabilities, and
  framing.
- Add a static `Content-Security-Policy-Report-Only` header to document responses.
- Add focused unit/configuration and production-browser coverage.

## Explicit non-goals

- Enforcing CSP in this change.
- Adding a nonce strategy or forcing every page into dynamic rendering.
- Adding a CSP-report API route or a new third-party reporting service.
- Changing server-action or route-handler authorization semantics.
- Adding HSTS preload or subdomain policy without a separate review of every production domain.

## Response-header design

Define the header values in one side-effect-free module that `next.config.ts` and unit tests can
both import. Apply the non-CSP headers to all application responses:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy` disabling unused capabilities, initially camera, microphone, geolocation,
  payment, USB, and browsing topics

Apply `Content-Security-Policy-Report-Only` to document routes rather than API and static-asset
responses. The production policy is intentionally compatible with the current static Next.js
setup and starts with these directives:

```text
default-src 'self'
script-src 'self' 'unsafe-inline'
script-src-attr 'none'
style-src 'self' 'unsafe-inline'
img-src 'self' blob: data:
font-src 'self' data:
connect-src 'self' [configured Sentry ingest origin]
worker-src 'self' blob:
manifest-src 'self'
media-src 'none'
frame-src 'none'
object-src 'none'
base-uri 'self'
form-action 'self'
frame-ancestors 'none'
upgrade-insecure-requests
```

The bracketed Sentry origin is omitted when no valid public DSN is configured. Discord and Sleeper
origins are not allowlisted because OAuth uses top-level navigation and Sleeper requests are
server-side. Development may add `'unsafe-eval'` and websocket schemes for React diagnostics and
hot reloading; those allowances must not enter the production header.

`'unsafe-inline'` is explicit technical debt, not the target strict policy. Next.js needs it for a
static policy without nonces; `script-src-attr 'none'` still blocks injected HTML event-handler
attributes. A future nonce design can remove the script allowance, but would force dynamic page
rendering and change caching behavior.

The exact serialized policy is a tested contract. Policy construction must reject or omit an
invalid Sentry DSN rather than copying an arbitrary environment string into a response header.

## Proxy design

Create `src/proxy.ts` and remove root `middleware.ts`. Export a named `proxy` function wrapping the
existing Auth.js callback, which matches current Auth.js guidance for Next.js 16. It redirects an
unauthenticated document request to `/sign-in` with the original URL in `callbackUrl`.

Keep API routes outside the proxy matcher. Their handlers, and all server actions, continue to
perform their own authentication and ownership checks. Proxy remains navigation convenience and
defense in depth, not the authorization boundary for direct calls.

## Violation review and enforcement gate

Playwright installs a `securitypolicyviolation` listener before navigation and captures bounded,
non-sensitive fields: violated directive, disposition, document pathname, and blocked resource
scheme/origin without query strings, fragments, or credentials. Acceptance runs cover signed-out
redirect/sign-in, authenticated draft pages, dialogs, navigation, and client-side Sentry startup.

Before a follow-up changes the header from report-only to enforced:

1. Resolve unexplained browser violations.
2. Decide whether a compatibility policy with inline allowances is sufficient or whether strict
   script/style protection justifies per-request nonces.
3. If using nonces, account for Next.js's dynamic-rendering requirement, loss of normal static/CDN
   caching, and incompatibility with Partial Prerendering.
4. Run OAuth callback, dialogs, styling, navigation, and error-reporting acceptance flows against
   the enforced candidate.
5. Add production violation collection only through a privacy-reviewed, tightly rate-limited
   first- or third-party sink.

Enforcement must not be implemented merely by renaming the header.

## Verification

- Unit tests assert the exact security-header values, CSP directives, environment differences,
  and safe Sentry-origin derivation.
- Next.js proxy matcher tests verify protected pages, excluded APIs/static assets/metadata, and the
  sign-in route exclusion.
- The existing unauthenticated Playwright test verifies redirect behavior and response headers
  from a production build.
- Authenticated Playwright coverage collects and reports CSP violations across representative
  application flows without sending browser-controlled payloads to a server endpoint.
- Existing server-action and API authorization tests remain passing without proxy involvement.
- `pnpm tsc --noEmit`, `pnpm lint`, targeted tests, and `make check` pass before review.
