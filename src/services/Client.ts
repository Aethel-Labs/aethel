import * as config from '@/config';
import initialzeCommands from '@/handlers/initialzeCommands';
import { SlashCommandProps } from '@/types/command';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { promises, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const srcDir = path.join(__dirname, '..');

export default class BotClient extends Client {
  private static instance: BotClient | null = null;
  public commands = new Collection<string, SlashCommandProps>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public t = new Collection<string, any>();

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      presence: {
        status: 'online',
        activities: [
          {
            name: '/weather | /ai',
          },
        ],
      },
    });
    BotClient.instance = this;
  }

  public static getInstance(): BotClient | null {
    return BotClient.instance;
  }

  public async init() {
    await this.setupLocalization();
    await initialzeCommands(this);
    await this.setupEvents();
    this.login(config.TOKEN);
  }

  private async setupEvents() {
    console.log('Initializing events...');
    const eventsDir = path.join(srcDir, 'events');
    for (const event of readdirSync(path.join(eventsDir))) {
      const filepath = path.join(eventsDir, event);
      const fileUrl = `file://${filepath.replace(/\\/g, '/')}`;
      const EventModule = await (await import(fileUrl)).default;

      if (typeof EventModule === 'function') {
        // Handle class exports (like InteractionCreateEvent)
        new EventModule(this);
      } else if (EventModule && typeof EventModule.execute === 'function') {
        // Handle object exports with execute method (like messageCreate)
        this.on(EventModule.name, (...args) => EventModule.execute(...args, this));
      }
    }
  }

  private async setupLocalization() {
    console.log('Loading localization files...');
    const localesDir = path.join(srcDir, '..', 'locales');

    try {
      const localeFiles = (await promises.readdir(localesDir)).filter((f) => f.endsWith('.json'));

      const localePromises = localeFiles.map(async (locale) => {
        const localeFile = path.join(localesDir, locale);
        try {
          const data = await promises.readFile(localeFile, { encoding: 'utf8' });
          const localeKey = locale.split('.')[0];
          this.t.set(localeKey, JSON.parse(data));
          console.log(`Loaded locale: ${localeKey}`);
        } catch (error) {
          console.error(`Failed to load locale file ${locale}:`, error);
        }
      });

      await Promise.all(localePromises);
      console.log(`Loaded ${this.t.size} locale(s)`);
    } catch (error) {
      console.error('Failed to read locales directory:', error);
      throw new Error('Failed to initialize localization');
    }
  }
  public async getLocaleText(key: string, locale: string, replaces = {}): Promise<string> {
    const fallbackLocale = 'en-US';

    if (!locale) {
      locale = fallbackLocale;
    }

    let langMap = this.t.get(locale);
    if (!langMap) {
      const langOnly = locale.split('-')[0];
      langMap = this.t.get(langOnly);
      if (!langMap) {
        const fuzzyLocale = Array.from(this.t.keys()).find((k) => k.startsWith(langOnly + '-'));
        if (fuzzyLocale) {
          langMap = this.t.get(fuzzyLocale);
        } else {
          langMap = this.t.get(fallbackLocale);
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getValueFromMap = (map: any, keyPath: string): any => {
      return keyPath
        .split('.')
        .reduce((prev, cur) => (prev && prev[cur] !== undefined ? prev[cur] : undefined), map);
    };

    let text = getValueFromMap(langMap, key);

    if (text === undefined && locale !== fallbackLocale) {
      langMap = this.t.get(fallbackLocale);
      text = getValueFromMap(langMap, key);
    }

    if (text === undefined) {
      text = `Missing translation for key: ${key}`;
    }

    for (const [varName, value] of Object.entries(replaces)) {
      const regex = new RegExp(`{${varName}}`, 'g');
      text = text.replace(regex, value);
    }

    return text;
  }
}
