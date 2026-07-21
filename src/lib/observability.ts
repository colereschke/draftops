import 'server-only';

import { createHmac } from 'node:crypto';

import {
  logServerError as logSanitizedServerError,
  type ServerErrorLogInput as SanitizedServerErrorLogInput,
} from '@/lib/observabilityLogger';
import { isUserCorrelationId } from '@/lib/observabilitySanitizer';

export interface ServerErrorLogInput extends Omit<
  SanitizedServerErrorLogInput,
  'userCorrelationId'
> {
  userId?: string;
}

export function createUserCorrelationId(userId: string): string | undefined {
  const hashKey = process.env.OBSERVABILITY_HASH_KEY;

  if (!hashKey) {
    return undefined;
  }

  const userCorrelationId = createHmac('sha256', hashKey).update(userId).digest('hex');
  return isUserCorrelationId(userCorrelationId) ? userCorrelationId : undefined;
}

/** Adds Node-only user correlation before emitting a scrubbed JSON log record. */
export function logServerError(input: ServerErrorLogInput): void {
  const userCorrelationId = input.userId ? createUserCorrelationId(input.userId) : undefined;
  logSanitizedServerError({
    incidentId: input.incidentId,
    action: input.action,
    routePath: input.routePath,
    error: input.error,
    ...(input.draftId ? { draftId: input.draftId } : {}),
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(userCorrelationId ? { userCorrelationId } : {}),
  });
}
