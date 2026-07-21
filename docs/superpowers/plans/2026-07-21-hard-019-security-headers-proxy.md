# HARD-019 Security Headers, Report-Only CSP, and Proxy Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add enforced baseline security headers, a safe report-only CSP, and the Next.js 16 proxy
file convention without weakening independent action and route authorization.

**Architecture:** A pure header-builder module owns the static response-header contract, which
`next.config.ts` consumes for every build and unit tests consume directly. `src/proxy.ts` retains
the Auth.js redirect as navigation defense in depth. Browser tests collect CSP violations in-memory;
no browser-controlled report payload is sent to the server.

**Tech Stack:** Next.js 16.2, Auth.js v5, TypeScript, Jest, Playwright, `@sentry/nextjs`.

## Global Constraints

- Keep CSP report-only; this change must not add `Content-Security-Policy`.
- Do not add a CSP-report endpoint, persistence model, or third-party reporting service.
- Keep API and server-action authentication/ownership checks independent of `src/proxy.ts`.
- Place the request boundary at `src/proxy.ts`; proxy matchers must remain literal constants.
- Parse `NEXT_PUBLIC_SENTRY_DSN` as a URL and allow only a valid HTTPS Sentry ingest origin.
- Permit the public-key username in a standard public Sentry DSN; reject a password or an invalid
  HTTPS ingest origin so no secret or arbitrary environment value enters the CSP.
- Retain only directive, disposition, document pathname, and blocked scheme/origin in browser tests.
- Use `data-testid` selectors in browser tests, single quotes, trailing commas, and 2-space indent.

---

## File Structure

- Create `src/lib/securityHeaders.ts`: pure header and CSP construction, including safe DSN parsing.
- Create `src/__tests__/securityHeaders.test.ts`: Node unit coverage of exact header values.
- Modify `next.config.ts`: apply baseline headers globally and report-only CSP to document routes.
- Create `src/proxy.ts` and delete `middleware.ts`: named Auth.js proxy and literal matcher.
- Create `src/__tests__/proxy.test.ts`: matcher and unauthenticated redirect tests.
- Create `e2e/cspViolations.ts` and `e2e/csp.spec.ts`: privacy-bounded browser CSP coverage.
- Modify `e2e/auth.spec.ts` and `playwright.config.ts`: header assertion and authenticated test match.

## Task 1: Implement and apply the static security-header contract

**Files:**

- Create: `src/lib/securityHeaders.ts`
- Create: `src/__tests__/securityHeaders.test.ts`
- Modify: `next.config.ts`

**Interfaces:**

- `getSentryIngestOrigin(dsn: string | undefined): string | undefined`
- `buildSecurityHeaders(environment: SecurityHeaderEnvironment): SecurityHeaders`
- `SecurityHeaders.application` applies to `/:path*`; `SecurityHeaders.document` applies only to
  document routes.

- [ ] **Step 1: Write the failing Node unit test**

Create `src/__tests__/securityHeaders.test.ts`:

```ts
/** @jest-environment node */

import {
  buildSecurityHeaders,
  getSentryIngestOrigin,
  type SecurityHeaderEnvironment,
} from '@/lib/securityHeaders';

const PRODUCTION: SecurityHeaderEnvironment = {
  nodeEnv: 'production',
  sentryDsn: 'https://public@example.ingest.us.sentry.io/123',
};

describe('security headers', () => {
  it('derives only a valid HTTPS Sentry ingest origin', () => {
    expect(getSentryIngestOrigin(PRODUCTION.sentryDsn)).toBe('https://example.ingest.us.sentry.io');
    expect(getSentryIngestOrigin('https://public@example.invalid/123')).toBeUndefined();
    expect(
      getSentryIngestOrigin('https://public:secret@example.ingest.sentry.io/123'),
    ).toBeUndefined();
    expect(getSentryIngestOrigin('not a URL')).toBeUndefined();
  });

  it('returns enforced baseline headers and production-only CSP directives', () => {
    const headers = buildSecurityHeaders(PRODUCTION);

    expect(headers.application).toEqual([
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
      },
    ]);
    const csp = headers.document[0]?.value ?? '';
    expect(headers.document[0]?.key).toBe('Content-Security-Policy-Report-Only');
    expect(csp).toContain("connect-src 'self' https://example.ingest.us.sentry.io");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain(' ws:');
  });

  it('adds development-only React diagnostics and HMR allowances', () => {
    const csp = buildSecurityHeaders({ nodeEnv: 'development', sentryDsn: undefined }).document[0]
      ?.value;
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
    expect(csp).not.toContain('upgrade-insecure-requests');
  });
});
```

