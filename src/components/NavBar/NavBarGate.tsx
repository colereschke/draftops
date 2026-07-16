'use client';

import { usePathname } from 'next/navigation';

interface NavBarGateProps {
  children: React.ReactNode;
}

export default function NavBarGate({ children }: NavBarGateProps) {
  const pathname = usePathname();
  if (pathname === '/sign-in') return null;
  return children;
}
