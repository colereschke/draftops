# HARD-014 Error Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw error leakage and client relay logging with one scrubbed, correlatable Sentry capture path and a monitored database health route.

**Architecture:** Server errors pass through Next.js instrumentation to Sentry and one structured Vercel log. Client-only errors keep a stable UUID and capture once with that UUID as `incident.id`. The browser-to-app error relay is deleted.

**Tech Stack:** Next.js 16, TypeScript 5, React 19, Prisma 7, Jest 30, `@sentry/nextjs`.

## Global Constraints

- Set `sendDefaultPii: false`, `tracesSampleRate: 0`, and `enableLogs: false`; do not enable replay.
- Never capture or log cookies, authorization headers, request bodies, URL queries/fragments, email addresses, Discord IDs, or raw user IDs.
- Derive optional user correlation only with server-side `HMAC-SHA-256(userId, OBSERVABILITY_HASH_KEY)`.
- Delete `/api/log-error` and `src/lib/reportClientError.ts`; do not replace them with another browser-to-app API relay.
- Keep a Next digest as the server incident ID; use a stable UUID for client-only errors and attach it to the single Sentry capture.
- Keep `/api/health` public and return only `{ ok: true }` or `{ ok: false }`.

---

### Task 1: Configure Sentry and safe shared observability

**Files:**

- Modify: `package.json`, `pnpm-lock.yaml`, `next.config.ts`, `.env.example`
- Create: `src/instrumentation-client.ts`, `src/sentry.server.config.ts`, `src/sentry.edge.config.ts`, `src/lib/observabilitySanitizer.ts`, `src/lib/observability.ts`
- Test: `src/__tests__/sentryConfig.test.ts`, `src/__tests__/observabilitySanitizer.test.ts`, `src/__tests__/observability.test.ts`

**Interfaces:**

- `sanitizeSentryEvent(event: Event): Event | null` retains only a pathname, bounded error summary, and approved tags.
- `createUserCorrelationId(userId: string): string | undefined` returns a 64-character HMAC only when the hash key exists.
- `logServerError(input: ServerErrorLogInput): void` emits one sanitized JSON `console.error` record.

- [ ] **Step 1: Write the failing configuration and sanitizer tests**

```ts
jest.mock('@sentry/nextjs', () => ({ init: jest.fn() }));

it('initializes without PII, tracing, or log forwarding', async () => {
  await import('@/instrumentation-client');
  expect(Sentry.init).toHaveBeenCalledWith(
    expect.objectContaining({ sendDefaultPii: false, tracesSampleRate: 0, enableLogs: false }),
  );
});

it('removes queries, bodies, headers, user data, and secrets', () => {
  const event = sanitizeSentryEvent({
    request: { url: 'https://draftops.app/draft/7?token=secret#x', data: 'private' },
    user: { id: 'discord-123' },
  } as never);
  expect(event).toEqual(expect.objectContaining({ request: { url: '/draft/7' } }));
  expect(JSON.stringify(event)).not.toMatch(/secret|private|discord-123/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/__tests__/sentryConfig.test.ts src/__tests__/observabilitySanitizer.test.ts src/__tests__/observability.test.ts --runInBand`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the minimal configuration and safe logging**

Run: `pnpm add @sentry/nextjs`

Initialize the browser, Node, and Edge SDKs with the following baseline; wire `beforeSend` to `sanitizeSentryEvent`, and set release/environment from Vercel variables:

```ts
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  sendDefaultPii: false,
  tracesSampleRate: 0,
  enableLogs: false,
  beforeSend: sanitizeSentryEvent,
  release: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.SENTRY_RELEASE,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
```

Wrap `nextConfig` with `withSentryConfig` using `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `silent: !process.env.CI`, and `widenClientFileUpload: true`. Document those values plus `NEXT_PUBLIC_SENTRY_DSN` and `OBSERVABILITY_HASH_KEY` in `.env.example`.

The pure sanitizer retains only `incident.id`, `action`, `route.path`, `draft.id`, `request.id`, `deployment.id`, `deployment.environment`, and `user.correlation_id`. The server-only module uses `createHmac("sha256", key)` and serializes only sanitized fields.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/__tests__/sentryConfig.test.ts src/__tests__/observabilitySanitizer.test.ts src/__tests__/observability.test.ts --runInBand`

Expected: PASS; serialized data contains no forbidden values.

- [ ] **Step 5: Commit**

Run: `git add package.json pnpm-lock.yaml next.config.ts .env.example src/instrumentation-client.ts src/sentry.server.config.ts src/sentry.edge.config.ts src/lib/observabilitySanitizer.ts src/lib/observability.ts src/__tests__/sentryConfig.test.ts src/__tests__/observabilitySanitizer.test.ts src/__tests__/observability.test.ts && git commit -m "feat: configure safe error observability"`

### Task 2: Capture each failure once and replace raw boundary UI

**Files:**

- Create: `src/instrumentation.ts`, `src/lib/clientObservability.ts`, `src/__tests__/instrumentation.test.ts`, `src/__tests__/ErrorBoundary.test.tsx`
- Modify: `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/drafts/new/page.tsx`, `src/__tests__/drafts-new-form.test.tsx`
- Delete: `src/lib/reportClientError.ts`, `src/app/api/log-error/route.ts`, `src/__tests__/logErrorRoute.test.ts`

**Interfaces:**

- `register(): Promise<void>` loads Node/Edge SDK configuration.
- `onRequestError: Instrumentation.onRequestError` captures once, tags the digest, and writes a matching structured log.
- `createIncidentId(): string` returns a UUID; `captureClientError(error, incidentId)` invokes `Sentry.captureException` with `incident.id`.

- [ ] **Step 1: Write the failing capture and boundary tests**

