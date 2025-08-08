/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  SlashCommandBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
  MessageFlags,
  TextDisplayBuilder,
  ContainerBuilder,
} from 'discord.js';
import whois from 'whois-json';
import { isIP } from 'net';
import { sanitizeInput, isValidDomain } from '@/utils/validation';
import logger from '@/utils/logger';
import { SlashCommandProps } from '@/types/command';
import {
  createCooldownManager,
  checkCooldown,
  setCooldown,
  createCooldownResponse,
} from '@/utils/cooldown';
import { createCommandLogger } from '@/utils/commandLogger';
import { createErrorHandler } from '@/utils/errorHandler';

const cooldownManager = createCooldownManager('whois', 10000);
const commandLogger = createCommandLogger('whois');
const errorHandler = createErrorHandler('whois');
const CACHE_TTL = 3_600_000;
const MAX_RETRIES = 2;
const INITIAL_TIMEOUT = 5_000;
const cache = new Map<string, { data: any; timestamp: number }>();

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = MAX_RETRIES,
  baseDelay = 1000,
): Promise<T> {
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

const SPECIAL_TLDS: Record<string, { servers: string[]; requiresKey: boolean; message: string }> = {
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

function parseRawWhoisData(rawText: string): any {
  const parsed: any = {};
  const lines = rawText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith('%') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('>>>')
    ) {
      continue;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      if (key && value && !value.includes('REDACTED')) {
        if (parsed[key]) {
          if (Array.isArray(parsed[key])) {
            parsed[key].push(value);
          } else {
            parsed[key] = [parsed[key], value];
          }
        } else {
          parsed[key] = value;
        }
      }
    }
  }

  return parsed;
}

