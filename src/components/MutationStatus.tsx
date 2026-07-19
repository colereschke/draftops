interface MutationStatusProps {
  message: string;
}

export default function MutationStatus({ message }: MutationStatusProps) {
  return (
    <div aria-live="polite" role="status" className="sr-only" data-testid="mutation-status">
      {message}
    </div>
  );
}
