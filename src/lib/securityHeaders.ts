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
