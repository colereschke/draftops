import { sanitizeObservabilityIdentifier } from '@/lib/observabilitySanitizer';

interface ErrorWithDigest extends Error {
  digest?: unknown;
}

export interface IncidentDetails {
  incidentId: string;
  hasDigest: boolean;
}

export function createIncidentId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Converts a framework digest into a safe correlation ID without exposing its raw value.
 * `hasDigest` remains separate so client boundaries do not duplicate server-side capture.
 */
export function deriveIncidentDetails(error: unknown): IncidentDetails {
  const digest = error instanceof Error ? (error as ErrorWithDigest).digest : undefined;
  const hasDigest = typeof digest === 'string' && digest.length > 0;

  return {
    incidentId: sanitizeObservabilityIdentifier(digest) ?? createIncidentId(),
    hasDigest,
  };
}
