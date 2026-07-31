import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'iRexPro Admin — Back Office',
  description: 'iRexPro platform admin/back-office portal.',
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
