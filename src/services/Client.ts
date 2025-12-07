import * as config from '@/config';
import initialzeCommands from '@/handlers/initialzeCommands';
import { SlashCommandProps } from '@/types/command';
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { Pool } from 'pg';
import { initializeSocialMediaManager, SocialMediaManager } from './social/SocialMediaManager';
import { promises, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import logger from '@/utils/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const srcDir = path.join(__dirname, '..');

export default class BotClient extends Client {
  private static instance: BotClient | null = null;
  public commands = new Collection<string, SlashCommandProps>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public t = new Collection<string, any>();
  public socialMediaManager?: SocialMediaManager;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public lastModalRawByUser: Map<string, any> = new Map();

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel, Partials.Message],
      presence: {
        status: 'online',
        activities: [
          {
            name: 'Ping me! | /help',
          },
        ],
      },
    });
    BotClient.instance = this;

    interface RawPacket {
      t: string;
      d?: {
        type: number;
        member?: {
          user: {
            id: string;
          };
        };
        user?: {
          id: string;
        };
      };
    }

    this.on('raw', (packet: RawPacket) => {
      try {
        if (packet?.t !== 'INTERACTION_CREATE') return;
        const d = packet.d;
        if (d?.type !== 5) return;
        const userId = d?.member?.user?.id || d?.user?.id;
        if (!userId) return;
        this.lastModalRawByUser.set(userId, d);
        setTimeout(
          () => {
            if (this.lastModalRawByUser.get(userId) === d) {
              this.lastModalRawByUser.delete(userId);
            }
          },
          5 * 60 * 1000,
        );
      } catch (e) {
        logger.warn('Failed to capture raw modal payload', e);
      }
    });
  }

  public static getInstance(): BotClient | null {
    return BotClient.instance;
  }

  public async init() {
    await this.setupLocalization();
    await initialzeCommands(this);
    await this.setupEvents();
    await this.setupDatabase();
    this.login(config.TOKEN);
  }

  private async setupEvents() {
    logger.info('Initializing events...');
    const eventsDir = path.join(srcDir, 'events');
    for (const event of readdirSync(path.join(eventsDir))) {
      const filepath = path.join(eventsDir, event);
      const fileUrl = `file://${filepath.replace(/\\/g, '/')}`;
      const EventModule = await (await import(fileUrl)).default;

      if (typeof EventModule === 'function') {
        new EventModule(this);
      } else if (EventModule && typeof EventModule.execute === 'function') {
        this.on(EventModule.name, (...args) => EventModule.execute(...args, this));
      }
    }
  }

  private async setupLocalization() {
    logger.info('Loading localization files...');
    const localesDir = path.join(srcDir, '..', 'locales');

    try {
      const localeFiles = (await promises.readdir(localesDir)).filter((f) => f.endsWith('.json'));

      const localePromises = localeFiles.map(async (locale) => {
        const localeFile = path.join(localesDir, locale);
        try {
          const data = await promises.readFile(localeFile, { encoding: 'utf8' });
          const localeKey = locale.split('.')[0];
          this.t.set(localeKey, JSON.parse(data));
          logger.debug(`Loaded locale: ${localeKey}`);
        } catch (error) {
          logger.error(`Failed to load locale file ${locale}:`, error);
        }
      });

      await Promise.all(localePromises);
      logger.info(`Loaded ${this.t.size} locale(s)`);
    } catch (error) {
      logger.error('Failed to read locales directory:', error);
      throw new Error('Failed to initialize localization');
    }
  }
  private async setupDatabase() {
    try {
      const sslMode = (process.env.PGSSLMODE || process.env.DATABASE_SSL || '').toLowerCase();
      let ssl: false | { rejectUnauthorized?: boolean; ca?: string } = false;
      const rootCertPath = process.env.PGSSLROOTCERT || process.env.DATABASE_SSL_CA;

      if (sslMode === 'require') {
        ssl = { rejectUnauthorized: true };
      }

      if (rootCertPath) {
        try {
          const ca = await promises.readFile(rootCertPath, 'utf8');
          ssl = { ca, rejectUnauthorized: true };
        } catch (e) {
          console.warn('Failed to read CA certificate: unable to access the specified path.', e);
        }
      }

      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl,
      });

      pool.on('error', (err) => {
        console.error('Unexpected error on idle PostgreSQL client:', err);
      });

      const shutdown = async (signal?: NodeJS.Signals) => {
        try {
          logger.info(`Received ${signal ?? 'shutdown'}: closing services and database pool...`);
          await this.socialMediaManager?.cleanup();
          await pool.end();
          logger.info('Database pool closed. Exiting.');
        } catch (e) {
          console.error('Error during graceful shutdown:', e);
        } finally {
          process.exit(0);
        }
      };

      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));

      this.socialMediaManager = initializeSocialMediaManager(this, pool);
      await this.socialMediaManager.initialize();
    } catch (error) {
      console.error('Failed to initialize database and services:', error);
      throw error;
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
