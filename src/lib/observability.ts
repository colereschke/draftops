import 'server-only';

import { createHmac } from 'node:crypto';

import { sanitizeErrorSummary, sanitizeRoutePath } from '@/lib/observabilitySanitizer';

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
  incidentId: string;
  action: string;
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

  return createHmac('sha256', hashKey).update(userId).digest('hex');
}

/** Emits a single JSON log record with only approved, scrubbed context. */
export function logServerError(input: ServerErrorLogInput): void {
  const errorSummary = sanitizeErrorSummary(input.error);
  const userCorrelationId = input.userId ? createUserCorrelationId(input.userId) : undefined;
  const record: ServerErrorLogRecord = {
    event: 'server_error',
    incidentId: input.incidentId,
    action: input.action,
    routePath: sanitizeRoutePath(input.routePath),
    ...(input.draftId ? { draftId: input.draftId } : {}),
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(errorSummary ? { errorSummary } : {}),
    ...(userCorrelationId ? { userCorrelationId } : {}),
    ...(process.env.VERCEL_DEPLOYMENT_ID ? { deploymentId: process.env.VERCEL_DEPLOYMENT_ID } : {}),
    ...(process.env.VERCEL_ENV ? { deploymentEnvironment: process.env.VERCEL_ENV } : {}),
  };

  console.error(JSON.stringify(record));
}
