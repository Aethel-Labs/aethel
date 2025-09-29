import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  InteractionContextType,
  ApplicationIntegrationType,
} from 'discord.js';
import fetch from '@/utils/dynamicFetch';
import logger from '@/utils/logger';
import { WikiPageResponse, WikiSearchResponse } from '@/types/base';
import { SlashCommandProps } from '@/types/command';
import {
  createCooldownManager,
  checkCooldown,
  setCooldown,
  createCooldownResponse,
} from '@/utils/cooldown';
import { createCommandLogger } from '@/utils/commandLogger';
import { createErrorHandler } from '@/utils/errorHandler';

const cooldownManager = createCooldownManager('wiki', 3000);
const commandLogger = createCommandLogger('wiki');
const errorHandler = createErrorHandler('wiki');

const MAX_EXTRACT_LENGTH = 2000;

export async function searchWikipedia(query: string, locale = 'en') {
  const wikiLang = locale.startsWith('es') ? 'es' : 'en';
  const searchUrl = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`;

  const response = await fetch(searchUrl);

  if (!response.ok) {
    throw new Error(`Wikipedia API returned ${response.status}`);
  }

  const data = (await response.json()) as WikiSearchResponse;

  if (!data.query?.search?.length) {
    throw new Error('No articles found');
  }

  return {
    ...data.query.search[0],
    wikiLang,
  };
}

export async function getArticleSummary(pageId: number, wikiLang = 'en') {
  const summaryUrl = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro&explaintext&format=json&pithumbsize=300&pageids=${pageId}`;
  const response = await fetch(summaryUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch article summary: ${response.status}`);
  }

  const data = (await response.json()) as WikiPageResponse;
  const page = data.query.pages[pageId];

  if (!page) {
    throw new Error('Article not found');
  }

  return page;
}

export default {
  data: new SlashCommandBuilder()
    .setName('wiki')
    .setNameLocalizations({
      'es-ES': 'wikipedia',
      'es-419': 'wikipedia',
      'en-US': 'wiki',
    })
    .setDescription('Search Wikipedia for a topic')
    .setDescriptionLocalizations({
      'es-ES': 'Busca un tema en Wikipedia',
      'es-419': 'Busca un tema en Wikipedia',
      'en-US': 'Search Wikipedia for a topic',
    })
    .addStringOption((option) =>
      option
        .setName('search')
        .setNameLocalizations({
          'es-ES': 'buscar',
          'es-419': 'buscar',
          'en-US': 'search',
        })
        .setDescription('What do you want to search for?')
        .setDescriptionLocalizations({
          'es-ES': '¿Qué quieres buscar?',
          'es-419': '¿Qué quieres buscar?',
          'en-US': 'What do you want to search for?',
        })
        .setRequired(true)
        .setMaxLength(200),
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

      setCooldown(cooldownManager, interaction.user.id);

      await interaction.deferReply();

      try {
        const searchQuery = interaction.options.getString('search')!;
        commandLogger.logFromInteraction(interaction, `query: "${searchQuery}"`);

        const userLanguage = interaction.locale || 'en';
        const searchResult = await searchWikipedia(searchQuery, userLanguage);
        const article = await getArticleSummary(searchResult.pageid, searchResult.wikiLang);
        const wikiLang = interaction.locale.startsWith('es') ? 'es' : 'en';

        let extract =
          article.extract ||
          (await client.getLocaleText('commands.wiki.nosummary', interaction.locale));

        if (extract.length > MAX_EXTRACT_LENGTH) {
          const truncatedText = await client.getLocaleText(
            'commands.wiki.readmoreonwiki',
            interaction.locale,
          );
          extract =
            extract.substring(0, MAX_EXTRACT_LENGTH - truncatedText.length - 2) +
            ' ' +
            `[${truncatedText}](https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(article.title.replace(/ /g, '_'))})`;
        }

        const readMore = await client.getLocaleText(
          'commands.wiki.readmoreonwiki',
          interaction.locale,
        );
        const title = await client.getLocaleText('commands.wiki.pedia', interaction.locale, {
          article: article.title,
        });

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setURL(
            `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(article.title.replace(/ /g, '_'))}`,
          )
          .setDescription(extract)
          .setColor(0x4285f4)
          .setFooter({ text: readMore })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        await errorHandler({
          interaction,
          client,
          error: error as Error,
          userId: interaction.user.id,
          username: interaction.user.tag,
        });
      }
    } catch (error) {
      logger.error('Unexpected error in wiki command:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: await client.getLocaleText('unexpectederror', interaction.locale),
          flags: MessageFlags.Ephemeral,
        });
      } else if (interaction.deferred) {
        const errorMsg = await client.getLocaleText('unexpectederror', interaction.locale);
        await interaction.editReply({
          content: errorMsg,
        });
      }
    }
  },
} as SlashCommandProps;
