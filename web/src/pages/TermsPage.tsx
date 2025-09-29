import LegalLayout from '../components/LegalLayout';

export default function TermsOfService() {
  return (
    <LegalLayout
      title="Terms of Service"
      lastUpdated="September 29, 2025"
    >
      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            1. Acceptance of Terms
          </h2>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            By using the Bot, you agree to be bound by these Terms of Service. If you do not agree
            to these terms, please do not use the Bot.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            2. Description of Service
          </h2>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
            The Bot provides various Discord utilities including but not limited to: reminders,
            random cat and dog images, weather information, wiki lookups, and fun commands. You
            agree to use the Bot in accordance with Discord&apos;s Terms of Service and Community
            Guidelines.
          </p>
          <ul className="list-disc pl-6 space-y-3 text-gray-700 dark:text-gray-300">
            <li>Reminder system</li>
            <li>Random cat and dog images</li>
            <li>Weather information</li>
            <li>Wiki lookups</li>
            <li>And other Discord utilities</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            3. User Responsibilities
          </h2>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
            When using the Bot, you agree not to:
          </p>
          <ul className="list-disc pl-6 space-y-3 text-gray-700 dark:text-gray-300">
            <li>Use the Bot for any illegal or unauthorized purpose</li>
            <li>Violate any laws in your jurisdiction</li>
            <li>Attempt to disrupt or interfere with the Bot&apos;s operation</li>
            <li>Spam or harass others</li>
            <li>Attempt to reverse engineer or modify the Bot</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            4. API Usage
          </h2>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            The Bot may use third-party APIs and services (&quot;Third-Party Services&quot;). Your
            use of these services is subject to their respective terms and privacy policies.
          </p>
          <ul className="list-disc pl-6 space-y-3 text-gray-700 dark:text-gray-300 mt-2">
            <li>You are responsible for the security of your API keys</li>
            <li>
              Your API keys are stored securely using industry-standard encryption and are only
              accessible to you
            </li>
            <li>You can delete your API keys at any time through the API keys management page</li>
            <li>
              You must comply with the terms of service of any third-party APIs you use with the Bot
            </li>
            <li>
              We are not responsible for any charges or fees you may incur from third-party API
              usage
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            5. Limitation of Liability
          </h2>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            The Bot is provided &quot;as is&quot; without any warranties. We are not responsible for
            any direct, indirect, incidental, or consequential damages resulting from the use of the
            Bot.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            6. Changes to Terms
          </h2>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            We reserve the right to modify these terms at any time. Continued use of the Bot after
            changes constitutes acceptance of the new terms.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            7. Contact
          </h2>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            If you have any questions about these Terms of Service, please contact us at{' '}
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
