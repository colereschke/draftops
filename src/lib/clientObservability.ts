import * as Sentry from '@sentry/nextjs';

export function createIncidentId(): string {
  return globalThis.crypto.randomUUID();
}

/** Captures a browser-only failure without sending it back through the application. */
export function captureClientError(error: Error, incidentId: string): void {
  Sentry.captureException(error, {
    tags: {
      'incident.id': incidentId,
    },
  });
}
