import Link from 'next/link';

export default function DraftNotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-5 text-center text-foreground"
    >
      <div className="font-label text-[10px] tracking-[2.5px] text-muted-foreground uppercase">
        404
      </div>
      <h1
        data-testid="not-found-title"
        className="font-label text-2xl font-bold tracking-tight text-foreground"
      >
        Draft not found
      </h1>
      <p className="max-w-[24rem] text-[12px] text-muted-foreground">
        This draft doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link
        href="/drafts"
        data-testid="not-found-back-link"
        className="font-label mt-1 rounded-md border border-border-subtle bg-card px-3 py-1.5 text-[11px] font-semibold tracking-wide text-foreground uppercase hover:bg-accent"
      >
        Back to Drafts
      </Link>
    </main>
  );
}
