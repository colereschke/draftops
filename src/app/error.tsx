'use client';

import { useEffect, useRef, useState } from 'react';
import { captureClientError } from '@/lib/clientObservability';
import { deriveIncidentDetails } from '@/lib/incident';

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

interface IncidentState {
  error: Error;
  incidentId: string;
  hasDigest: boolean;
}

export default function Error({ error, reset }: ErrorBoundaryProps) {
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
        background: '#0a0d14',
        color: '#e8eaf0',
        fontFamily: '"Inter", "Helvetica Neue", sans-serif',
      }}
    >
      <div style={{ fontSize: 14, color: 'var(--destructive)', fontWeight: 600 }}>
        Failed to load auction data
      </div>
      <div style={{ fontSize: 12, color: '#4a5168', maxWidth: 320, textAlign: 'center' }}>
        We logged the problem. Try again, and share the incident ID if it continues.
      </div>
      <div data-testid="error-incident-id" style={{ fontSize: 12, color: '#4a5168' }}>
        Incident ID: {incidentId}
      </div>
      <button
        onClick={reset}
        style={{
          marginTop: 8,
          padding: '7px 18px',
          borderRadius: 6,
          border: '1px solid #2a3048',
          background: 'transparent',
          color: '#8892a4',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        Try Again
      </button>
    </main>
  );
}
