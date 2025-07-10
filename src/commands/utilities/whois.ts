/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  SlashCommandBuilder,
  EmbedBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
} from 'discord.js';
import whois from 'whois-json';
import { isIP } from 'net';
import { sanitizeInput, isValidDomain } from '@/utils/validation';
import logger from '@/utils/logger';
import { SlashCommandProps } from '@/types/command';

const cooldowns = new Map<string, number>();
const COOLDOWN_TIME = 10_000;
const CACHE_TTL = 3_600_000;
const MAX_RETRIES = 2;
const INITIAL_TIMEOUT = 5_000;
const cache = new Map<string, { data: any; timestamp: number }>();

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(fn: () => Promise<T>, maxRetries = MAX_RETRIES, baseDelay = 1000): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      if (
        error.message.includes('No WHOIS data available') ||
        error.message.includes('Unsupported TLD')
      ) {
        throw error;
      }

      if (attempt < maxRetries) {
        const delayMs = baseDelay * Math.pow(2, attempt);
        logger.warn(`Attempt ${attempt + 1} failed, retrying in ${delayMs}ms...`, {
          error: error.message,
        });
        await delay(delayMs);
      }
    }
  }

  throw lastError;
}

const KNOWN_WHOIS_SERVERS: Record<string, string[]> = {
  com: ['whois.verisign-grs.com', 'whois.crsnic.net'],
  net: ['whois.verisign-grs.com', 'whois.crsnic.net'],
  org: ['whois.pir.org', 'whois.publicinterestregistry.org'],
  io: ['whois.nic.io'],
  dev: ['whois.nic.google'],
  app: ['whois.nic.google'],
  ai: ['whois.nic.ai'],
  co: ['whois.nic.co'],
  cat: ['whois.nic.cat'],
  uk: ['whois.nic.uk', 'whois.nominet.org.uk'],
  de: ['whois.denic.de'],
  fr: ['whois.nic.fr'],
  nl: ['whois.domain-registry.nl'],
  eu: ['whois.eu'],
  ca: ['whois.cira.ca'],
  au: ['whois.auda.org.au'],
  nz: ['whois.srs.net.nz'],
  jp: ['whois.jprs.jp'],
  cn: ['whois.cnnic.cn'],
  ru: ['whois.tcinet.ru'],
  br: ['whois.registro.br'],
  in: ['whois.registry.in'],
  me: ['whois.nic.me'],
  tv: ['whois.nic.tv'],
  us: ['whois.nic.us'],
  biz: ['whois.biz'],
  info: ['whois.afilias.net'],
  moe: ['whois.nic.moe'],
  xyz: ['whois.nic.xyz'],
  online: ['whois.nic.online'],
  site: ['whois.nic.site'],
  store: ['whois.nic.store'],
  tech: ['whois.nic.tech'],
  club: ['whois.nic.club'],
  guru: ['whois.nic.guru'],
  lol: ['whois.nic.lol'],
};

const SPECIAL_TLDS: Record<
  string,
  { servers: string[]; requiresKey: boolean; message: string }
> = {
  dev: {
    servers: ['whois.nic.google'],
    requiresKey: true,
    message: 'Google Domains may require authentication for WHOIS lookups.',
  },
  app: {
    servers: ['whois.nic.google'],
    requiresKey: true,
    message: 'Google Domains may require authentication for WHOIS lookups.',
  },
};

function getWhoisServers(domain: string): { servers: string[]; message: string | null } {
  const domainParts = domain.split('.').filter(Boolean);
  const tld = domainParts.length > 0 ? domainParts[domainParts.length - 1].toLowerCase() : '';
  const sld = domainParts.length > 2 ? domainParts[domainParts.length - 2].toLowerCase() : '';

  if (SPECIAL_TLDS[tld]) {
    return {
      servers: SPECIAL_TLDS[tld].servers,
      message: SPECIAL_TLDS[tld].message,
    };
  }

  if (KNOWN_WHOIS_SERVERS[tld]) {
    return {
      servers: KNOWN_WHOIS_SERVERS[tld],
      message: null,
    };
  }

  return {
    servers: [`whois.nic.${tld}`, `whois.${tld}`, `whois.${sld}.${tld}`, 'whois.iana.org'],
    message: 'Using fallback WHOIS server. Results may be limited.',
  };
}

