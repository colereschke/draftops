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
  userCorrelationId?: string;
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

/**
 * Emits one scrubbed JSON record. This module is safe to import from Node and
 * Edge instrumentation; Node-only user correlation is added by observability.ts.
 */
export function logServerError(input: ServerErrorLogInput): void {
  const errorSummary = sanitizeErrorSummary(input.error);
  const incidentId = sanitizeObservabilityIdentifier(input.incidentId);
  const action = sanitizeObservabilityAction(input.action);
  const draftId = sanitizeObservabilityIdentifier(input.draftId);
  const requestId = sanitizeObservabilityIdentifier(input.requestId);
  const deploymentId = sanitizeObservabilityIdentifier(process.env.VERCEL_DEPLOYMENT_ID);
  const deploymentEnvironment = sanitizeObservabilityEnvironment(process.env.VERCEL_ENV);
  const userCorrelationId = isUserCorrelationId(input.userCorrelationId)
    ? input.userCorrelationId
    : undefined;
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
