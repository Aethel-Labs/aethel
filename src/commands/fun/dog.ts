import {
  SlashCommandBuilder,
  ButtonStyle,
  InteractionContextType,
  ApplicationIntegrationType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  TextDisplayBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import fetch from '@/utils/dynamicFetch';
import { sanitizeInput } from '@/utils/validation';
import logger from '@/utils/logger';
import { RandomReddit } from '@/types/base';
import { SlashCommandProps } from '@/types/command';
import { browserHeaders } from '@/constants';
import {
  createCooldownManager,
  checkCooldown,
  setCooldown,
  createCooldownResponse,
} from '@/utils/cooldown';
import { createCommandLogger } from '@/utils/commandLogger';
import { createErrorHandler } from '@/utils/errorHandler';

const cooldownManager = createCooldownManager('dog', 3000);
const commandLogger = createCommandLogger('dog');
const errorHandler = createErrorHandler('dog');

async function fetchDogImage(): Promise<RandomReddit> {
  const response = await fetch('https://api.erm.dog/random-dog', { headers: browserHeaders });
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }
  return (await response.json()) as RandomReddit;
}

export default {
  data: new SlashCommandBuilder()
    .setName('dog')
    .setNameLocalizations({
      'es-ES': 'perro',
      'es-419': 'perro',
    })
    .setDescription('Get a random dog image!')
    .setDescriptionLocalizations({
      'es-ES': '¡Obtén una imagen aleatoria de un perro!',
      'es-419': '¡Obtén una imagen aleatoria de un perro!',
    })
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
        interaction.locale
      );
      if (cooldownCheck.onCooldown) {
        return interaction.reply(createCooldownResponse(cooldownCheck.message!));
      }

      setCooldown(cooldownManager, interaction.user.id);

      await interaction.deferReply();
      try {
        commandLogger.logFromInteraction(interaction);
        const dogData = await fetchDogImage();
        if (!dogData || !dogData.url) {
          throw new Error('No image URL found in response');
        }
        const title = dogData.title
          ? sanitizeInput(dogData.title).slice(0, 245) + '...'
          : await client.getLocaleText('commands.dog.randomdog', interaction.locale);

        const refreshLabel = await client.getLocaleText('commands.dog.newdog', interaction.locale);

        const container = new ContainerBuilder()
          .setAccentColor(0x8a2be2)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}`))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              dogData.subreddit
                ? await client.getLocaleText('reddit.from', interaction.locale, {
                    subreddit: dogData.subreddit,
                  })
                : ''
            )
          )
          .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(dogData.url))
          )
          .addActionRowComponents(
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder()
                .setStyle(ButtonStyle.Secondary)
                .setLabel(refreshLabel)
                .setEmoji({ name: '🐶' })
                .setCustomId('refresh_dog')
            )
          );

        await interaction.editReply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
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
      logger.error('Unexpected error in dog command:', error);
      const errorMsg = await client.getLocaleText('unexpectederror', interaction.locale);

      const errorContainer = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(errorMsg)
      );

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          components: [errorContainer],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          components: [errorContainer],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    }
  },
} as SlashCommandProps;
