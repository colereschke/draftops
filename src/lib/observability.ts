import 'server-only';

import { createHmac } from 'node:crypto';

import {
  isUserCorrelationId,
  sanitizeErrorSummary,
  sanitizeObservabilityAction,
  sanitizeObservabilityEnvironment,
  sanitizeObservabilityIdentifier,
  sanitizeRoutePath,
} from '@/lib/observabilitySanitizer';

export interface ServerErrorLogInput {
  incidentId: string;
  action: string;
  routePath: string;
  error: unknown;
  draftId?: string;
  requestId?: string;
  userId?: string;
}

interface ServerErrorLogRecord {
  event: 'server_error';
  incidentId?: string;
  action?: string;
  routePath: string;
  errorSummary?: string;
  deploymentEnvironment?: string;
  deploymentId?: string;
  draftId?: string;
  requestId?: string;
  userCorrelationId?: string;
}

export function createUserCorrelationId(userId: string): string | undefined {
  const hashKey = process.env.OBSERVABILITY_HASH_KEY;

  if (!hashKey) {
    return undefined;
  }

  const userCorrelationId = createHmac('sha256', hashKey).update(userId).digest('hex');
  return isUserCorrelationId(userCorrelationId) ? userCorrelationId : undefined;
}

/** Emits a single JSON log record with only approved, scrubbed context. */
export function logServerError(input: ServerErrorLogInput): void {
  const errorSummary = sanitizeErrorSummary(input.error);
  const userCorrelationId = input.userId ? createUserCorrelationId(input.userId) : undefined;
  const incidentId = sanitizeObservabilityIdentifier(input.incidentId);
  const action = sanitizeObservabilityAction(input.action);
  const draftId = sanitizeObservabilityIdentifier(input.draftId);
  const requestId = sanitizeObservabilityIdentifier(input.requestId);
  const deploymentId = sanitizeObservabilityIdentifier(process.env.VERCEL_DEPLOYMENT_ID);
  const deploymentEnvironment = sanitizeObservabilityEnvironment(process.env.VERCEL_ENV);
  const record: ServerErrorLogRecord = {
    event: 'server_error',
    routePath: sanitizeRoutePath(input.routePath),
    ...(incidentId ? { incidentId } : {}),
    ...(action ? { action } : {}),
    ...(draftId ? { draftId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(errorSummary ? { errorSummary } : {}),
    ...(userCorrelationId ? { userCorrelationId } : {}),
    ...(deploymentId ? { deploymentId } : {}),
    ...(deploymentEnvironment ? { deploymentEnvironment } : {}),
  };

  console.error(JSON.stringify(record));
}
