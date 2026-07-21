const APPROVED_TAGS = new Set([
  'incident.id',
  'action',
  'route.path',
  'draft.id',
  'request.id',
  'deployment.id',
  'deployment.environment',
  'user.correlation_id',
]);
const MAX_ERROR_SUMMARY_LENGTH = 500;
const MAX_ROUTE_PATH_LENGTH = 200;
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_ACTION_LENGTH = 64;
const SAFE_IDENTIFIER = /^[A-Za-z0-9:_-]+$/;
const SAFE_ACTION = /^[a-z][a-z0-9_.-]*$/;
const SAFE_ENVIRONMENTS = new Set(['development', 'preview', 'production', 'test']);
const HMAC_SHA256 = /^[a-f0-9]{64}$/;
const DISCORD_SNOWFLAKE = /\d{17,20}/;
const EMAIL_ADDRESS = /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/;
const SENSITIVE_PATH_SEGMENT =
  /(?:api[-_]?key|authorization|bearer|cookie|credential|password|secret|token)/i;
const UUID_PATH_SEGMENT = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const SAFE_PATH_SEGMENT = /^(?:[A-Za-z0-9._~-]{1,64}|\[[A-Za-z][A-Za-z0-9]*\])$/;
const OPAQUE_PATH_SEGMENT = /^(?:[A-Za-z0-9_-]{17,}|(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9_-]{12,})$/;

export interface SentryEvent {
  type?: string;
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
    }>;
  };
  request?: {
    url?: string;
  };
  tags?: Record<string, bigint | boolean | null | number | string | symbol | undefined>;
}

function toPathname(url: unknown): string | undefined {
  if (typeof url !== 'string') {
    return undefined;
  }

  try {
    const parsedUrl = url.startsWith('/') ? new URL(url, 'https://draftops.invalid') : new URL(url);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return undefined;
    }

    const pathname = parsedUrl.pathname
      .split('/')
      .map((segment) => sanitizePathSegment(segment))
      .join('/');

    return pathname.slice(0, MAX_ROUTE_PATH_LENGTH);
  } catch {
    return undefined;
  }
}

function sanitizePathSegment(segment: string): string {
  if (!segment) {
    return segment;
  }

  try {
    const decodedSegment = decodeURIComponent(segment);

    if (
      !SAFE_PATH_SEGMENT.test(decodedSegment) ||
      EMAIL_ADDRESS.test(decodedSegment) ||
      DISCORD_SNOWFLAKE.test(decodedSegment) ||
      SENSITIVE_PATH_SEGMENT.test(decodedSegment) ||
      UUID_PATH_SEGMENT.test(decodedSegment) ||
      OPAQUE_PATH_SEGMENT.test(decodedSegment)
    ) {
      return '[redacted]';
    }

    return decodedSegment;
  } catch {
    return '[redacted]';
  }
}

function sanitizeIdentifier(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_IDENTIFIER_LENGTH ||
    !SAFE_IDENTIFIER.test(value) ||
    DISCORD_SNOWFLAKE.test(value)
  ) {
    return undefined;
  }

  return value;
}

function sanitizeAction(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_ACTION_LENGTH ||
    !SAFE_ACTION.test(value)
  ) {
    return undefined;
  }

  return value;
}

function sanitizeEnvironment(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_ENVIRONMENTS.has(value) ? value : undefined;
}

function sanitizeExceptionType(value: unknown): string | undefined {
  if (typeof value !== 'string' || DISCORD_SNOWFLAKE.test(value)) {
    return undefined;
  }

  return value.match(/^[A-Za-z][A-Za-z0-9_.:-]{0,99}/)?.[0];
}

function sanitizeSummary(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return value
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s@/]+@[^\s]+/gi, '[redacted-credential-url]')
    .replace(/\bauthorization\s*[=:]\s*bearer\s+[^\s,;]+/gi, 'authorization=[redacted]')
    .replace(/\bbearer\s+[^\s,;]+/gi, 'bearer [redacted]')
    .replace(/(password|token|secret|authorization|cookie)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, '[redacted-email]')
    .replace(/\bdiscord(?:[_\s-]?id)?\s*[=:]\s*[^\s,;]+/gi, 'discord=[redacted]')
    .replace(/\b\d{17,20}\b/g, '[redacted-user-id]')
    .replace(/(https?:\/\/[^\s?#]+)(?:\?[^\s#]*)?(?:#[^\s]*)?/gi, '$1')
    .slice(0, MAX_ERROR_SUMMARY_LENGTH);
}

function sanitizeException(event: SentryEvent): SentryEvent['exception'] | undefined {
  const firstValue = event.exception?.values?.[0];

  if (!firstValue) {
    return undefined;
  }

  const exceptionType = sanitizeExceptionType(firstValue.type);
  const value = sanitizeSummary(firstValue.value);
  return {
    values: [
      {
        ...(exceptionType ? { type: exceptionType } : {}),
        ...(value ? { value } : {}),
      },
    ],
  };
}

function sanitizeTags(tags: SentryEvent['tags']): SentryEvent['tags'] | undefined {
  if (!tags) {
    return undefined;
  }

  const approvedTags = Object.fromEntries(
    Object.entries(tags).flatMap(([key, value]) => {
      if (!APPROVED_TAGS.has(key)) {
        return [];
      }

      const sanitizedValue =
        key === 'route.path'
          ? toPathname(value)
          : key === 'action'
            ? sanitizeAction(value)
            : key === 'deployment.environment'
              ? sanitizeEnvironment(value)
              : key === 'user.correlation_id'
                ? typeof value === 'string' &&
                  HMAC_SHA256.test(value) &&
                  !DISCORD_SNOWFLAKE.test(value)
                  ? value
                  : undefined
                : sanitizeIdentifier(value);

      return sanitizedValue ? [[key, sanitizedValue]] : [];
    }),
  );

  return Object.keys(approvedTags).length > 0 ? approvedTags : undefined;
}

/**
 * Retains only the minimum error context needed to correlate an incident.
 * This module is safe to use in browser, Node, and Edge Sentry configurations.
 */
export function sanitizeSentryEvent(event: SentryEvent): SentryEvent | null {
  const pathname = toPathname(event.request?.url);
  const exception = sanitizeException(event);
  const tags = sanitizeTags(event.tags);
  const eventType = sanitizeExceptionType(event.type);

  return {
    ...(eventType ? { type: eventType } : {}),
    ...(pathname ? { request: { url: pathname } } : {}),
    ...(exception ? { exception } : {}),
    ...(tags ? { tags } : {}),
  };
}

export function sanitizeRoutePath(routePath: string): string {
  return toPathname(routePath) ?? '/';
}

export function sanitizeObservabilityIdentifier(value: unknown): string | undefined {
  return sanitizeIdentifier(value);
}

export function sanitizeObservabilityAction(value: unknown): string | undefined {
  return sanitizeAction(value);
}

export function sanitizeObservabilityEnvironment(value: unknown): string | undefined {
  return sanitizeEnvironment(value);
}

export function isUserCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && HMAC_SHA256.test(value);
}

export function sanitizeErrorSummary(error: unknown): string | undefined {
  if (error instanceof Error) {
    return sanitizeSummary(error.message);
  }

  return undefined;
}
