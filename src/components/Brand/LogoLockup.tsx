import { cn } from '@/lib/utils';
import LogoMark from './LogoMark';

interface LogoLockupProps {
  size?: number;
  textClassName?: string;
  className?: string;
}

export default function LogoLockup({
  size = 20,
  textClassName = 'text-label-lg',
  className,
}: LogoLockupProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark size={size} />
      <span
        className={cn(
          'font-label text-foreground font-bold tracking-wide uppercase',
          textClassName,
        )}
      >
        DraftOps
      </span>
    </span>
  );
}
