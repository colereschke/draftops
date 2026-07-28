'use client';

import { useEffect, useRef, useState } from 'react';
import { captureClientError } from '@/lib/clientObservability';
import { deriveIncidentDetails } from '@/lib/incident';

export interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

interface RouteErrorBoundaryProps extends RouteErrorProps {
  title: string;
}

interface IncidentState {
  error: Error;
  incidentId: string;
  hasDigest: boolean;
}

export default function RouteErrorBoundary({ error, reset, title }: RouteErrorBoundaryProps) {
  const capturedErrorRef = useRef<Error | null>(null);
  const [storedIncident, setStoredIncident] = useState<IncidentState>(() => ({
    error,
    ...deriveIncidentDetails(error),
  }));

  let incident = storedIncident;
  if (storedIncident.error !== error) {
    incident = { error, ...deriveIncidentDetails(error) };
    setStoredIncident(incident);
  }

  const { hasDigest, incidentId } = incident;

  useEffect(() => {
    if (hasDigest || capturedErrorRef.current === error) {
      return;
    }
    capturedErrorRef.current = error;
    try {
      captureClientError(error, incidentId);
    } catch {
      // Reporting must never prevent the recovery UI from rendering.
    }
  }, [error, hasDigest, incidentId]);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        minHeight: '100vh',
        background: 'var(--bg-base)',
        color: 'var(--text-primary)',
        fontFamily: '"Inter", "Helvetica Neue", sans-serif',
      }}
    >
      <div
        data-testid="route-error-title"
        style={{ fontSize: 14, color: 'var(--destructive)', fontWeight: 600 }}
      >
        {title}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 320, textAlign: 'center' }}>
        We logged the problem. Try again, and share the incident ID if it continues.
      </div>
      <div data-testid="error-incident-id" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Incident ID: {incidentId}
      </div>
      <button
        onClick={reset}
        style={{
          marginTop: 8,
          padding: '7px 18px',
          borderRadius: 6,
          border: '1px solid var(--border-subtle)',
          background: 'transparent',
          color: 'var(--text-muted)',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        Try Again
      </button>
    </main>
  );
}
