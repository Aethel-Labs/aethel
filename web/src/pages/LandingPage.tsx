import { Bot, MessageSquare, Cloud, Bell, Shield, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Header */}
      <header>
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <span className="text-xl font-semibold text-white">Aethel</span>
            </div>
            
            <nav className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-400 hover:text-white transition-colors">
                Features
              </a>
               <Link 
                 to="/status" 
                 className="text-gray-400 hover:text-white transition-colors"
               >
                 Status
               </Link>
            </nav>
            
            <Link
              to="/login"
              className="bg-white text-black px-4 py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-32 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 text-white">
            A useful Discord user bot
            <span className="block text-gray-400 mt-2">for your account</span>
          </h1>
          
          <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
            Enhance your Discord experience with AI chat, weather updates, reminders, and more useful features.
          </p>
          
          <a
            href="https://discord.com/api/oauth2/authorize?client_id=YOUR_BOT_CLIENT_ID&permissions=8&scope=bot%20applications.commands"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-3 bg-[#5865F2] text-white px-8 py-4 rounded-lg hover:bg-[#4752C4] transition-colors font-medium"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            <span>Add to Discord</span>
          </a>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Features</h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Everything you need to enhance your Discord experience
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-gray-900/50 backdrop-blur-sm p-8 rounded-xl border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300">
              <div className="bg-blue-500/10 w-12 h-12 rounded-lg flex items-center justify-center mb-6">
                <MessageSquare className="h-6 w-6 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-4">AI Chat Assistant</h3>
              <p className="text-gray-400 leading-relaxed">
                Get intelligent responses and assistance with our advanced AI chat system.
              </p>
            </div>
            
            <div className="bg-gray-900/50 backdrop-blur-sm p-8 rounded-xl border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300">
              <div className="bg-green-500/10 w-12 h-12 rounded-lg flex items-center justify-center mb-6">
                <Cloud className="h-6 w-6 text-green-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-4">Weather Updates</h3>
              <p className="text-gray-400 leading-relaxed">
                Stay informed with real-time weather information for any location.
              </p>
            </div>
            
            <div className="bg-gray-900/50 backdrop-blur-sm p-8 rounded-xl border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300">
              <div className="bg-yellow-500/10 w-12 h-12 rounded-lg flex items-center justify-center mb-6">
                <Bell className="h-6 w-6 text-yellow-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-4">Smart Reminders</h3>
              <p className="text-gray-400 leading-relaxed">
                Never miss important events with our intelligent reminder system.
              </p>
            </div>
            
            <div className="bg-gray-900/50 backdrop-blur-sm p-8 rounded-xl border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300">
              <div className="bg-purple-500/10 w-12 h-12 rounded-lg flex items-center justify-center mb-6">
                <Shield className="h-6 w-6 text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-4">Secure & Private</h3>
              <p className="text-gray-400 leading-relaxed">
                Your data is protected with enterprise-grade security measures.
              </p>
            </div>
            
            <div className="bg-gray-900/50 backdrop-blur-sm p-8 rounded-xl border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300">
              <div className="bg-orange-500/10 w-12 h-12 rounded-lg flex items-center justify-center mb-6">
                <Zap className="h-6 w-6 text-orange-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-4">Lightning Fast</h3>
              <p className="text-gray-400 leading-relaxed">
                Experience blazing fast response times and seamless performance.
              </p>
            </div>
            
            <div className="bg-gray-900/50 backdrop-blur-sm p-8 rounded-xl border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300">
              <div className="bg-indigo-500/10 w-12 h-12 rounded-lg flex items-center justify-center mb-6">
                <Bot className="h-6 w-6 text-indigo-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-4">Discord Native</h3>
              <p className="text-gray-400 leading-relaxed">
                Built specifically for Discord with seamless integration.
              </p>
            </div>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="py-12 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <span className="text-lg font-semibold text-white">Aethel</span>
          </div>
          <p className="text-gray-400 mb-6">
            A useful Discord user bot for your account
          </p>
          <div className="flex justify-center space-x-8 text-sm text-gray-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="/status" className="hover:text-white transition-colors">Status</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage