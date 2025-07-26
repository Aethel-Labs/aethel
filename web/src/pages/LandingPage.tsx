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
} from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';

export default function Home() {
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
          />
          <h1 className="text-4xl md:text-6xl font-bold mb-4 text-gray-800">Aethel</h1>
          <p className="text-xl text-gray-600 mb-8">A useful and multipurpose bot for Discord</p>
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
              className="bg-white/90 hover:bg-white text-gray-800 font-bold py-3 px-8 rounded-full inline-flex items-center space-x-2 transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 shadow-lg hover:shadow-xl"
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
            <h3 className="text-xl font-semibold mb-2">/ai</h3>
            <p className="text-gray-600">Chat with AI, ask questions, get answers!</p>
          </div>

          <div className="command-card group">
            <BookOpenIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2">/wiki</h3>
            <p className="text-gray-600">Get answers directly from Wikipedia</p>
          </div>

          <div className="command-card group">
            <CloudIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2">/weather</h3>
            <p className="text-gray-600">Get local weather or another user&apos;s weather</p>
          </div>

          <div className="command-card group">
            <FaceSmileIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2">/joke</h3>
            <p className="text-gray-600">Get a random joke and bright up your day</p>
          </div>

          <div className="command-card group">
            <BellAlertIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2">/remind</h3>
            <p className="text-gray-600">
              Set a reminder for a message or something important, supports message interactions
            </p>
          </div>

          <div className="command-card group">
            <PhotoIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2">/dog & /cat</h3>
            <p className="text-gray-600">Get random cute pet images</p>
          </div>

          <div className="command-card group">
            <SparklesIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2">/8ball</h3>
            <p className="text-gray-600">
              Ask the magic 8ball a question and get a mysterious answer
            </p>
          </div>

          <div className="command-card group">
            <SwatchIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2">/cobalt</h3>
            <p className="text-gray-600">Download videos and media from various platforms</p>
          </div>

          <div className="command-card group">
            <CheckCircleIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2">/todo</h3>
            <p className="text-gray-600">Create and manage your todo list and tasks</p>
          </div>

          <div className="command-card group">
            <UserIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2">/whois</h3>
            <p className="text-gray-600">Get domain and IP information for websites</p>
          </div>

          <div className="command-card group">
            <ClockIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2">/time</h3>
            <p className="text-gray-600">Get the current time in different timezones</p>
          </div>

          <div className="command-card group">
            <QuestionMarkCircleIcon className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-2">/help</h3>
            <p className="text-gray-600">Show all available commands and their usage</p>
          </div>
        </div>

        <div className="mt-16 text-center">
          <p className="text-gray-600 mb-4">
            You might use this bot in DMs and servers that allow external applications!
          </p>
        </div>
      </main>

      <footer className="mt-16 text-center text-gray-500 pb-8">
        <div className="flex flex-wrap justify-center gap-6 mb-6">
          <Link to="/legal/privacy" className="hover:text-pink-500 transition-colors text-sm">
            Privacy Policy
          </Link>
          <Link to="/legal/terms" className="hover:text-pink-500 transition-colors text-sm">
            Terms of Service
          </Link>
        </div>
        <p className="hover:text-pink-500 transition-colors">
          Made with ♥ by scanash and the Aethel Labs community
        </p>
      </footer>
    </div>
  );
}
