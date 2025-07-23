import {
  SlashCommandBuilder,
  ButtonStyle,
  ApplicationIntegrationType,
  InteractionContextType,
  ContainerBuilder,
  SectionBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from 'discord.js';
import fetch from '@/utils/dynamicFetch';
import { sanitizeInput } from '@/utils/validation';
import logger from '@/utils/logger';
import { SlashCommandProps } from '@/types/command';
import { RandomReddit } from '@/types/base';
import {
  createCooldownManager,
  checkCooldown,
  setCooldown,
  createCooldownResponse,
} from '@/utils/cooldown';
import { createCommandLogger } from '@/utils/commandLogger';
import { createErrorHandler } from '@/utils/errorHandler';

const cooldownManager = createCooldownManager('cat', 3000);
const commandLogger = createCommandLogger('cat');
const errorHandler = createErrorHandler('cat');

async function fetchCatImage(): Promise<RandomReddit> {
  const response = await fetch('https://api.pur.cat/random-cat'); //cat
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }
  return (await response.json()) as RandomReddit;
}

export default {
  data: new SlashCommandBuilder()
    .setName('cat')
    .setNameLocalizations({
      'es-ES': 'gato',
      'es-419': 'gato',
    })
    .setDescription('Get a random cat image!')
    .setDescriptionLocalizations({
      'es-ES': '¡Obtén una imagen aleatoria de un gato!',
      'es-419': '¡Obtén una imagen aleatoria de un gato!',
    })
    .setContexts([
      InteractionContextType.BotDM,
      InteractionContextType.Guild,
      InteractionContextType.PrivateChannel,
    ])
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall),

  execute: async (client, interaction) => {
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
        const catData = await fetchCatImage();
        if (!catData || !catData.url) {
          throw new Error('No image URL found in response');
        }
        const title = catData.title
          ? sanitizeInput(catData.title).slice(0, 245) + '...'
          : await client.getLocaleText('random.cat', interaction.locale);

        const refreshLabel = await client.getLocaleText('commands.cat.newcat', interaction.locale);

        let content = `# ${title}\n\n`;
        if (catData.subreddit) {
          const fromText = await client.getLocaleText('reddit.from', interaction.locale, {
            subreddit: catData.subreddit,
          });
          content += `${fromText}`;
        }

        const container = new ContainerBuilder()
          .setAccentColor(0xfaa0a0)
          .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(catData.url))
          )
          .addSectionComponents(
            new SectionBuilder()
              .addTextDisplayComponents((textDisplay) => textDisplay.setContent(content))
              .setButtonAccessory((button) =>
                button
                  .setLabel(refreshLabel)
                  .setStyle(ButtonStyle.Danger)
                  .setEmoji({ name: '🐱' })
                  .setCustomId('refresh_cat')
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
      logger.error('Unexpected error in cat command:', error);
      const errorMsg = await client.getLocaleText('unexpectederror', interaction.locale);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: errorMsg,
          ephemeral: true,
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          content: errorMsg,
          // flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
} as SlashCommandProps;
