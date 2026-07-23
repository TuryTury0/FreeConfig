import type { Metadata } from 'next';
import './globals.css';
import { Navigation } from '../components/navigation';

export const metadata: Metadata = {
  title: 'Anythings by TUry',
  description: 'Config discovery and testing platform',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Navigation />
        {children}
      </body>
    </html>
  );
}