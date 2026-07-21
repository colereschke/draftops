import * as Sentry from '@sentry/nextjs';
import type { Instrumentation } from 'next';

import { deriveIncidentDetails } from '@/lib/incident';
import { logServerError } from '@/lib/observabilityLogger';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
    return;
  }

  await import('./sentry.server.config');
}

export const onRequestError: Instrumentation.onRequestError = (error, request, errorContext) => {
  const { incidentId } = deriveIncidentDetails(error);
  const draftId = getDraftId(request.path);
  const requestId = getHeader(request.headers, 'x-vercel-id');

  Sentry.withScope((scope) => {
    scope.setTag('incident.id', incidentId);
    scope.setTag('action', errorContext.routeType);
    scope.setTag('route.path', errorContext.routePath);
    if (draftId) {
      scope.setTag('draft.id', draftId);
    }
    if (requestId) {
      scope.setTag('request.id', requestId);
    }
    Sentry.captureRequestError(error, request, errorContext);
  });

  logServerError({
    incidentId,
    action: errorContext.routeType,
    routePath: errorContext.routePath,
    error,
    ...(draftId ? { draftId } : {}),
    ...(requestId ? { requestId } : {}),
  });
};

function getDraftId(path: string): string | undefined {
  try {
    const pathname = new URL(path, 'https://draftops.invalid').pathname;
    return /^\/draft\/([^/]+)(?:\/|$)/.exec(pathname)?.[1];
  } catch {
    return undefined;
  }
}

function getHeader(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}
