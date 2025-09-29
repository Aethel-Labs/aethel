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
  },
  {
    icon: BookOpenIcon,
    title: 'Wikipedia',
    description: 'Use /wiki to pull answers right from Wikipedia.',
  },
  { icon: CloudIcon, title: 'Weather', description: 'Forecasts for any city via /weather.' },
  {
    icon: FaceSmileIcon,
    title: 'Fun',
    description: 'Lighten the mood with /joke, or ask the mystical /8ball.',
  },
  {
    icon: BellAlertIcon,
    title: 'Reminders',
    description:
      'Set reminders for important messages using /remind or in Right Click -> Apps -> Remind Me',
  },
  {
    icon: PhotoIcon,
    title: 'Media Goodies',
    description: 'Cute pet pics with /dog and /cat, and media downloads via /cobalt.',
  },
  {
    icon: AcademicCapIcon,
    title: 'Games',
    description: 'Start a multiplayer trivia session with /trivia.',
  },
  {
    icon: CheckCircleIcon,
    title: 'Productivity',
    description: 'Manage tasks with /todo and keep yourself busy.',
  },
  {
    icon: UserIcon,
    title: 'Utilities',
    description: 'Look up domains with /whois, check what time it is on any city with /time.',
  },
  {
    icon: QuestionMarkCircleIcon,
    title: 'Discover',
    description: 'Use /help to see everything Aethel can do.',
  },
  {
    icon: SwatchIcon,
    title: 'Constantly evolving',
    description: 'We release new updates almost every day.',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-black transition-colors duration-300">
      <a
        href="#main-content"
        className="sr-only focus:absolute focus:not-sr-only focus:top-3 focus:left-3 focus:bg-white dark:focus:bg-gray-900 focus:text-gray-900 dark:focus:text-gray-100 focus:px-4 focus:py-2 focus:rounded-md focus:shadow"
      >
        Skip to content
      </a>

      <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full blur-xl md:blur-3xl opacity-30 bg-gradient-to-tr from-pink-400 to-purple-500 dark:opacity-20" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-[28rem] w-[28rem] rounded-full blur-xl md:blur-3xl opacity-30 bg-gradient-to-tr from-indigo-400 to-sky-500 dark:opacity-20" />

      <header className="absolute top-4 right-4 z-10">
        <div className="flex items-center space-x-3">
          <ThemeToggle />
          <a
            href="https://github.com/Aethel-Labs/aethel"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur hover:bg-white dark:hover:bg-gray-700 text-black dark:text-white rounded-full transition-all transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 dark:focus:ring-gray-600 shadow-lg hover:shadow-xl"
            aria-label="View on GitHub"
          >
            <svg
              className="w-6 h-6"
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
            className="mx-auto mb-8 w-28 h-28 md:w-36 md:h-36 rounded-2xl object-contain shadow-xl ring-1 ring-black/5 dark:ring-white/10"
            style={{ imageRendering: 'auto' }}
            width={256}
            height={256}
            loading="eager"
            decoding="async"
          />
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4 text-gray-900 dark:text-gray-100">
            Aethel
          </h1>
          <p className="max-w-2xl mx-auto text-lg md:text-xl text-gray-600 dark:text-gray-300 leading-relaxed">
            An amazing, feature-rich open-source Discord bot with useful and fun commands to have a
            good time with friends.{' '}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 md:gap-4">
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

        <section className="mt-16 md:mt-20">
          <h2 className="text-center text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100 mb-8">
            What you can do with Aethel
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="feature-card group"
              >
                <Icon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-100">
                  {title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-16 text-center">
          <p className="text-gray-600 dark:text-gray-300 mb-2">
            Use Aethel in DMs or servers that allow external applications.
          </p>
        </div>
      </main>

      <footer className="relative border-t border-gray-200/70 dark:border-white/10 bg-white/60 dark:bg-gray-900/40 backdrop-blur py-10 text-center text-gray-600 dark:text-gray-300">
        <div className="flex flex-wrap justify-center gap-6 mb-6">
          <Link
            to="/legal/privacy"
            className="hover:text-pink-500 transition-colors text-sm"
          >
            Privacy Policy
          </Link>
          <Link
            to="/legal/terms"
            className="hover:text-pink-500 transition-colors text-sm"
          >
            Terms of Service
          </Link>
        </div>
        <div className="mb-4">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Powered by</p>
          <a
            href="https://royalehosting.net/?aff=8033?utm_source=aethel.xyz&utm_medium=referral&utm_campaign=powered_by&utm_content=footer"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block hover:opacity-80 transition-opacity"
          >
            <img
              src="/royale_logo.svg"
              alt="Royale Hosting"
              className="h-8 mx-auto dark:hidden object-contain"
              width={160}
              height={32}
              loading="lazy"
              decoding="async"
            />
            <img
              src="/royale_logo_dark.svg"
              alt="Royale Hosting"
              className="h-8 mx-auto hidden dark:block object-contain"
              width={160}
              height={32}
              loading="lazy"
              decoding="async"
            />
          </a>
        </div>
        <p className="hover:text-pink-500 transition-colors">
          Made with ♥ by scanash and the Aethel Labs contributors
        </p>
      </footer>
    </div>
  );
}
