import { NextRequest, NextResponse } from 'next/server';

interface LogErrorPayload {
  message?: string;
  digest?: string;
  stack?: string;
  url?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as LogErrorPayload;

  console.error('[client-error]', {
    message: body.message ?? 'Unknown error',
    digest: body.digest,
    url: body.url,
    stack: body.stack,
  });

  return NextResponse.json({ ok: true });
}