```tsx
it('captures a server digest once and logs matching correlation', async () => {
  await onRequestError(
    Object.assign(new Error('database password=secret'), { digest: 'digest-123' }),
    { path: '/draft/42?token=secret', headers: { 'x-vercel-id': 'iad1::abc' } },
    { routePath: '/draft/[draftId]', routeType: 'render' } as never,
  );
  expect(mockCaptureRequestError).toHaveBeenCalledTimes(1);
  expect(logServerError).toHaveBeenCalledWith(
    expect.objectContaining({ incidentId: 'digest-123', action: 'render', draftId: '42' }),
  );
});

it('renders no raw error text and captures a client failure with the displayed ID', async () => {
  render(<Error error={new Error('postgres://user:password@host')} reset={jest.fn()} />);
  const incident = screen.getByTestId('error-incident-id').textContent;
  expect(screen.queryByText(/postgres|password/i)).not.toBeInTheDocument();
  await waitFor(() => expect(Sentry.captureException).toHaveBeenCalledTimes(1));
  expect(Sentry.captureException).toHaveBeenCalledWith(
    expect.any(Error),
    expect.objectContaining({ tags: { 'incident.id': incident } }),
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/__tests__/instrumentation.test.ts src/__tests__/ErrorBoundary.test.tsx src/__tests__/drafts-new-form.test.tsx --runInBand`

Expected: FAIL because instrumentation, client capture, and safe boundary UI do not exist.

- [ ] **Step 3: Implement one-capture server and client flows**

In `register`, dynamically import Node or Edge Sentry configuration according to `NEXT_RUNTIME`. In `onRequestError`, set `incident.id`, `action`, and `route.path` in a Sentry scope; call `captureRequestError` once; then call `logServerError` with that same digest. Parse only the first `/draft/<id>` pathname segment and never use the query string.

In both error boundaries, retain the current incident ID and a captured-error marker in refs; only use the digest when present. Capture client-only errors in a guarded `useEffect`, never during render. Render generic recovery text plus `<div data-testid="error-incident-id">Incident ID: {incidentId}</div>`.

Replace the caught draft-create relay call with `captureClientError(reportedError, createIncidentId())`, preserve its generic UI error, then delete the relay module, route, old route test, and stale test mock.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/__tests__/instrumentation.test.ts src/__tests__/ErrorBoundary.test.tsx src/__tests__/drafts-new-form.test.tsx --runInBand`

Expected: PASS; raw exception text does not render and every tested error is captured once.

- [ ] **Step 5: Commit**

Run: `git add src/instrumentation.ts src/lib/clientObservability.ts src/app/error.tsx src/app/global-error.tsx src/app/drafts/new/page.tsx src/__tests__/instrumentation.test.ts src/__tests__/ErrorBoundary.test.tsx src/__tests__/drafts-new-form.test.tsx && git rm src/lib/reportClientError.ts src/app/api/log-error/route.ts src/__tests__/logErrorRoute.test.ts && git commit -m "feat: capture errors with safe incident IDs"`

### Task 3: Add the monitored database health route and runbook

**Files:**

- Create: `src/app/api/health/route.ts`, `src/__tests__/healthRoute.test.ts`
- Modify: `README.md` or create `docs/operations/error-observability.md`

**Interfaces:**

- `GET(): Promise<NextResponse>` returns 200 `{ ok: true }` after a database probe, or 503 `{ ok: false }` on failure/timeout.
- `withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T>` rejects after two seconds and clears its timer when settled.

- [ ] **Step 1: Write the failing route tests**

```ts
it('returns only ok true after SELECT 1', async () => {
  mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

it('returns only ok false when the database fails', async () => {
  mockQueryRaw.mockRejectedValue(new Error('Neon password=secret'));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ ok: false });
  expect(logServerError).toHaveBeenCalledWith(expect.objectContaining({ action: 'health_check' }));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/__tests__/healthRoute.test.ts --runInBand`

Expected: FAIL because `/api/health` does not exist.

- [ ] **Step 3: Implement the public bounded probe and runbook**

Run `SELECT 1` through `prisma.$queryRaw`, wrapped in `withTimeout(..., 2_000)`. On failure, generate a UUID, log `action: "health_check"` through `logServerError`, and return the generic 503 body without serializing the exception. Do not authenticate this route.

Document the production sequence: configure DSN; set build-only source-map variables; set optional hash key; enable inbound filtering and email alerts; leave pay-as-you-go disabled; monitor `GET https://<production-domain>/api/health`; trigger one controlled error and verify its scrubbed incident, deployment/release tags, and matching Vercel log.

- [ ] **Step 4: Run focused and full verification**

Run: `pnpm test src/__tests__/healthRoute.test.ts --runInBand`

Expected: PASS with no provider/database detail in the response.

Run: `pnpm tsc --noEmit && pnpm lint && pnpm format:check && pnpm test --runInBand && pnpm build`

Expected: every command exits 0.

- [ ] **Step 5: Commit**

Run: `git add src/app/api/health/route.ts src/__tests__/healthRoute.test.ts README.md docs/operations/error-observability.md && git commit -m "feat: add monitored database health check" && git status --short`

Expected: no uncommitted implementation or documentation changes.

## Plan Self-Review

- Spec coverage: Task 1 configures Sentry, source maps, scrubbing, structured logging, and HMAC correlation; Task 2 handles one-capture correlation, safe UI, and relay removal; Task 3 supplies the public database monitor and operations checklist.
- Placeholder scan: each task names exact paths, interfaces, commands, expected results, and required behavior.
- Type consistency: server logging uses `incidentId`, `action`, `routePath`, optional `draftId`, optional `requestId`, `error`, and optional `userId`; client capture uses `Error` and `incidentId`.
