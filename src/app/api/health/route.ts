import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { logServerError } from '@/lib/observability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEALTH_CHECK_TIMEOUT_MS = 2_000;

export async function GET(): Promise<NextResponse> {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, HEALTH_CHECK_TIMEOUT_MS);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logServerError({
      incidentId: randomUUID(),
      action: 'health_check',
      routePath: '/api/health',
      error,
    });
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Health check timed out')), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}