- [ ] **Step 2: Verify the test fails**

Run: `pnpm exec jest src/__tests__/securityHeaders.test.ts`

Expected: FAIL because `@/lib/securityHeaders` does not exist.

- [ ] **Step 3: Implement the pure header builder**

Create `src/lib/securityHeaders.ts` with this contract:

```ts
export interface HeaderValue {
  key: string;
  value: string;
}

export interface SecurityHeaderEnvironment {
  nodeEnv: string | undefined;
  sentryDsn: string | undefined;
}

export interface SecurityHeaders {
  application: HeaderValue[];
  document: HeaderValue[];
}

const SENTRY_INGEST_HOST = /(?:^|\.)ingest(?:\.[a-z0-9-]+)*\.sentry\.io$/i;

export function getSentryIngestOrigin(dsn: string | undefined): string | undefined {
  if (!dsn) return undefined;
  try {
    const url = new URL(dsn);
    if (
      url.protocol !== 'https:' ||
      url.password ||
      url.pathname === '/' ||
      !SENTRY_INGEST_HOST.test(url.hostname)
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

export function buildSecurityHeaders({
  nodeEnv,
  sentryDsn,
}: SecurityHeaderEnvironment): SecurityHeaders {
  const development = nodeEnv === 'development';
  const sentryOrigin = getSentryIngestOrigin(sentryDsn);
  const connectSources = [
    "'self'",
    ...(sentryOrigin ? [sentryOrigin] : []),
    ...(development ? ['ws:', 'wss:'] : []),
  ];
  const scriptSources = ["'self'", "'unsafe-inline'", ...(development ? ["'unsafe-eval'"] : [])];
  const csp = [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(' ')}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(!development ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  return {
    application: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
      },
    ],
    document: [{ key: 'Content-Security-Policy-Report-Only', value: csp }],
  };
}
```

- [ ] **Step 4: Apply the contract in `next.config.ts`**

Import `buildSecurityHeaders`, construct it once from `NODE_ENV` and `NEXT_PUBLIC_SENTRY_DSN`, and
add this `headers` method to the existing `nextConfig` object:

```ts
async headers() {
  return [
    { source: '/:path*', headers: securityHeaders.application },
    {
      source: '/((?!api|_next/static|_next/image|icon\\.svg|favicon\\.ico).*)',
      headers: securityHeaders.document,
    },
  ];
},
```

Keep the current `turbopack` object and the existing `withSentryConfig` wrapper and options.

- [ ] **Step 5: Verify and commit the header work**

Run: `pnpm exec jest src/__tests__/securityHeaders.test.ts && pnpm format:check`

Expected: PASS.

```bash
git add next.config.ts src/lib/securityHeaders.ts src/__tests__/securityHeaders.test.ts
git commit -m "feat: add report-only CSP security headers"
```

## Task 2: Migrate the Auth.js request boundary to `src/proxy.ts`

**Files:**

- Create: `src/proxy.ts`
- Create: `src/__tests__/proxy.test.ts`
- Delete: `middleware.ts`

**Interfaces:**

- Produces named `proxy`, an Auth.js-wrapped request function.
- Produces literal `config.matcher` for Next.js static analysis.
- Consumes `auth` from `src/auth.ts`; it does not replace action or route authorization.

- [ ] **Step 1: Write failing matcher and redirect tests**

Create `src/__tests__/proxy.test.ts`:

```ts
/** @jest-environment node */

import { getRedirectUrl, unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest, type NextResponse } from 'next/server';

jest.mock('@/auth', () => ({
  auth: (callback: (request: NextRequest & { auth?: unknown }) => Response | undefined) => callback,
}));

import { config, proxy } from '@/proxy';

describe('proxy matcher', () => {
  it.each([
    ['/', true],
    ['/draft/1', true],
    ['/sign-in', false],
    ['/api/health', false],
    ['/_next/static/chunk.js', false],
    ['/_next/image?url=%2Fplayer.png', false],
    ['/icon.svg', false],
    ['/favicon.ico', false],
  ])('matches %s: %s', (url, expected) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(expected);
  });

  it('redirects an unauthenticated document request with its complete callback URL', async () => {
    const response = await proxy(new NextRequest('https://draftops.test/draft/1?view=budget'));
    const redirectUrl = getRedirectUrl(response as NextResponse);
    expect(redirectUrl).not.toBeNull();
    const redirect = new URL(redirectUrl ?? 'https://draftops.test');

    expect(redirect.pathname).toBe('/sign-in');
    expect(redirect.searchParams.get('callbackUrl')).toBe(
      'https://draftops.test/draft/1?view=budget',
    );
  });
});
```

