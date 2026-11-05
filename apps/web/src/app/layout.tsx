import type { Metadata, Viewport } from 'next';
import { BRAND } from '@groundwork/shared';
import { SITE_URL } from '@/lib/env';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${BRAND.name} — ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: 'A focused network where founders find co-founders and startup builders, and validate ideas with Think, a structured AI workspace.',
  openGraph: { siteName: BRAND.name, type: 'website' },
};

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#ffffff' }, { media: '(prefers-color-scheme: dark)', color: '#0b0b0b' }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
