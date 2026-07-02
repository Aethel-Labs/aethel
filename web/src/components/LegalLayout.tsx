import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

interface LegalLayoutProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

export function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16 sm:px-8">
        <Link
          to="/"
          className="mb-10 inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <div className="mb-12 border-b border-line pb-8">
          <h1 className="text-3xl font-bold tracking-tight text-ink md:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-faint">Last updated: {lastUpdated}</p>
        </div>

        <div className="space-y-10 text-[15px] leading-relaxed text-muted">{children}</div>
      </main>
    </div>
  );
}

export default LegalLayout;
