import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface LegalLayoutProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

export function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen p-8">
      <main className="max-w-4xl mx-auto">
        <div className="text-center mb-16 pt-8">
          <img
            src="/bot_icon.png"
            alt="Aethel Bot Logo"
            width={160}
            height={160}
            className="mx-auto mb-8 pixel-art rounded-2xl w-40 h-40 object-cover"
            style={{ imageRendering: 'auto' }}
          />
          <h1 className="text-4xl md:text-6xl font-bold mb-4 text-gray-800">{title}</h1>
          <div className="w-24 h-1 bg-pink-500 mx-auto my-4 rounded-full"></div>
          <p className="text-lg text-gray-600 mb-8">Last Updated: {lastUpdated}</p>

          <Link
            to="/"
            className="inline-flex items-center px-6 py-3 bg-white/90 hover:bg-white text-gray-800 font-medium rounded-full shadow-md hover:shadow-lg transition-all mb-8"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        <div className="bg-white/80 backdrop-blur-sm rounded-lg shadow-lg p-8 sm:p-10 lg:p-12">
          <div className="prose max-w-none">{children}</div>
        </div>
      </main>
    </div>
  );
}

export default LegalLayout;
