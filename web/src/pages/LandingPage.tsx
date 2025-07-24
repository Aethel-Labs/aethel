import React from "react";
import {
  ChatBubbleLeftRightIcon,
  BookOpenIcon,
  CloudIcon,
  FaceSmileIcon,
  BellAlertIcon,
  PhotoIcon,
  SparklesIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline';
import Footer from '../components/Footer';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-6 py-12">
        
=        <div className="flex justify-between items-center mb-16">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 flex items-center justify-center rounded-lg overflow-hidden">
              <img 
                src="/bot_icon.png" 
                alt="Bot Icon" 
                className="w-full h-full object-cover"
                width={48}
                height={48}
              />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Aethel</h1>
          </div>
          <a
            href="https://github.com/aethel-labs/aethel"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
          </a>
        </div>

=        <div className="text-center mb-20">
          <h2 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            A useful Discord user bot for your account
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
            Enhance your Discord experience with AI chat, weather updates, reminders, and more useful features.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://discord.com/oauth2/authorize?client_id=1371031984230371369"
              className="bg-[#5865F2] hover:bg-[#4752c4] text-white font-medium py-3 px-8 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.1 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.8 8.18 1.8 12.061 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.891.077.077 0 00-.041.1c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.942-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.957 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.943-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.957 2.418-2.157 2.418z"/>
              </svg>
              Add to Discord
            </a>
            <a
              href="/status"
              className="bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 font-medium py-3 px-8 rounded-lg transition-colors"
            >
              View Status
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: <ChatBubbleLeftRightIcon className="w-6 h-6" />, name: "/ai", description: "Chat with AI, ask questions, get answers" },
            { icon: <BookOpenIcon className="w-6 h-6" />, name: "/wiki", description: "Get answers directly from Wikipedia" },
            { icon: <CloudIcon className="w-6 h-6" />, name: "/weather", description: "Get local weather information" },
            { icon: <FaceSmileIcon className="w-6 h-6" />, name: "/joke", description: "Get random jokes to brighten your day" },
            { icon: <BellAlertIcon className="w-6 h-6" />, name: "/remind", description: "Set reminders for important messages" },
            { icon: <PhotoIcon className="w-6 h-6" />, name: "/dog & /cat", description: "Get random cute pet images" },
            { icon: <SparklesIcon className="w-6 h-6" />, name: "/8ball", description: "Ask the magic 8ball questions" },
            { icon: <GlobeAltIcon className="w-6 h-6" />, name: "/whois", description: "Lookup domain or IP information" }
          ].map((command, index) => (
            <div 
              key={index} 
              className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center">
                <div className="p-2 rounded-lg bg-sky-100 dark:bg-sky-900/30 mr-3">
                  {React.cloneElement(command.icon, { className: 'w-6 h-6 text-gray-600 dark:text-white' })}
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {command.name}
                </h3>
              </div>
              <p className="text-gray-600 dark:text-gray-300 text-sm mt-3 leading-relaxed">
                {command.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Works in DMs and servers that allow external applications
          </p>
          <p className="text-gray-500 dark:text-gray-500">
            Made with ♥ by scanash and the Aethel Labs team
          </p>
        </div>
      </div>
      
      <Footer />
    </div>
  );
}