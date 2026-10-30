import * as Sentry from '@sentry/nextjs';

import { createIncidentId } from '@/lib/incident';
import { logServerError } from '@/lib/observabilityLogger';

const AUTH_ROUTE_PATH = '/api/auth';

interface AuthErrorLike extends Error {
  type?: unknown;
}

function authErrorType(error: AuthErrorLike): string {
  return typeof error.type === 'string' ? error.type : error.name;
}

/** Auth.js wraps the failure that matters (e.g. an OAuth response check) in `cause.err`. */
function rootCause(error: Error): Error | undefined {
  const { cause } = error;
  if (cause && typeof cause === 'object' && 'err' in cause && cause.err instanceof Error) {
    return cause.err;
  }
  return undefined;
}

/**
 * Auth.js `logger.error` hook. Auth.js handles its own errors and redirects to an error page,
 * so without this a broken sign-in only shows up as console output. The Auth.js error type
 * and root-cause message are kept for grouping; the Sentry `beforeSend` sanitizer and
 * `logServerError` scrub everything else, including the cause's provider details.
 */
export function reportAuthError(error: Error): void {
  const type = authErrorType(error);
  const reported = new Error(rootCause(error)?.message ?? error.message);
  reported.name = type;
  const incidentId = createIncidentId();
  const action = `auth.${type.toLowerCase()}`;

  Sentry.withScope((scope) => {
    scope.setTag('incident.id', incidentId);
    scope.setTag('action', action);
    scope.setTag('route.path', AUTH_ROUTE_PATH);
    Sentry.captureException(reported);
  });

  logServerError({ incidentId, action, routePath: AUTH_ROUTE_PATH, error: reported });
}
