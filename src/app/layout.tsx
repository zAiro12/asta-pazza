import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Asta Pazza',
  description: 'Gioco di aste al buio in tempo reale',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="bg-dark-bg text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
