import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import { buildSecurityHeaders } from './src/lib/securityHeaders';

const securityHeaders = buildSecurityHeaders({
  nodeEnv: process.env.NODE_ENV,
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
});

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders.application },
      {
        source: '/((?!api|_next/static|_next/image|icon\\.svg|favicon\\.ico).*)',
        headers: securityHeaders.document,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
