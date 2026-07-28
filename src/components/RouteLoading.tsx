interface RouteLoadingProps {
  label: string;
}

export default function RouteLoading({ label }: RouteLoadingProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-foreground"
    >
      <div
        aria-hidden
        className="size-6 animate-spin rounded-full border-2"
        style={{ borderColor: 'var(--border-subtle)', borderTopColor: 'var(--primary)' }}
      />
      <div className="text-[12px] text-muted-foreground">{label}</div>
    </main>
  );
}
