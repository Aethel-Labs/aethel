import {
  ChatBubbleLeftRightIcon,
  BookOpenIcon,
  CloudIcon,
  FaceSmileIcon,
  BellAlertIcon,
  PhotoIcon,
  SwatchIcon,
  CheckCircleIcon,
  UserIcon,
  QuestionMarkCircleIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';

import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';

const features = [
  {
    icon: ChatBubbleLeftRightIcon,
    title: 'AI Chat',
    description: 'Instant answers with /ai — ask and get quick, helpful responses.',
    color: 'text-indigo-500',
  },
  {
    icon: BookOpenIcon,
    title: 'Wikipedia',
    description: 'Use /wiki to pull answers right from Wikipedia.',
    color: 'text-emerald-500',
  },
  {
    icon: CloudIcon,
    title: 'Weather',
    description: 'Forecasts for any city via /weather.',
    color: 'text-cyan-500',
  },
  {
    icon: FaceSmileIcon,
    title: 'Fun',
    description: 'Lighten the mood with /joke, or ask the mystical /8ball.',
    color: 'text-amber-500',
  },
  {
    icon: BellAlertIcon,
    title: 'Reminders',
    description:
      'Set reminders for important messages using /remind or in Right Click -> Apps -> Remind Me',
    color: 'text-orange-500',
  },
  {
    icon: PhotoIcon,
    title: 'Media Goodies',
    description: 'Cute pet pics with /dog and /cat, and media downloads via /cobalt.',
    color: 'text-rose-500',
  },
  {
    icon: AcademicCapIcon,
    title: 'Games',
    description: 'Start a multiplayer trivia session with /trivia.',
    color: 'text-purple-500',
  },
  {
    icon: CheckCircleIcon,
    title: 'Productivity',
    description: 'Manage tasks with /todo and keep yourself busy.',
    color: 'text-green-500',
  },
  {
    icon: UserIcon,
    title: 'Utilities',
    description: 'Look up domains with /whois, check what time it is on any city with /time.',
    color: 'text-blue-500',
  },
  {
    icon: QuestionMarkCircleIcon,
    title: 'Discover',
    description: 'Use /help to see everything Aethel can do.',
    color: 'text-teal-500',
  },
  {
    icon: SwatchIcon,
    title: 'Constantly evolving',
    description: 'We release new updates almost every day.',
    color: 'text-violet-500',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:absolute focus:not-sr-only focus:top-3 focus:left-3 focus:bg-white dark:focus:bg-slate-900 focus:text-slate-900 dark:focus:text-slate-100 focus:px-4 focus:py-2 focus:rounded-md focus:shadow"
      >
        Skip to content
      </a>

      <header className="absolute top-4 right-4 z-10">
        <div className="flex items-center space-x-3">
          <ThemeToggle />
          <a
            href="https://github.com/Aethel-Labs/aethel"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-300 dark:focus:ring-indigo-600 shadow-md hover:shadow-lg border border-slate-200/50 dark:border-slate-700/50"
            aria-label="View on GitHub"
          >
            <svg
              className="w-5 h-5"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                clipRule="evenodd"
              />
            </svg>
          </a>
        </div>
      </header>

      <main
        id="main-content"
        className="relative max-w-6xl mx-auto px-6 sm:px-8 pt-24 pb-20"
      >
        <section className="text-center">
          <img
            src="/bot_icon.png"
            alt="Aethel Bot Logo"
            className="mx-auto mb-8 w-28 h-28 md:w-36 md:h-36 rounded-2xl object-contain shadow-lg border border-slate-200 dark:border-slate-700"
            style={{ imageRendering: 'auto' }}
            width={256}
            height={256}
            loading="eager"
            decoding="async"
          />
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4 text-slate-900 dark:text-white">
            Aethel
          </h1>
          <p className="max-w-2xl mx-auto text-lg md:text-xl text-slate-600 dark:text-slate-300 leading-relaxed">
            An amazing, feature-rich open-source Discord bot with useful and fun commands to have a
            good time with friends.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3 md:gap-4">
            <a
              href={`https://discord.com/oauth2/authorize?client_id=1371031984230371369`}
              className="btn btn-discord"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>Add to Discord</span>
            </a>
            <Link
              to="/status"
              className="btn btn-glass"
            >
              <span>View Status</span>
            </Link>
            <Link
              to="/login"
              className="btn btn-accent"
            >
              <span>Dashboard</span>
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs md:text-sm">
            <span className="badge">Open Source</span>
            <span className="badge">Privacy Friendly</span>
            <span className="badge">AI features</span>
          </div>
        </section>

        <section className="mt-20 md:mt-24">
          <h2 className="text-center text-2xl md:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-10">
            What you can do with{' '}
            <span className="text-indigo-600 dark:text-indigo-400">Aethel</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map(({ icon: Icon, title, description, color }) => (
              <div
                key={title}
                className="feature-card group"
              >
                <Icon
                  className={`w-8 h-8 ${color} mb-3 group-hover:scale-110 transition-transform`}
                />
                <h3 className="text-lg font-semibold mb-2 text-slate-800 dark:text-slate-100">
                  {title}
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-16 text-center">
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Use Aethel in DMs or servers that allow external applications.
          </p>
        </div>
      </main>

      <footer className="relative border-t border-slate-200/50 dark:border-slate-700/30 bg-white/40 dark:bg-slate-900/20 backdrop-blur-sm py-10 text-center">
        <div className="flex flex-wrap justify-center gap-6 mb-6">
          <Link
            to="/legal/privacy"
            className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-sm"
          >
            Privacy Policy
          </Link>
          <Link
            to="/legal/terms"
            className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-sm"
          >
            Terms of Service
          </Link>
        </div>
        <div className="mb-4">
          <a
            href="https://scanash.com/oss-hosting"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block hover:opacity-80 transition-opacity text-sm text-slate-500 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            Hosted by Scan's OSS Hosting
          </a>
        </div>
        <p className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-sm">
          Made with ♥ by scanash and the Aethel Labs contributors
        </p>
      </footer>
    </div>
  );
}
