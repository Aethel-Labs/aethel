import {
  ChatBubbleLeftRightIcon,
  BookOpenIcon,
  CloudIcon,
  FaceSmileIcon,
  BellAlertIcon,
  PhotoIcon,
  SparklesIcon,
  SwatchIcon,
  CheckCircleIcon,
  UserIcon,
  ClockIcon,
  QuestionMarkCircleIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';

import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';

export default function Home() {
  return (
    <div className="min-h-screen p-8 relative transition-colors duration-300">
      <div className="absolute top-4 right-4 flex items-center space-x-3 z-10">
        <ThemeToggle />
        <a
          href="https://github.com/Aethel-Labs/aethel"
          target="_blank"
          rel="noopener noreferrer"
          className="p-3 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-black dark:text-white rounded-full transition-all transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 dark:focus:ring-gray-600 shadow-lg hover:shadow-xl"
          aria-label="View on GitHub"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              clipRule="evenodd"
            />
          </svg>
        </a>
      </div>
      <main className="max-w-4xl mx-auto">
        <div className="text-center mb-16 pt-8">
          <img
            src="/bot_icon.png"
            alt="Aethel Bot Logo"
            className="mx-auto mb-8 rounded-2xl w-40 h-40 object-contain"
            style={{ imageRendering: 'auto' }}
          />
          <h1 className="text-4xl md:text-6xl font-bold mb-4 text-gray-800 dark:text-gray-100">
            Aethel
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
            A useful and multipurpose bot for Discord
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="https://discord.com/oauth2/authorize?client_id=1371031984230371369"
              className="bg-[#5865F2] hover:bg-[#4752c4] text-white font-bold py-3 px-8 rounded-full inline-flex items-center space-x-2 transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#5865F2] shadow-lg hover:shadow-xl"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>Add to Discord</span>
            </a>
            <Link
              to="/status"
              className="bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100 font-bold py-3 px-8 rounded-full inline-flex items-center space-x-2 transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 dark:focus:ring-gray-600 shadow-lg hover:shadow-xl"
            >
              <span>View Status</span>
            </Link>
            <Link
              to="/login"
              className="bg-pink-500 hover:bg-pink-600 text-white font-bold py-3 px-8 rounded-full inline-flex items-center space-x-2 transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 shadow-lg hover:shadow-xl"
            >
              <span>Dashboard</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="command-card group">
            <ChatBubbleLeftRightIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-100">/ai</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Chat with AI, ask questions, get answers!
            </p>
          </div>

          <div className="command-card group">
            <BookOpenIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-100">/wiki</h3>
            <p className="text-gray-600 dark:text-gray-300">Get answers directly from Wikipedia</p>
          </div>

          <div className="command-card group">
            <CloudIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-100">
              /weather
            </h3>
            <p className="text-gray-600 dark:text-gray-300">
              Get the weather forecast for any city
            </p>
          </div>

          <div className="command-card group">
            <FaceSmileIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-100">/joke</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Get a random joke and bright up your day
            </p>
          </div>

          <div className="command-card group">
            <BellAlertIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-100">/remind</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Set a reminder for a message or something important, supports message interactions
            </p>
          </div>

          <div className="command-card group">
            <PhotoIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-100">
              /dog & /cat
            </h3>
            <p className="text-gray-600 dark:text-gray-300">Get random cute pet images</p>
          </div>

          <div className="command-card group">
            <SparklesIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-100">/8ball</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Ask the magic 8ball a question and get a mysterious answer
            </p>
          </div>

          <div className="command-card group">
            <AcademicCapIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-100">/trivia</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Start a multiplayer trivia game with friends
            </p>
          </div>

          <div className="command-card group">
            <SwatchIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-100">/cobalt</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Download videos and media from various platforms using Cobalt
            </p>
          </div>

          <div className="command-card group">
            <CheckCircleIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-100">/todo</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Create and manage your todo list and tasks
            </p>
          </div>

          <div className="command-card group">
            <UserIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-100">/whois</h3>
            <p className="text-gray-600 dark:text-gray-300">Get domain and IP information</p>
          </div>

          <div className="command-card group">
            <ClockIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-100">/time</h3>
            <p className="text-gray-600 dark:text-gray-300">Get the current time for any cities</p>
          </div>

          <div className="command-card group">
            <QuestionMarkCircleIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-100">/help</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Show all available commands and their usage
            </p>
          </div>
        </div>

        <div className="mt-16 text-center">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            You might use this bot in DMs and servers that allow external applications!
          </p>
        </div>
      </main>

      <footer className="mt-16 text-center text-gray-500 dark:text-gray-400 pb-8">
        <div className="flex flex-wrap justify-center gap-6 mb-6">
          <Link to="/legal/privacy" className="hover:text-pink-500 transition-colors text-sm">
            Privacy Policy
          </Link>
          <Link to="/legal/terms" className="hover:text-pink-500 transition-colors text-sm">
            Terms of Service
          </Link>
        </div>

        <div className="mb-4">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Powered by</p>
          <a
            href="https://royalehosting.net?utm_source=aethel.xyz&utm_medium=referral&utm_campaign=powered_by&utm_content=footer"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block hover:opacity-80 transition-opacity"
          >
            <img src="/royale_logo.svg" alt="Royale Hosting" className="h-6 mx-auto dark:hidden" />
            <img
              src="/royale_logo_dark.svg"
              alt="Royale Hosting"
              className="h-6 mx-auto hidden dark:block"
            />
          </a>
        </div>

        <p className="hover:text-pink-500 transition-colors text-gray-600 dark:text-gray-300">
          Made with ♥ by scanash and the Aethel Labs community
        </p>
      </footer>
    </div>
  );
}
