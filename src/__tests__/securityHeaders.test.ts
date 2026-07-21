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
    expect(headers.document[0]?.key).toBe('Content-Security-Policy-Report-Only');
    expect(headers.document[0]?.value).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline'; script-src-attr 'none'; style-src " +
        "'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src " +
        "'self' https://example.ingest.us.sentry.io; worker-src 'self' blob:; manifest-src 'self'; " +
        "media-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; " +
        "frame-ancestors 'none'; upgrade-insecure-requests",
    );
  });

  it('uses self only for connect-src when the Sentry DSN is invalid', () => {
    const csp = buildSecurityHeaders({
      nodeEnv: 'production',
      sentryDsn: 'https://public@example.invalid/123',
    }).document[0]?.value;

    expect(csp).toContain("connect-src 'self';");
  });

  it('adds development-only React diagnostics and HMR allowances', () => {
    const csp = buildSecurityHeaders({ nodeEnv: 'development', sentryDsn: undefined }).document[0]
      ?.value;
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
    expect(csp).not.toContain('upgrade-insecure-requests');
  });
});
