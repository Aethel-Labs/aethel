import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Terms of Service</h1>
          <p className="text-gray-400">Last Updated: June 16, 2025</p>
        </div>
      <div className="space-y-8">
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 pt-8 border-t border-gray-800 first:border-t-0 first:pt-0">1. Acceptance of Terms</h2>
            <p className="text-gray-400 leading-relaxed">
              By using the Bot, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Bot.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4 pt-8 border-t border-gray-800 first:border-t-0 first:pt-0">2. Description of Service</h2>
            <p className="text-gray-400 leading-relaxed mb-4">
              The Bot provides various Discord utilities including but not limited to: reminders, random cat and dog images, weather information, wiki lookups, and fun commands. You agree to use the Bot in accordance with Discord&apos;s Terms of Service and Community Guidelines.
            </p>
            <ul className="list-disc pl-6 space-y-3 text-gray-400">
              <li>Reminder system</li>
              <li>Random cat and dog images</li>
              <li>Weather information</li>
              <li>Wiki lookups</li>
              <li>And other Discord utilities</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4 pt-8 border-t border-gray-800 first:border-t-0 first:pt-0">3. User Responsibilities</h2>
            <p className="text-gray-400 leading-relaxed mb-4">
              When using the Bot, you agree not to:
            </p>
            <ul className="list-disc pl-6 space-y-3 text-gray-400">
              <li>Use the Bot for any illegal or unauthorized purpose</li>
              <li>Violate any laws in your jurisdiction</li>
              <li>Attempt to disrupt or interfere with the Bot&apos;s operation</li>
              <li>Spam or harass others</li>
              <li>Attempt to reverse engineer or modify the Bot</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4 pt-8 border-t border-gray-800 first:border-t-0 first:pt-0">4. API Usage</h2>
            <p className="text-gray-400 leading-relaxed">
              The Bot may use third-party APIs and services (&quot;Third-Party Services&quot;). Your use of these services is subject to their respective terms and privacy policies.
            </p>
            <ul className="list-disc pl-6 space-y-3 text-gray-400 mt-2">
              <li>You are responsible for the security of your API keys</li>
              <li>We do not store your API keys permanently - they are only kept in memory during your active session</li>
              <li>You must comply with the terms of service of any third-party APIs you use with the Bot</li>
              <li>We are not responsible for any charges or fees you may incur from third-party API usage</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4 pt-8 border-t border-gray-800 first:border-t-0 first:pt-0">5. Limitation of Liability</h2>
            <p className="text-gray-400 leading-relaxed">
              The Bot is provided &quot;as is&quot; without any warranties. We are not responsible for any direct, indirect, incidental, or consequential damages resulting from the use of the Bot.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4 pt-8 border-t border-gray-800 first:border-t-0 first:pt-0">6. Changes to Terms</h2>
            <p className="text-gray-400 leading-relaxed">
              We reserve the right to modify these terms at any time. Continued use of the Bot after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4 pt-8 border-t border-gray-800 first:border-t-0 first:pt-0">7. Contact</h2>
            <p className="text-gray-400 leading-relaxed">
              If you have any questions about these Terms of Service, please contact us at <a href="mailto:scan@scanash.com" className="text-blue-400 hover:text-blue-300 hover:underline font-medium">scan@scanash.com</a>.
            </p>
          </section>
      </div>
      </main>
    </div>
  );
}