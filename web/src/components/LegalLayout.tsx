import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface LegalLayoutProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

export function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-black transition-colors duration-300 p-8">
      <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full blur-xl md:blur-3xl opacity-30 bg-gradient-to-tr from-pink-400 to-purple-500 dark:opacity-20" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-[28rem] w-[28rem] rounded-full blur-xl md:blur-3xl opacity-30 bg-gradient-to-tr from-indigo-400 to-sky-500 dark:opacity-20" />

      <main className="max-w-4xl mx-auto relative">
        <div className="text-center mb-16 pt-8">
          <img
            src="/bot_icon.png"
            alt="Aethel Bot Logo"
            width={160}
            height={160}
            className="mx-auto mb-8 w-40 h-40 rounded-2xl object-contain shadow-xl ring-1 ring-black/5 dark:ring-white/10"
            style={{ imageRendering: 'auto' }}
          />
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4 text-gray-900 dark:text-gray-100">
            {title}
          </h1>
          <div className="w-24 h-1 bg-pink-500 mx-auto my-4 rounded-full"></div>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
            Last Updated: {lastUpdated}
          </p>

          <Link
            to="/"
            className="inline-flex items-center px-6 py-3 bg-white/90 hover:bg-white dark:bg-gray-800/90 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-100 font-medium rounded-full shadow-md hover:shadow-lg transition-all mb-8 backdrop-blur-sm"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Home
          </Link>
        </div>

        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg shadow-lg p-8 sm:p-10 lg:p-12">
          <div className="prose dark:prose-invert max-w-none">{children}</div>
        </div>
      </main>
    </div>
  );
}

export default LegalLayout;
