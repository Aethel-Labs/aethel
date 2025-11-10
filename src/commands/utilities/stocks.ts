import {
  SlashCommandBuilder,
  MessageFlags,
  InteractionContextType,
  ApplicationIntegrationType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { SlashCommandProps } from '@/types/command';
import logger from '@/utils/logger';
import { sanitizeInput } from '@/utils/validation';
import {
  getTickerOverview,
  getAggregateSeries,
  buildBrandingUrl,
  sanitizeTickerInput,
  StockTimeframe,
} from '@/services/massive';
import { renderStockCandles } from '@/utils/stockChart';
import {
  createCooldownManager,
  checkCooldown,
  setCooldown,
  createCooldownResponse,
} from '@/utils/cooldown';
import { createCommandLogger } from '@/utils/commandLogger';
import { createErrorHandler } from '@/utils/errorHandler';
import * as config from '@/config';
import BotClient from '@/services/Client';

const cooldownManager = createCooldownManager('stocks', 5000);
const commandLogger = createCommandLogger('stocks');
const errorHandler = createErrorHandler('stocks');

const DEFAULT_TIMEFRAME: StockTimeframe = '1d';
const SUPPORTED_TIMEFRAMES: StockTimeframe[] = ['1d', '5d', '1m', '3m', '1y'];
const BUTTON_PREFIX = 'stocks_tf';
const MAX_DESCRIPTION_LENGTH = 350;

const TIMEFRAME_LABEL_KEYS: Record<StockTimeframe, string> = {
  '1d': 'commands.stocks.buttons.timeframes.1d',
  '5d': 'commands.stocks.buttons.timeframes.5d',
  '1m': 'commands.stocks.buttons.timeframes.1m',
  '3m': 'commands.stocks.buttons.timeframes.3m',
  '1y': 'commands.stocks.buttons.timeframes.1y',
};

const compactNumber = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
});

function getCurrencyFormatter(code?: string) {
  const currency = code && code.length === 3 ? code : 'USD';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'JPY' ? 0 : 2,
    });
  } catch {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    });
  }
}

function formatCurrency(value?: number, currency?: string) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return getCurrencyFormatter(currency).format(value);
}

function formatNumber(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return compactNumber.format(value);
}

function truncateDescription(description?: string) {
  if (!description) return undefined;
  const clean = sanitizeInput(description);
  if (clean.length <= MAX_DESCRIPTION_LENGTH) {
    return clean;
  }
  return `${clean.slice(0, MAX_DESCRIPTION_LENGTH)}…`;
}

function resolveCurrencyCode(value?: string) {
  if (!value) return 'USD';
  const normalized = value.trim().toUpperCase();
  if (normalized.length === 3) {
    return normalized;
  }
  return 'USD';
}

function toValidDate(value?: number | string | null) {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  return undefined;
}

interface StocksRenderOptions {
  client: BotClient;
  locale: string;
  ticker: string;
  timeframe: StockTimeframe;
  userId: string;
}

