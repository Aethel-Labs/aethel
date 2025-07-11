# Aethel Bot

[![Node.js](https://img.shields.io/badge/node-%3E=16.9.0-green?logo=node.js)](https://nodejs.org/)

A privacy-conscious, production-ready Discord user-installed bot with AI chat, reminders, and utility commands. Built with Node.js, Discord.js v14, PostgreSQL, and robust security best practices.

---

## Features

- **AI Chat**: `/ai` command with custom API key support (OpenRouter, OpenAI, Grok)
- **Reminders**: `/remind` command for scheduling reminders
- **Utilities**: `/weather`, `/wiki`, `/joke`, `/cat`, `/dog`, `/8ball`, `/whois`
- **Ephemeral Replies** for sensitive commands
- **Encrypted API Key Storage** (AES-256-GCM)
- **Rate Limiting & Logging**
- **Express Status Endpoint** for monitoring

---

## Getting Started

### 1. Clone & Install

```sh
git clone https://github.com/aethel-labs/aethel.git
cd bot
pnpm i
```

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

- `DISCORD_TOKEN` (your bot token)
- `DATABASE_URL` (Postgres connection string)
- `OPENROUTER_API_KEY` (optional, default AI key)
- `API_KEY_ENCRYPTION_SECRET` (32+ char secret)
- `STATUS_API_KEY` (for status endpoint)
- `ALLOWED_ORIGINS`, `NODE_ENV`, etc.
- `CLIENT_ID` (your discord bot id, copy it from the dashboard)

### 3. Database Migrations

Run all SQL migrations:

```sh
pnpm run scripts/run-migration.js # or node scripts/run-migration.js
```

---

## Usage

- Start the bot: `pnpm start`
- Add the bot to your account and use `/ai`, `/remind`, etc.
- Use `/ai use_custom_api:true` to set your own API key (encrypted)

---

## Privacy & Security

- **No plaintext API keys stored or logged**
- **User data is encrypted and can be deleted by user command**
- **No data sold or shared with third parties**
- **See https://aethel.xyz/legal/privacy for full policy**

---

## Contributing

- PRs welcome! Open issues for bugs/feature requests.
- Follow code style (ESLint, Prettier).
- Add tests for new features.

---

## License

This project is licensed under the MIT License.

See [LICENSE](LICENSE) for details.

7. Start the bot:
   ```bash
   pnpm start
   ```

## Usage

- Use `/ai` for AI chat, with optional custom API key for private usage
- Use `/remind` to schedule reminders
- Use utility commands: `/weather`, `/wiki`, `/joke`, `/cat`, `/dog`, `/8ball`, `/whois`
- Sensitive commands use ephemeral replies for privacy
- Use `/ai use_custom_api:true` to set your own (encrypted) API key

---

## Requirements

- Node.js 16.9.0 or higher
- Discord.js 14.11.0

## 🌐 Translations & Localization

Aethel supports multiple languages! You can help improve or add new translations for the bot.

### Supported Languages

- English (en-US)
  <a href="http://translate.aethel.xyz/engage/aethel/en/">
  <img src="http://translate.aethel.xyz/widgets/aethel/en/svg-badge.svg" alt="English translation status" />
  </a>
- Spanish (es-ES)
  <a href="http://translate.aethel.xyz/engage/aethel/es/">
  <img src="http://translate.aethel.xyz/widgets/aethel/es/svg-badge.svg" alt="Spanish translation status" />
  </a>
- Spanish (Latin America) (es-419)
  <a href="http://translate.aethel.xyz/engage/aethel/es_419/">
  <img src="http://translate.aethel.xyz/widgets/aethel/es_419/svg-badge.svg" alt="Spanish (Latin America) translation status" />
  </a>
- German (de-DE)
  <a href="http://translate.aethel.xyz/engage/aethel/de/">
  <img src="http://translate.aethel.xyz/widgets/aethel/de/svg-badge.svg" alt="German translation status" />
  </a>
- French (fr-FR)
  <a href="http://translate.aethel.xyz/engage/aethel/fr/">
  <img src="http://translate.aethel.xyz/widgets/aethel/fr/svg-badge.svg" alt="French translation status" />
  </a>
- Portuguese (Brazil) (pt-BR)
  <a href="http://translate.aethel.xyz/engage/aethel/pt_BR/">
  <img src="http://translate.aethel.xyz/widgets/aethel/pt_BR/svg-badge.svg" alt="Portuguese (Brazil) translation status" />
  </a>
- Japanese (ja)
  <a href="http://translate.aethel.xyz/engage/aethel/ja/">
  <img src="http://translate.aethel.xyz/widgets/aethel/ja/svg-badge.svg" alt="Japanese translation status" />
  </a>

### Contribute a Translation

We use [Weblate](https://translate.aethel.xyz/projects/aethel/) for collaborative translation. Anyone can contribute:

- Visit the [Aethel Weblate project](https://translate.aethel.xyz/projects/aethel/)
- Sign in or register (free)
- Pick your language and start translating or reviewing existing translations

Your help makes Aethel accessible to more people around the world!

<a href="http://translate.aethel.xyz/engage/aethel/">
  <img src="http://translate.aethel.xyz/widget/aethel/svg-badge.svg" alt="Translation status" />
</a>