async function isServerReachable(server: string): Promise<boolean> {
  try {
    const { Resolver } = await import('dns').then((module) => module.promises);
    const resolver = new Resolver();
    resolver.setServers(['1.1.1.1', '8.8.8.8']);
    await resolver.resolve4(server);
    return true;
  } catch (error: any) {
    logger.debug(`Server ${server} is not reachable:`, error.message);
    return false;
  }
}

function formatRawWhoisData(rawData: string): string {
  if (!rawData) return '```\nNo WHOIS data available\n```';

  const cleanedLines = rawData
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed &&
        !trimmed.startsWith('%') &&
        !trimmed.startsWith('#') &&
        !trimmed.startsWith('>>>') &&
        !trimmed.startsWith('NOTICE:') &&
        !trimmed.includes('termsOfUse') &&
        !trimmed.includes('lastUpdateOfWhoisDatabase')
      );
    });

  const joined = cleanedLines.join('\n');
  const maxLength = 1900;

  return joined.length <= maxLength
    ? `\`\`\`\n${joined}\`\`\``
    : `\`\`\`\n${joined.substring(0, maxLength - 3)}...\`\`\``;
}

function formatWhoisData(data: any): string {
  try {
    if (typeof data === 'string') {
      return formatRawWhoisData(data);
    }

    const raw = data?.raw || data?.text || data?.whoisData?.raw;
    if (raw) return formatRawWhoisData(raw);

    if (typeof data === 'object' && data !== null) {
      const sections: string[] = [];
      const sectionData: Record<string, string[]> = {
        domain: [],
        dates: [],
        registrar: [],
        registrant: [],
        admin: [],
        tech: [],
        billing: [],
      };

      const sectionTitles: Record<string, string> = {
        domain: '🌐 Domain Information',
        dates: '📅 Important Dates',
        registrar: '🏢 Registrar',
        registrant: '👤 Registrant',
        admin: '👨‍💼 Admin',
        tech: '🔧 Technical',
        billing: '💳 Billing',
      };

      const fieldMapping: Record<
        string,
        { display: string; section: keyof typeof sectionTitles }
      > = {
        domainName: { display: 'Domain Name', section: 'domain' },
        registryDomainId: { display: 'Registry ID', section: 'domain' },
        registryExpiryDate: { display: 'Expiration Date', section: 'dates' },
        creationDate: { display: 'Created On', section: 'dates' },
        updatedDate: { display: 'Last Updated', section: 'dates' },
        domainStatus: { display: 'Status', section: 'domain' },
        dnssec: { display: 'DNSSEC', section: 'domain' },
        nameServer: { display: 'Name Servers', section: 'domain' },
        registrar: { display: 'Registrar', section: 'registrar' },
        registrarIanaId: { display: 'IANA ID', section: 'registrar' },
        registrarWhoisServer: { display: 'WHOIS Server', section: 'registrar' },
        registrarUrl: { display: 'Website', section: 'registrar' },
        registrarAbuseContactEmail: { display: 'Abuse Contact', section: 'registrar' },
        registrarAbuseContactPhone: { display: 'Abuse Phone', section: 'registrar' },
        registrantEmail: { display: 'Email', section: 'registrant' },
        adminEmail: { display: 'Admin Email', section: 'admin' },
        techEmail: { display: 'Tech Email', section: 'tech' },
        billingEmail: { display: 'Billing Email', section: 'billing' },
      };

      const formatDate = (dateStr: string): string => {
        const date = new Date(dateStr);
        return !isNaN(date.getTime()) ? date.toLocaleString() : dateStr;
      };

      for (const [key, { display, section }] of Object.entries(fieldMapping)) {
        let value = data[key];
        if (!value || value.includes('DATA REDACTED')) continue;

        if (key.toLowerCase().includes('date')) {
          value = formatDate(value);
        }

        if (key === 'nameServer' && typeof value === 'string') {
          value = value
            .split(/\s+/)
            .map((ns: string) => `• \`${ns}\``)
            .join('\n');
        }

        if (key.endsWith('Email')) {
          value = value.startsWith('http')
            ? `[Click to contact](${value})`
            : `[${value}](mailto:${value})`;
        }

        sectionData[section].push(`**${display}:** ${value}`);
      }

      for (const [section, title] of Object.entries(sectionTitles)) {
        const content = sectionData[section];
        if (content.length) sections.push(`**${title}**\n${content.join('\n')}`);
      }

      sections.push(`_Last updated: ${new Date().toLocaleString()}_`);
      return sections.join('\n\n');
    }

    return formatRawWhoisData(JSON.stringify(data, null, 2));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return '```\nError formatting WHOIS data. Please check the logs for details.\n```';
  }
}

