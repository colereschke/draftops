export function reportClientError(error: Error & { digest?: string }) {
  fetch('/api/log-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: error.message,
      digest: error.digest,
      stack: error.stack,
      url: window.location.href,
    }),
  }).catch(() => {});
}
