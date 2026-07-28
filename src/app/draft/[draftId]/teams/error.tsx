'use client';

import RouteErrorBoundary, { type RouteErrorProps } from '@/components/RouteErrorBoundary';

export default function TeamsError({ error, reset }: RouteErrorProps) {
  return <RouteErrorBoundary error={error} reset={reset} title="Failed to load team rosters" />;
}