The installed Next 16.2 package exports the compatibility helper as
`unstable_doesMiddlewareMatch`; it tests the same matcher contract documented for proxy.

- [ ] **Step 2: Verify the test fails before migration**

Run: `pnpm exec jest src/__tests__/proxy.test.ts`

Expected: FAIL because `@/proxy` does not exist.

- [ ] **Step 3: Create the named proxy and remove the deprecated file**

Create `src/proxy.ts`:

```ts
import { NextResponse } from 'next/server';
import { auth } from './auth';

export const proxy = auth((request) => {
  if (!request.auth) {
    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: ['/((?!api|sign-in|_next/static|_next/image|icon\\.svg|favicon\\.ico).*)'],
};
```

Delete exactly the root `middleware.ts`; do not leave both request-boundary conventions in the
repository.

- [ ] **Step 4: Run focused proxy and authorization regression tests**

Run: `pnpm exec jest src/__tests__/proxy.test.ts src/__tests__/actions.test.ts src/__tests__/api/watchlist.test.ts`

Expected: PASS. The direct action and API tests demonstrate that their authorization remains
independent from proxy execution.

- [ ] **Step 5: Commit the proxy migration**

```bash
git add src/proxy.ts src/__tests__/proxy.test.ts middleware.ts
git commit -m "refactor: migrate auth middleware to proxy"
```

## Task 3: Add privacy-bounded browser header and CSP coverage

**Files:**

- Create: `e2e/cspViolations.ts`
- Create: `e2e/csp.spec.ts`
- Modify: `e2e/auth.spec.ts`
- Modify: `playwright.config.ts`

**Interfaces:**

- `installCspViolationCollector(page: Page): Promise<void>` installs a browser event listener.
- `readCspViolations(page: Page): Promise<CspViolation[]>` returns bounded test-only records.
- `CspViolation` contains only `directive`, `disposition`, `documentPath`, and `blockedResource`.

- [ ] **Step 1: Create the bounded browser-side collector**

Create `e2e/cspViolations.ts`:

```ts
import type { Page } from '@playwright/test';

export interface CspViolation {
  directive: string;
  disposition: string;
  documentPath: string;
  blockedResource: string;
}

const COLLECTOR_KEY = '__draftopsCspViolations';

export async function installCspViolationCollector(page: Page): Promise<void> {
  await page.addInitScript((collectorKey) => {
    type CollectorWindow = Window & { [key: string]: CspViolation[] | undefined };
    const collectorWindow = window as CollectorWindow;
    collectorWindow[collectorKey] = [];
    const safeBlockedResource = (value: string) => {
      if (['inline', 'eval', 'wasm-eval'].includes(value)) return value;
      try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : url.protocol;
      } catch {
        return 'other';
      }
    };

    window.addEventListener('securitypolicyviolation', (event) => {
      collectorWindow[collectorKey]?.push({
        directive: event.effectiveDirective || event.violatedDirective,
        disposition: event.disposition,
        documentPath: new URL(event.documentURI).pathname,
        blockedResource: safeBlockedResource(event.blockedURI),
      });
    });
  }, COLLECTOR_KEY);
}

export async function readCspViolations(page: Page): Promise<CspViolation[]> {
  return page.evaluate((collectorKey) => {
    type CollectorWindow = Window & { [key: string]: CspViolation[] | undefined };
    return [...((window as CollectorWindow)[collectorKey] ?? [])];
  }, COLLECTOR_KEY);
}
```

- [ ] **Step 2: Add header and representative-flow acceptance tests**

Update `e2e/auth.spec.ts` so the existing test checks the final `/sign-in` response:

