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
    <nav style={{ display: 'flex', gap: 20 }}>
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className="nav-link"
            style={{
              padding: '0 4px',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              fontFamily: 'var(--font-barlow), sans-serif',
              textDecoration: 'none',
              color: active ? '#e8eaf0' : '#4a5168',
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
