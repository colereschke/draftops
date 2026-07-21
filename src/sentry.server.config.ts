import * as Sentry from '@sentry/nextjs';

import { sanitizeSentryEvent } from '@/lib/observabilitySanitizer';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  sendDefaultPii: false,
  tracesSampleRate: 0,
  enableLogs: false,
  beforeSend: (event) => sanitizeSentryEvent(event) as typeof event | null,
  release: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.SENTRY_RELEASE,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
