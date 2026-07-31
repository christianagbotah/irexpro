import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'iRexPro — AI Forex Trading Platform',
  description: 'iRexPro client/trader web app.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
