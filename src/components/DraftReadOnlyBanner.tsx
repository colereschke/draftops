export default function DraftReadOnlyBanner() {
  return (
    <div
      data-testid="draft-read-only-banner"
      role="status"
      className="border-b border-[var(--pos-wr)]/40 bg-[var(--pos-wr)]/10 px-5 py-2.5 text-xs text-foreground"
    >
      <span className="font-label mr-2 font-bold tracking-wide uppercase">Draft complete</span>
      This workspace is read-only. Historical results, filters, and navigation remain available.
    </div>
  );
}
