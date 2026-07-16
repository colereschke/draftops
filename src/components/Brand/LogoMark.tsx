interface LogoMarkProps {
  size?: number;
  className?: string;
}

export default function LogoMark({ size = 24, className }: LogoMarkProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true">
      {/* Head crosses the handle perpendicularly before rotation — that crossing
          is what reads as a mallet rather than a tapered diagonal bar. */}
      <g transform="rotate(-40 16 16)">
        <rect x="14.8" y="9" width="2.4" height="19" rx="1.2" fill="var(--primary)" />
        <rect x="9.5" y="5" width="13" height="7" rx="2" fill="var(--primary)" />
      </g>
      <rect x="5" y="24" width="11" height="4.5" rx="1.5" fill="var(--primary)" />
    </svg>
  );
}
