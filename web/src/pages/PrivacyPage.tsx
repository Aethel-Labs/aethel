import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
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
          <h1 className="text-4xl font-bold text-white mb-2">Privacy Policy</h1>
          <p className="text-gray-400">Last Updated: July 21, 2025</p>
        </div>
      <div className="space-y-8">
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 pt-8 border-t border-gray-800 first:border-t-0 first:pt-0">1. Information We Collect</h2>
            <p className="text-gray-400 leading-relaxed">
              The bot (&quot;the Bot&quot;) collects the following information:
            </p>
            <ul className="list-disc pl-6 space-y-3 text-gray-400 mt-2">
              <li>Discord user IDs for command processing and functionality</li>
              <li>Server IDs where the Bot is used</li>
              <li>Channel IDs where commands are used</li>
              <li>Message content for commands that require it (e.g., reminders, AI chat)</li>
              <li>API keys provided by users (encrypted and stored safely on our database until the user says otherwise)</li>
              <li>Commands ran and users who ran them</li>

            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4 pt-8 border-t border-gray-800 first:border-t-0 first:pt-0">2. How We Use Your Information</h2>
            <p className="text-gray-400 leading-relaxed">
              We use the collected information to provide, maintain, and improve our Bot&apos;s services, including:
            </p>
            <ul className="list-disc pl-6 space-y-3 text-gray-400 mt-2">
              <li>Provide and maintain the Bot&apos;s functionality</li>
              <li>Process commands and provide responses</li>
              <li>Improve the Bot&apos;s performance and features</li>
              <li>Monitor for abuse and prevent violations of our Terms of Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4 pt-8 border-t border-gray-800 first:border-t-0 first:pt-0">3. Data Storage</h2>
            <p className="text-gray-400 leading-relaxed">
              We take your privacy seriously:
            </p>
            <ul className="list-disc pl-6 space-y-3 text-gray-400 mt-2">
              <li>API keys are securely hashed using industry-standard encryption before being stored in our database</li>
              <li>Your custom API keys and model preferences are stored until you choose to remove them using the <code className="bg-gray-800 px-2 py-0.5 rounded text-sm font-mono text-gray-200">/ai use_custom_api:false</code> command</li>
              <li>We log all message content (like Wiki searches, reminders, and 8-ball queries) for monitoring purposes.</li>
              <li>We do not sell or share your personal information with third parties</li>
              <li>You can delete your stored API key and preferences at any time by running <code className="bg-gray-800 px-1 rounded">/ai use_custom_api:false</code></li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4 pt-8 border-t border-gray-800 first:border-t-0 first:pt-0">4. Third-Party Services</h2>
            <p className="text-gray-400 leading-relaxed">
              Our Bot may contain links to third-party websites or services that are not operated by us. We have no control over and assume no responsibility for the content, privacy policies, or practices of any third-party sites or services.
            </p>
            <ul className="list-disc pl-6 space-y-3 text-gray-400 mt-2">
              <li>Discord&apos;s Privacy Policy for user and server data</li>
              <li>OpenRouter&apos;s Privacy Policy for AI chat functionality</li>
              <li>Weather API providers for weather information</li>
              <li>Wikipedia&apos;s Terms of Service for wiki lookups</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4 pt-8 border-t border-gray-800 first:border-t-0 first:pt-0">5. Data Security</h2>
            <p className="text-gray-400 leading-relaxed">
              We implement reasonable security measures to protect your information, but no method of transmission over the internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4 pt-8 border-t border-gray-800 first:border-t-0 first:pt-0">6. Children&apos;s Privacy</h2>
            <p className="text-gray-400 leading-relaxed">
              Our Bot is not intended for use by children under the age of 13. We do not knowingly collect personally identifiable information from children under 13. If you are a parent or guardian and you are aware that your child has provided us with personal information, please contact us.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4 pt-8 border-t border-gray-800 first:border-t-0 first:pt-0">7. Changes to This Policy</h2>
            <p className="text-gray-400 leading-relaxed">
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4 pt-8 border-t border-gray-800 first:border-t-0 first:pt-0">8. Contact Us</h2>
            <p className="text-gray-400 leading-relaxed">
              If you have any questions about this Privacy Policy, please contact us at <a href="mailto:scan@scanash.com" className="text-blue-400 hover:text-blue-300 hover:underline font-medium">scan@scanash.com</a>.
            </p>
          </section>
      </div>
      </main>
    </div>
  );
}