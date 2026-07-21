'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/reportClientError';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <html lang="en">
      <body
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
          Something went wrong
        </div>
        <div style={{ fontSize: 12, color: '#4a5168', maxWidth: 320, textAlign: 'center' }}>
          {error.message}
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
      </body>
    </html>
  );
}
