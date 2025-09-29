import LegalLayout from '../components/LegalLayout';

export default function PrivacyPolicy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      lastUpdated="July 26, 2025"
    >
      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            1. Information We Collect
          </h2>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            When you use our Discord Bot, we collect the following information:
          </p>
          <ul className="list-disc pl-6 space-y-3 text-gray-700 dark:text-gray-300 mt-2">
            <li>
              <strong>Discord Account Information:</strong> User ID, username, discriminator (if
              applicable), and avatar hash through Discord OAuth
            </li>
            <li>
              <strong>Command Usage Data:</strong> Command names, user IDs, usernames, server
              (Guild) IDs, channel IDs, timestamps, and additional command parameters for logging
              and monitoring
            </li>
            <li>
              <strong>AI Usage Tracking:</strong> Daily usage counts per user for rate limiting
              (stored in ai_usage table)
            </li>
            <li>
              <strong>Custom API Keys:</strong> Encrypted API keys, custom model preferences, and
              custom API URLs (if provided) for AI functionality
            </li>
            <li>
              <strong>Reminders:</strong> User ID, username, reminder messages, expiration dates,
              channel/server IDs, and metadata including source information
            </li>
            <li>
              <strong>Todo Items:</strong> User ID, todo text, completion status, creation and
              completion timestamps
            </li>
            <li>
              <strong>User Strikes:</strong> Strike counts, ban timestamps, and last strike dates
              for moderation purposes
            </li>
            <li>
              <strong>Language Preferences:</strong> User language settings for localized responses
            </li>
            <li>
              <strong>Conversation History:</strong> Temporary AI conversation context stored in
              memory (automatically cleaned up)
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            2. How We Use Your Information
          </h2>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            We use the collected information for the following purposes:
          </p>
          <ul className="list-disc pl-6 space-y-3 text-gray-700 dark:text-gray-300 mt-2">
            <li>
              <strong>Service Functionality:</strong> Process Discord commands, provide AI
              responses, manage reminders and todos
            </li>
            <li>
              <strong>User Authentication:</strong> Verify user identity through Discord OAuth for
              web dashboard access
            </li>
            <li>
              <strong>Rate Limiting:</strong> Track daily AI usage to enforce usage limits and
              prevent abuse
            </li>
            <li>
              <strong>Moderation:</strong> Monitor command usage and maintain user strike records
              for Terms of Service enforcement
            </li>
            <li>
              <strong>Personalization:</strong> Store language preferences and custom AI
              configurations
            </li>
            <li>
              <strong>Logging and Monitoring:</strong> Record command usage for debugging,
              performance monitoring, and abuse prevention
            </li>
            <li>
              <strong>Data Cleanup:</strong> Automatically remove expired reminders and old
              conversation history
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            3. Data Storage and Retention
          </h2>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            We implement the following data storage and retention practices:
          </p>
          <ul className="list-disc pl-6 space-y-3 text-gray-700 dark:text-gray-300 mt-2">
            <li>
              <strong>API Keys:</strong> Encrypted using AES-256-GCM encryption before database
              storage. You can remove them anytime using{' '}
              <code className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-sm font-mono text-gray-800 dark:text-gray-200">
                /ai use_custom_api:false
              </code>
            </li>
            <li>
              <strong>Reminders:</strong> Stored until completion, with automatic cleanup of
              completed reminders after 30 days
            </li>
            <li>
              <strong>Todo Items:</strong> Stored indefinitely until manually deleted by the user
            </li>
            <li>
              <strong>AI Usage Data:</strong> Daily usage counts stored for rate limiting purposes
            </li>
            <li>
              <strong>Conversation History:</strong> Temporarily stored in memory for context (max 2
              hours), automatically cleaned up
            </li>
            <li>
              <strong>Command Logs:</strong> Usage logs stored for monitoring and debugging purposes
            </li>
            <li>
              <strong>User Strikes:</strong> Moderation records stored for Terms of Service
              enforcement
            </li>
            <li>We do not sell or share your personal information with third parties</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            4. Third-Party Services
          </h2>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            Our Bot integrates with the following third-party services. Each service has its own
            privacy policy and terms of service:
          </p>
          <ul className="list-disc pl-6 space-y-3 text-gray-700 dark:text-gray-300 mt-2">
            <li>
              <strong>Discord:</strong> User authentication, command processing, and message
              delivery through Discord's platform
            </li>
            <li>
              <strong>OpenRouter (Default AI):</strong> AI responses when users don't provide custom
              API keys
            </li>
            <li>
              <strong>User-Provided AI Services:</strong> OpenAI, Anthropic, or other
              OpenAI-compatible APIs when custom keys are configured
            </li>
            <li>
              <strong>Weather APIs:</strong> External weather data providers for weather command
              functionality
            </li>
            <li>
              <strong>Wikipedia:</strong> Article searches and content retrieval for wiki command
            </li>
            <li>
              <strong>PostgreSQL Database:</strong> Hosted database service for data storage
            </li>
          </ul>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
            We have no control over and assume no responsibility for the content, privacy policies,
            or practices of these third-party services.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            5. Data Security
          </h2>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            We implement the following security measures to protect your information:
          </p>
          <ul className="list-disc pl-6 space-y-3 text-gray-700 dark:text-gray-300 mt-2">
            <li>
              <strong>API Key Encryption:</strong> AES-256-GCM encryption for all stored API keys
            </li>
            <li>
              <strong>Data Sanitization:</strong> Automatic redaction of sensitive information in
              logs
            </li>
            <li>
              <strong>Authentication:</strong> JWT tokens for web dashboard access with 7-day
              expiration
            </li>
            <li>
              <strong>Rate Limiting:</strong> Daily usage limits to prevent abuse
            </li>
            <li>
              <strong>Ephemeral Responses:</strong> Sensitive commands use Discord's ephemeral
              replies
            </li>
            <li>
              <strong>Memory Management:</strong> Automatic cleanup of temporary data and
              conversation history
            </li>
            <li>
              <strong>Database Security:</strong> Parameterized queries to prevent SQL injection
            </li>
          </ul>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
            While we implement reasonable security measures, no method of transmission over the
            internet or electronic storage is 100% secure. We cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            6. Children&apos;s Privacy
          </h2>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            Our Bot is not intended for use by children under the age of 13. We do not knowingly
            collect personally identifiable information from children under 13. If you are a parent
            or guardian and you are aware that your child has provided us with personal information,
            please contact us.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            7. Changes to This Policy
          </h2>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            We may update our Privacy Policy from time to time. We will notify you of any changes by
            posting the new Privacy Policy on this page.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            8. Contact Us
          </h2>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            If you have any questions about this Privacy Policy, please contact us at{' '}
            <a
              href="mailto:scan@scanash.com"
              className="text-pink-600 hover:text-pink-700 hover:underline font-medium"
            >
              scan@scanash.com
            </a>
            .
          </p>
        </section>
      </div>
    </LegalLayout>
  );
}