```ts
const response = await page.goto('/');
await expect(page).toHaveURL(/\/sign-in/);
expect(response?.headers()['x-content-type-options']).toBe('nosniff');
expect(response?.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
expect(response?.headers()['x-frame-options']).toBe('DENY');
expect(response?.headers()['permissions-policy']).toContain('camera=()');
expect(response?.headers()['content-security-policy-report-only']).toContain("default-src 'self'");
expect(response?.headers()['content-security-policy']).toBeUndefined();
```

Create `e2e/csp.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { installCspViolationCollector, readCspViolations } from './cspViolations';
import { getSeededDraftId } from './fixtures/getDraftId';
import { BID_TARGET } from './fixtures/players';

test('report-only CSP has no violations across representative authenticated flows', async ({
  page,
}) => {
  await installCspViolationCollector(page);
  const draftId = await getSeededDraftId();

  await page.goto(`/draft/${draftId}`);
  await page.getByTestId(`player-row-${BID_TARGET.sfRank}`).click();
  await expect(page.getByTestId('bid-price')).toBeVisible();

  await page.goto(`/draft/${draftId}/nominate`);
  await expect(page.getByTestId('nomination-helper-layout')).toBeVisible();
  await page.goto(`/draft/${draftId}/budget`);
  await expect(page.getByTestId('threat-pos-QB')).toBeVisible();

  expect(await readCspViolations(page)).toEqual([]);
});
```

The tested controls use existing stable IDs: `player-row-*`, `bid-price`,
`nomination-helper-layout`, and `threat-pos-QB`. Do not replace them with visible-text or CSS
class selectors.

- [ ] **Step 3: Include the new spec in the authenticated Playwright project**

Change the authenticated `testMatch` in `playwright.config.ts` to:

```ts
testMatch: /(bid|csp|nominate|rosters)\.spec\.ts/,
```

- [ ] **Step 4: Run production browser acceptance**

With `DATABASE_URL` set to a disposable local E2E database:

```bash
pnpm tsx e2e/seed.ts
pnpm build
PLAYWRIGHT_FORCE_NEW_SERVER=1 pnpm exec playwright test --project=unauthenticated --project=authenticated
```

Expected: PASS. If a CSP violation occurs, retain the bounded collector output in the assertion
failure and add only a documented legitimate source; never add wildcards or production
`'unsafe-eval'`.

- [ ] **Step 5: Commit browser coverage**

```bash
git add e2e/cspViolations.ts e2e/csp.spec.ts e2e/auth.spec.ts playwright.config.ts
git commit -m "test: cover security headers and CSP violations"
```

## Task 4: Whole-change verification and review preparation

**Files:**

- Modify only files required by narrowly scoped test fixes discovered in Tasks 1-3.

**Interfaces:**

- Consumes all header, proxy, and browser-test interfaces above.
- Produces a review-ready branch with no generated output or unrelated files.

- [ ] **Step 1: Inspect final scope and deletion state**

Run: `git status --short && git diff main...HEAD --check && git diff main...HEAD --stat`

Expected: no `middleware.ts`, CSP-report endpoint, generated Playwright auth state, or unrelated
files. The changed files must be those listed in this plan plus deliberate test-fix files.

- [ ] **Step 2: Run the complete required quality gate**

Run: `make check`

Expected: TypeScript, ESLint, Prettier, and every Jest suite pass.

- [ ] **Step 3: Run production browser acceptance on the disposable database**

Run:

```bash
pnpm tsx e2e/seed.ts
pnpm build
PLAYWRIGHT_FORCE_NEW_SERVER=1 pnpm exec playwright test --project=unauthenticated --project=authenticated
```

Expected: all unauthenticated and authenticated smoke tests pass with no collected CSP violations.

- [ ] **Step 4: Perform final security review**

Confirm from the diff and test output that:

- the only CSP header is `Content-Security-Policy-Report-Only`;
- the production policy contains no `'unsafe-eval'`, `ws:`, or `wss:`;
- invalid DSNs cannot become CSP source expressions;
- API routes and server actions retain their existing direct authorization tests;
- `src/proxy.ts` is the only request-boundary convention;
- sign-in redirect and public metadata routes remain accessible as designed.

- [ ] **Step 5: Commit a concrete review fix only when needed**

If review uncovers a defect, add and commit only the exact source and test files changed to correct
that defect with `fix: address HARD-019 review findings`. If no review fix is required, do not
create an empty commit. Record exact passing commands and suite counts in the eventual
pull-request description.
