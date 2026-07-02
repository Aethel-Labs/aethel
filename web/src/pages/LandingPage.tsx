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
      'Set reminders for important messages using /remind or in Right Click → Apps → Remind Me',
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
    description: 'Look up domains with /whois, check what time it is in any city with /time.',
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
    <div className="min-h-screen bg-bg text-ink">
      <a
        href="#main-content"
        className="sr-only focus:absolute focus:not-sr-only focus:top-3 focus:left-3 focus:bg-surface focus:text-ink focus:px-4 focus:py-2 focus:rounded-md focus:shadow-md focus:z-50"
      >
        Skip to content
      </a>

      <header className="absolute top-4 right-4 z-10">
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a
            href="https://github.com/Aethel-Labs/aethel"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-line-strong bg-surface p-2.5 text-muted transition-colors hover:bg-surface-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="View on GitHub"
          >
            <svg
              className="h-5 w-5"
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
        className="relative mx-auto max-w-5xl px-6 pt-24 pb-20 sm:px-8"
      >
        <section className="text-center">
          <img
            src="/bot_icon.png"
            alt="Aethel Bot Logo"
            className="mx-auto mb-8 h-28 w-28 rounded-2xl object-contain border border-line shadow-md md:h-36 md:w-36"
            width={256}
            height={256}
            loading="eager"
            decoding="async"
          />
          <h1 className="mb-4 text-4xl font-extrabold tracking-tight text-ink md:text-6xl">
            Aethel
          </h1>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted md:text-xl">
            An amazing, feature-rich open-source Discord bot with useful and fun commands to have a
            good time with friends.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3 md:gap-4">
            <a
              href="https://discord.com/oauth2/authorize?client_id=1371031984230371369"
              className="btn btn-primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              Add to Discord
            </a>
            <Link
              to="/status"
              className="btn btn-secondary"
            >
              View Status
            </Link>
            <Link
              to="/login"
              className="btn btn-ghost"
            >
              Dashboard
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs md:text-sm">
            <span className="badge">Open Source</span>
            <span className="badge">Privacy Friendly</span>
            <span className="badge">AI features</span>
          </div>
        </section>

        <section className="mt-20 md:mt-24">
          <h2 className="mb-10 text-center text-2xl font-bold text-ink md:text-3xl">
            What you can do with Aethel
          </h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description, color }) => (
              <div
                key={title}
                className="feature-card"
              >
                <Icon className={`mb-3 h-7 w-7 ${color}`} />
                <h3 className="mb-2 text-lg font-semibold text-ink">{title}</h3>
                <p className="text-sm leading-relaxed text-muted">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-16 text-center">
          <p className="text-sm text-faint">
            Use Aethel in DMs or servers that allow external applications.
          </p>
        </div>
      </main>

      <footer className="border-t border-line bg-surface py-10 text-center">
        <div className="mb-6 flex flex-wrap justify-center gap-6">
          <Link
            to="/legal/privacy"
            className="text-sm text-muted transition-colors hover:text-accent"
          >
            Privacy Policy
          </Link>
          <Link
            to="/legal/terms"
            className="text-sm text-muted transition-colors hover:text-accent"
          >
            Terms of Service
          </Link>
        </div>
        <p className="text-sm text-muted">
          Made with ♥ by scanash and the Aethel Labs contributors
        </p>
      </footer>
    </div>
  );
}
