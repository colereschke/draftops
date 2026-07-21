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
    return new URL(url, 'https://draftops.invalid').pathname;
  } catch {
    return undefined;
  }
}

function sanitizeSummary(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return value
    .replace(/(password|token|secret|authorization|cookie)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, '[redacted-email]')
    .replace(/\bdiscord(?:[_\s-]?id)?\s*[=:]\s*[^\s,;]+/gi, 'discord=[redacted]')
    .replace(/(https?:\/\/[^\s?#]+)\?[^\s]*/gi, '$1')
    .slice(0, MAX_ERROR_SUMMARY_LENGTH);
}

function sanitizeException(event: SentryEvent): SentryEvent['exception'] | undefined {
  const firstValue = event.exception?.values?.[0];

  if (!firstValue) {
    return undefined;
  }

  const value = sanitizeSummary(firstValue.value);
  return {
    values: [
      {
        type: firstValue.type?.slice(0, 100),
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
    Object.entries(tags).filter(
      ([key, value]) => APPROVED_TAGS.has(key) && typeof value === 'string' && value.length <= 200,
    ),
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

  return {
    ...(event.type ? { type: event.type } : {}),
    ...(pathname ? { request: { url: pathname } } : {}),
    ...(exception ? { exception } : {}),
    ...(tags ? { tags } : {}),
  };
}

export function sanitizeRoutePath(routePath: string): string {
  return toPathname(routePath) ?? '/';
}

export function sanitizeErrorSummary(error: unknown): string | undefined {
  if (error instanceof Error) {
    return sanitizeSummary(error.message);
  }

  return undefined;
}