async function buildTimeframeButtons(
  client: BotClient,
  locale: string,
  active: StockTimeframe,
  userId: string,
  ticker: string,
) {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

  for (const timeframe of SUPPORTED_TIMEFRAMES) {
    const label = await client.getLocaleText(TIMEFRAME_LABEL_KEYS[timeframe], locale);
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}:${userId}:${ticker}:${timeframe}`)
        .setLabel(label.toUpperCase())
        .setStyle(timeframe === active ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );
  }

  return row;
}

export async function renderStocksView(options: StocksRenderOptions) {
  const normalizedTicker = sanitizeTickerInput(options.ticker);
  if (!normalizedTicker) {
    const error = new Error('STOCKS_TICKER_NOT_FOUND');
    throw error;
  }

  const overview = await getTickerOverview(normalizedTicker);
  if (!overview.detail) {
    const error = new Error('STOCKS_TICKER_NOT_FOUND');
    throw error;
  }

  const aggregates = await getAggregateSeries(normalizedTicker, options.timeframe);

  const detail = overview.detail;
  const snapshot = overview.snapshot;
  const lastPrice = snapshot?.lastTrade?.p ?? snapshot?.day?.c ?? snapshot?.prevDay?.c;
  const prevClose = snapshot?.prevDay?.c;
  const changeValue =
    snapshot?.todaysChange ?? (lastPrice && prevClose ? lastPrice - prevClose : undefined);
  const changePercent =
    snapshot?.todaysChangePerc ??
    (changeValue && prevClose ? (changeValue / prevClose) * 100 : undefined);
  const trend =
    typeof changeValue === 'number'
      ? changeValue === 0
        ? 'neutral'
        : changeValue > 0
          ? 'up'
          : 'down'
      : 'neutral';
  const color = trend === 'up' ? 0x1ac486 : trend === 'down' ? 0xff6b6b : 0x5865f2;
  const chartBuffer = aggregates.length
    ? await renderStockCandles(aggregates, options.timeframe)
    : undefined;

  const [
    priceLabel,
    changeLabel,
    rangeLabel,
    volumeLabel,
    prevCloseLabel,
    marketCapLabel,
    providedBy,
  ] = await Promise.all([
    options.client.getLocaleText('commands.stocks.labels.price', options.locale),
    options.client.getLocaleText('commands.stocks.labels.change', options.locale),
    options.client.getLocaleText('commands.stocks.labels.dayrange', options.locale),
    options.client.getLocaleText('commands.stocks.labels.volume', options.locale),
    options.client.getLocaleText('commands.stocks.labels.prevclose', options.locale),
    options.client.getLocaleText('commands.stocks.labels.marketcap', options.locale),
    options.client.getLocaleText('providedby', options.locale),
  ]);

  const currencySymbol = resolveCurrencyCode(detail.currency_name);
  const description = truncateDescription(detail.description);
  const dayLow = snapshot?.day?.l ?? snapshot?.prevDay?.l;
  const dayHigh = snapshot?.day?.h ?? snapshot?.prevDay?.h;
  const thumbnail = buildBrandingUrl(detail.branding?.icon_url ?? detail.branding?.logo_url);
  const footerText = `${providedBy} Massive.com`;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${normalizedTicker} • ${detail.name}`)
    .setFooter({ text: footerText });

  const timestampDate = toValidDate(snapshot?.updated);
  embed.setTimestamp(timestampDate ?? new Date());

  if (description) {
    embed.setDescription(description);
  }

  if (thumbnail) {
    embed.setThumbnail(thumbnail);
  }

  let files: AttachmentBuilder[] = [];
  if (chartBuffer) {
    const attachmentName = `stocks-${normalizedTicker}-${options.timeframe}.png`;
    const attachment = new AttachmentBuilder(chartBuffer, { name: attachmentName });
    embed.setImage(`attachment://${attachmentName}`);
    files = [attachment];
  } else {
    embed.addFields({
      name: '\u200B',
      value: await options.client.getLocaleText('commands.stocks.labels.nochart', options.locale),
    });
  }

  embed.addFields(
    {
      name: priceLabel,
      value: formatCurrency(lastPrice, currencySymbol),
      inline: true,
    },
    {
      name: changeLabel,
      value:
        typeof changeValue === 'number'
          ? changePercent
            ? `${formatCurrency(changeValue, currencySymbol)} (${changePercent.toFixed(2)}%)`
            : formatCurrency(changeValue, currencySymbol)
          : '—',
      inline: true,
    },
    {
      name: rangeLabel,
      value: `${formatCurrency(dayLow, currencySymbol)} - ${formatCurrency(dayHigh, currencySymbol)}`,
      inline: true,
    },
    {
      name: volumeLabel,
      value: formatNumber(snapshot?.day?.v ?? snapshot?.prevDay?.v),
      inline: true,
    },
    {
      name: prevCloseLabel,
      value: formatCurrency(prevClose, currencySymbol),
      inline: true,
    },
    {
      name: marketCapLabel,
      value: formatNumber(detail.market_cap),
      inline: true,
    },
  );

  const buttons = await buildTimeframeButtons(
    options.client,
    options.locale,
    options.timeframe,
    options.userId,
    normalizedTicker,
  );

  return {
    embeds: [embed],
    components: [buttons],
    files,
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName('stocks')
    .setDescription('Track stock prices and view quick charts')
    .addStringOption((option) =>
      option
        .setName('ticker')
        .setDescription('The stock ticker symbol (e.g., AAPL, TSLA)')
        .setRequired(true)
        .setMaxLength(15),
    )
    .addStringOption((option) =>
      option
        .setName('range')
        .setDescription('Initial timeframe for the chart')
        .addChoices(
          { name: '1D', value: '1d' },
          { name: '5D', value: '5d' },
          { name: '1M', value: '1m' },
          { name: '3M', value: '3m' },
          { name: '1Y', value: '1y' },
        ),
    )
    .setContexts([
      InteractionContextType.BotDM,
      InteractionContextType.Guild,
      InteractionContextType.PrivateChannel,
    ])
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall),

  async execute(client, interaction) {
    try {
      const cooldownCheck = await checkCooldown(
        cooldownManager,
        interaction.user.id,
        client,
        interaction.locale,
      );
      if (cooldownCheck.onCooldown) {
        return interaction.reply(createCooldownResponse(cooldownCheck.message!));
      }

      if (!config.MASSIVE_API_KEY) {
        const msg = await client.getLocaleText(
          'commands.stocks.errors.noapikey',
          interaction.locale,
        );
        return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
      }

      setCooldown(cooldownManager, interaction.user.id);

      const tickerInput = interaction.options.getString('ticker', true);
      const timeframeInput =
        (interaction.options.getString('range') as StockTimeframe | null) ?? DEFAULT_TIMEFRAME;
      const ticker = sanitizeTickerInput(tickerInput);

      if (!ticker) {
        const notFound = await client.getLocaleText(
          'commands.stocks.errors.notfound',
          interaction.locale,
          {
            ticker: tickerInput,
          },
        );
        return interaction.reply({ content: notFound, flags: MessageFlags.Ephemeral });
      }

      commandLogger.logFromInteraction(
        interaction,
        `ticker: ${ticker} timeframe: ${timeframeInput}`,
      );

      await interaction.deferReply();

      try {
        const response = await renderStocksView({
          client,
          locale: interaction.locale,
          ticker,
          timeframe: timeframeInput,
          userId: interaction.user.id,
        });

        await interaction.editReply(response);
      } catch (error) {
        if ((error as Error).message === 'STOCKS_TICKER_NOT_FOUND') {
          const notFound = await client.getLocaleText(
            'commands.stocks.errors.notfound',
            interaction.locale,
            { ticker },
          );
          await interaction.editReply({ content: notFound, components: [] });
          return;
        }

        await errorHandler({
          interaction,
          client,
          error: error as Error,
          userId: interaction.user.id,
          username: interaction.user.tag,
        });
      }
    } catch (error) {
      logger.error('Unexpected error in stocks command:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: await client.getLocaleText('unexpectederror', interaction.locale),
          flags: MessageFlags.Ephemeral,
        });
      } else if (interaction.deferred) {
        const errorMsg = await client.getLocaleText('unexpectederror', interaction.locale);
        await interaction.editReply({ content: errorMsg });
      }
    }
  },
} as SlashCommandProps;

export function parseStocksButtonId(customId: string) {
  if (!customId.startsWith(`${BUTTON_PREFIX}:`)) return null;
  const [, userId, ticker, timeframe] = customId.split(':');
  if (!userId || !ticker || !SUPPORTED_TIMEFRAMES.includes(timeframe as StockTimeframe)) {
    return null;
  }
  return { userId, ticker, timeframe: timeframe as StockTimeframe };
}
