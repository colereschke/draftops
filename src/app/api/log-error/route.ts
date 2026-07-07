import { NextRequest, NextResponse } from 'next/server';

interface LogErrorPayload {
  message?: string;
  digest?: string;
  stack?: string;
  url?: string;
}

const MAX_BODY_BYTES = 4096;
const FIELD_LIMITS = {
  message: 240,
  digest: 128,
  stack: 2000,
  url: 2048,
} as const;

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const body = (await request.json().catch(() => ({}))) as LogErrorPayload;
  if (!isValidPayload(body)) {
    return NextResponse.json({ error: 'Invalid error payload' }, { status: 400 });
  }

  console.error('[client-error]', {
    message: body.message ?? 'Unknown error',
    digest: body.digest,
    url: body.url,
    stack: body.stack,
  });

  return NextResponse.json({ ok: true });
}

function isValidPayload(payload: LogErrorPayload): boolean {
  return (
    isOptionalBoundedString(payload.message, FIELD_LIMITS.message) &&
    isOptionalBoundedString(payload.digest, FIELD_LIMITS.digest) &&
    isOptionalBoundedString(payload.stack, FIELD_LIMITS.stack) &&
    isOptionalBoundedString(payload.url, FIELD_LIMITS.url)
  );
}

function isOptionalBoundedString(value: unknown, maxLength: number): boolean {
  return value === undefined || (typeof value === 'string' && value.length <= maxLength);
}
