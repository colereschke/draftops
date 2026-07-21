import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { auth } from '@/auth';
import NavBar from '@/components/NavBar';
import NavBarGate from '@/components/NavBar/NavBarGate';
import SkipLink from '@/components/SkipLink';
import './globals.css';

const inter = localFont({
  src: './fonts/Inter-Variable.woff2',
  variable: '--font-inter',
  display: 'swap',
});

const barlowCondensed = localFont({
  src: [
    { path: './fonts/BarlowCondensed-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: './fonts/BarlowCondensed-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-barlow',
  display: 'swap',
});

const jetbrainsMono = localFont({
  src: './fonts/JetBrainsMono-Variable.woff2',
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'DraftOps | Dynasty Auction Tool',
  description: 'Fantasy football dynasty auction draft tracker with live budget management',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${barlowCondensed.variable} ${jetbrainsMono.variable}`}
    >
      <body style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
        <SkipLink />
        <NavBarGate>
          <NavBar session={session} />
        </NavBarGate>
        {children}
      </body>
    </html>
  );
}
