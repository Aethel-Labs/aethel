import LegalLayout from '../components/LegalLayout';

export default function TermsOfService() {
  return (
    <LegalLayout
      title="Terms of Service"
      lastUpdated="November 9, 2025"
    >
      <div className="legal-body space-y-10">
        <section>
          <h2 className="legal-h2">1. Acceptance of Terms</h2>
          <p>
            By using the Bot, you agree to be bound by these Terms of Service. If you do not agree
            to these terms, please do not use the Bot.
          </p>
        </section>

        <section>
          <h2 className="legal-h2">2. Description of Service</h2>
          <p>
            The Bot provides various Discord utilities including but not limited to: reminders,
            random cat and dog images, weather information, wiki lookups, and fun commands. You
            agree to use the Bot in accordance with Discord's Terms of Service and Community
            Guidelines.
          </p>
          <ul>
            <li>Reminder system</li>
            <li>Random cat and dog images</li>
            <li>Weather information</li>
            <li>Wiki lookups</li>
            <li>Informational stock snapshots</li>
            <li>And other Discord utilities</li>
          </ul>
        </section>

        <section>
          <h2 className="legal-h2">3. User Responsibilities</h2>
          <p>When using the Bot, you agree not to:</p>
          <ul>
            <li>Use the Bot for any illegal or unauthorized purpose</li>
            <li>Violate any laws in your jurisdiction</li>
            <li>Attempt to disrupt or interfere with the Bot's operation</li>
            <li>Spam or harass others</li>
            <li>Attempt to reverse engineer or modify the Bot</li>
          </ul>
        </section>

        <section>
          <h2 className="legal-h2">4. Financial Data & /stocks Command</h2>
          <p>
            The /stocks command and any other financial utilities are provided for informational
            purposes only. We do not offer investment advice, brokerage services, or any tools for
            trading automation. By using these features you acknowledge and agree that:
          </p>
          <ul>
            <li>
              You will not rely on the Bot for investment, legal, tax, or other professional advice.
            </li>
            <li>
              You will not use the Bot to attempt to manipulate any financial market, coordinate
              trading activity, or distribute misleading information.
            </li>
            <li>
              All output is delayed, may be inaccurate, and is intended solely for personal,
              non-commercial use.
            </li>
            <li>
              You are solely responsible for complying with applicable securities laws, exchange
              policies, and platform rules.
            </li>
            <li>
              We may throttle, modify, or disable financial data access at any time without notice.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="legal-h2">5. API Usage</h2>
          <p>
            The Bot may use third-party APIs and services ("Third-Party Services"). Your use of
            these services is subject to their respective terms and privacy policies.
          </p>
          <ul>
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
          <h2 className="legal-h2">6. Limitation of Liability</h2>
          <p>
            The Bot is provided "as is" without any warranties. We are not responsible for any
            direct, indirect, incidental, or consequential damages resulting from the use of the
            Bot.
          </p>
        </section>

        <section>
          <h2 className="legal-h2">7. Changes to Terms</h2>
          <p>
            We reserve the right to modify these terms at any time. Continued use of the Bot after
            changes constitutes acceptance of the new terms.
          </p>
        </section>

        <section>
          <h2 className="legal-h2">8. Contact</h2>
          <p>
            If you have any questions about these Terms of Service, please contact us at{' '}
            <a href="mailto:scan@scanash.com">scan@scanash.com</a>.
          </p>
        </section>
      </div>
    </LegalLayout>
  );
}
