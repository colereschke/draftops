# Error Observability Runbook

## Production configuration

1. Create a Sentry project for DraftOps and set `NEXT_PUBLIC_SENTRY_DSN` for the Vercel
   Production environment. The runtime is intentionally disabled when this value is absent.
2. Configure `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` only as build-time Vercel
   environment variables. These allow production source maps to be uploaded and must not be
   exposed to the browser.
3. Set `OBSERVABILITY_HASH_KEY` to a dedicated, random secret if stable authenticated-user
   correlation is needed. Do not reuse `AUTH_SECRET`.
4. In Sentry, enable inbound filters and email alerts for new and escalating issues. Enable quota
   notifications and leave pay-as-you-go disabled.

## Uptime monitoring

Create a Sentry uptime monitor for:

```
GET https://<production-domain>/api/health
```

The route is deliberately public. It runs a bounded database `SELECT 1` probe and returns only
`{ "ok": true }` with HTTP 200, or `{ "ok": false }` with HTTP 503. It never returns database or
provider details. Alert on non-200 responses.

## Deployment smoke check

After the first production deployment:

1. Confirm the uptime monitor receives a 200 response from `/api/health`.
2. Trigger one controlled error from a non-production account or a temporary preview deployment.
   Remove any temporary trigger immediately after verification.
3. Verify the Sentry issue has scrubbed error data, the expected release and deployment
   environment tags, and an opaque incident ID.
4. Find the matching Vercel runtime log by its incident ID or request ID. Confirm it contains only
   the structured, sanitized fields.
5. Confirm no user identifiers, authorization values, query strings, cookies, request bodies, or
   database credentials appear in either Sentry or Vercel logs.