function formatWhoisData(data: any): string {
  try {
    if (typeof data === 'string') {
      const parsedData = parseRawWhoisData(data);
      if (Object.keys(parsedData).length > 0) {
        data = parsedData;
      } else {
        return formatRawWhoisData(data);
      }
    }

    const raw = data?.raw || data?.text || data?.whoisData?.raw;
    if (raw && typeof data === 'object' && Object.keys(data).length <= 3) {
      const parsedData = parseRawWhoisData(raw);
      if (Object.keys(parsedData).length > 0) {
        data = parsedData;
      } else {
        return formatRawWhoisData(raw);
      }
    }

    if (typeof data === 'object' && data !== null) {
      const sections: string[] = [];
      const isIpData =
        data.netRange ||
        data.network ||
        data.inetnum ||
        data.route ||
        data.origin ||
        data.cidr ||
        data.netName;

      const sectionData: Record<string, string[]> = isIpData
        ? {
            network: [],
            organization: [],
            contacts: [],
            dates: [],
            technical: [],
          }
        : {
            domain: [],
            dates: [],
            registrar: [],
            registrant: [],
            admin: [],
            tech: [],
            billing: [],
          };

      const sectionTitles: Record<string, string> = isIpData
        ? {
            network: '🌐 Network Information',
            organization: '🏢 Organization',
            contacts: '👤 Contacts',
            dates: '📅 Important Dates',
            technical: '🔧 Technical Details',
          }
        : {
            domain: '🌐 Domain Information',
            dates: '📅 Important Dates',
            registrar: '🏢 Registrar',
            registrant: '👤 Registrant',
            admin: '👨‍💼 Admin',
            tech: '🔧 Technical',
            billing: '💳 Billing',
          };

      const fieldMapping: Record<string, { display: string; section: string }> = isIpData
        ? {
            netRange: { display: 'IP Range', section: 'network' },
            cidr: { display: 'CIDR', section: 'network' },
            netName: { display: 'Network Name', section: 'network' },
            netHandle: { display: 'Network Handle', section: 'network' },
            parent: { display: 'Parent Network', section: 'network' },
            netType: { display: 'Network Type', section: 'network' },
            originAS: { display: 'Origin AS', section: 'network' },
            organization: { display: 'Organization', section: 'organization' },
            orgName: { display: 'Organization Name', section: 'organization' },
            orgId: { display: 'Organization ID', section: 'organization' },
            address: { display: 'Address', section: 'organization' },
            city: { display: 'City', section: 'organization' },
            stateProv: { display: 'State/Province', section: 'organization' },
            postalCode: { display: 'Postal Code', section: 'organization' },
            country: { display: 'Country', section: 'organization' },
            regDate: { display: 'Registration Date', section: 'dates' },
            updated: { display: 'Last Updated', section: 'dates' },
            comment: { display: 'Comments', section: 'technical' },
            ref: { display: 'Reference', section: 'technical' },
            orgAbuseHandle: { display: 'Abuse Handle', section: 'contacts' },
            orgAbuseName: { display: 'Abuse Contact', section: 'contacts' },
            orgAbusePhone: { display: 'Abuse Phone', section: 'contacts' },
            orgAbuseEmail: { display: 'Abuse Email', section: 'contacts' },
            orgTechHandle: { display: 'Tech Handle', section: 'contacts' },
            orgTechName: { display: 'Tech Contact', section: 'contacts' },
            orgTechPhone: { display: 'Tech Phone', section: 'contacts' },
            orgTechEmail: { display: 'Tech Email', section: 'contacts' },
            orgRoutingHandle: { display: 'Routing Handle', section: 'contacts' },
            orgRoutingName: { display: 'Routing Contact', section: 'contacts' },
            orgRoutingPhone: { display: 'Routing Phone', section: 'contacts' },
            orgRoutingEmail: { display: 'Routing Email', section: 'contacts' },
            orgRoutingRef: { display: 'Routing Reference', section: 'contacts' },
            orgAbuseRef: { display: 'Abuse Reference', section: 'contacts' },
            orgTechRef: { display: 'Tech Reference', section: 'contacts' },
            network: { display: 'Network', section: 'network' },
            inetnum: { display: 'IP Range', section: 'network' },
            netname: { display: 'Network Name', section: 'network' },
            descr: { display: 'Description', section: 'organization' },
            countr: { display: 'Country', section: 'organization' },
            'admin-c': { display: 'Admin Contact', section: 'contacts' },
            'tech-c': { display: 'Tech Contact', section: 'contacts' },
            'mnt-by': { display: 'Maintained By', section: 'technical' },
            created: { display: 'Created', section: 'dates' },
            'last-modified': { display: 'Last Modified', section: 'dates' },
            source: { display: 'Source', section: 'technical' },
          }
        : {
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

        if (key === 'Ref' && value.startsWith('http')) {
          value = `[${value}](${value})`;
        }

        if (key === 'Comment' && Array.isArray(value)) {
          value = value.join('\n');
        }

        sectionData[section].push(`**${display}:** ${value}`);
      }

      for (const [section, title] of Object.entries(sectionTitles)) {
        const content = sectionData[section];
        if (content && content.length) sections.push(`**${title}**\n${content.join('\n')}`);
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
      const ipServers = [
        'whois.arin.net',
        'whois.ripe.net',
        'whois.apnic.net',
        'whois.lacnic.net',
        'whois.afrinic.net',
      ];

      for (const server of ipServers) {
        try {
          return await whois(query, {
            server,
            follow: 1,
            timeout: INITIAL_TIMEOUT,
            // format: 'json',
          });
        } catch (error: any) {
          if (error.message.includes('No match') || error.message.includes('not found')) {
            continue;
          }
          logger.debug(`IP WHOIS lookup failed on ${server}:`, error.message);
          continue;
        }
      }

      throw new Error('Could not retrieve IP WHOIS information from any regional registry.');
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

    throw new Error(
      'Could not retrieve WHOIS information. The domain may not exist or the WHOIS server may be temporarily unavailable.',
    );
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
      option.setName('query').setDescription('Domain or IP address to look up').setRequired(true),
    )
    .setContexts([
      InteractionContextType.BotDM,
      InteractionContextType.Guild,
      InteractionContextType.PrivateChannel,
    ])
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall),

  async execute(client, interaction) {
    const cooldownCheck = await checkCooldown(
      cooldownManager,
      interaction.user.id,
      client,
      interaction.locale,
    );
    if (cooldownCheck.onCooldown) {
      return interaction.reply(createCooldownResponse(cooldownCheck.message!));
    }

    setCooldown(cooldownManager, interaction.user.id);

    const query = interaction.options.getString('query', true).trim();
    const sanitizedQuery = sanitizeInput(query);

    if (!isValidDomain(query) && !isIP(query)) {
      return interaction.reply({
        content: '❌ Please provide a valid domain name or IP address.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    try {
      commandLogger.logFromInteraction(interaction, `query: "${sanitizedQuery}"`);

      const whoisData = await getWhoisData(sanitizedQuery);
      const formattedData = formatWhoisData(whoisData);

      const components = [
        new ContainerBuilder()
          .setAccentColor(0x3498db)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🔍 WHOIS Lookup`))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${sanitizedQuery}`))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(formattedData || 'No WHOIS data available'),
          ),
      ];

      await interaction.editReply({
        components,
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error: any) {
      await errorHandler({
        interaction,
        client,
        error: error as Error,
        userId: interaction.user.id,
        username: interaction.user.tag,
      });
    }
  },
} as SlashCommandProps;
