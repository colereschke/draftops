'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Value Sheet' },
  { href: '/teams', label: 'Team Rosters' },
  { href: '/budget', label: 'Budget Pressure' },
  { href: '/nominate', label: 'Nominate' },
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav style={{ display: 'flex', gap: 4 }}>
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            style={{
              padding: '3px 10px',
              borderRadius: 5,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.5,
              fontFamily: 'var(--font-barlow), sans-serif',
              textDecoration: 'none',
              color: active ? '#e8a030' : '#4a5168',
              background: active ? '#2a1f0e' : 'transparent',
              border: `1px solid ${active ? '#e8a030' : '#2a3048'}`,
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
