import type { Metadata } from 'next';
import { Barlow_Condensed, Inter, JetBrains_Mono } from 'next/font/google';
import NavBar from '@/components/NavBar';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-barlow',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'DraftOps | Dynasty Auction Tool',
  description: '12-team Superflex dynasty auction tracker with live budget management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${barlowCondensed.variable} ${jetbrainsMono.variable}`}
    >
      <body style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