async function getWhoisData(query: string): Promise<any> {
  const cacheKey = query.toLowerCase();
  const now = Date.now();

  if (cache.has(cacheKey)) {
    const { data, timestamp } = cache.get(cacheKey)!;
    if (now - timestamp < CACHE_TTL) return data;
  }

  const performLookup = async (): Promise<any> => {
    const isIp = isIP(query);

    if (isIp) {
      return await whois(query, {
        server: 'whois.arin.net',
        follow: 1,
        timeout: INITIAL_TIMEOUT,
        // format: 'json',
      });
    }

    const { servers } = getWhoisServers(query);
    for (const server of servers) {
      if (!(await isServerReachable(server))) continue;

      try {
        return await whois(query, {
          server,
          follow: 1,
          timeout: INITIAL_TIMEOUT,
          // format: 'json',
        });
      } catch {
        continue;
      }
    }

    throw new Error('Could not retrieve WHOIS information. The domain may not exist or the WHOIS server may be temporarily unavailable.');
  };

  const result = await withRetry(performLookup);
  cache.set(cacheKey, { data: result, timestamp: now });

  return result;
}

export default {
  data: new SlashCommandBuilder()
    .setName('whois')
    .setDescription('Look up WHOIS information for a domain or IP address')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('Domain or IP address to look up')
        .setRequired(true)
    )
    .setContexts([InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel])
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall),

  async execute(client, interaction) {
    const now = Date.now();
    const cooldown = cooldowns.get(interaction.user.id);

    if (cooldown && now - cooldown < COOLDOWN_TIME) {
      const timeLeft = Math.ceil((COOLDOWN_TIME - (now - cooldown)) / 1000);
      return interaction.reply({
        content: `⏳ Please wait ${timeLeft} seconds before using this command again.`,
        ephemeral: true,
      });
    }

    cooldowns.set(interaction.user.id, now);

    const query = interaction.options.getString('query', true).trim();
    const sanitizedQuery = sanitizeInput(query);

    if (!isValidDomain(query) && !isIP(query)) {
      return interaction.reply({
        content: '❌ Please provide a valid domain name or IP address.',
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      const whoisData = await getWhoisData(sanitizedQuery);
      const formattedData = formatWhoisData(whoisData);

      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`🔍 WHOIS Lookup: ${sanitizedQuery}`)
        .setDescription(formattedData)
        .setFooter({ text: 'WHOIS data provided by whois-json' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      logger.error(`Error in whois command for ${sanitizedQuery}:`, error);

      const errorMsg = await client.getLocaleText("unexpectederror", interaction.locale);
      await interaction.editReply({
        content: errorMsg,
        flags: 1 << 6,
      });
    }
  },
} as SlashCommandProps;
