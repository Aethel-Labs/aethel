import {
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
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

        const embed = new EmbedBuilder().setColor(0x8a2be2).setTitle(title).setImage(dogData.url);
        embed.setFooter({
          text: (await client.getLocaleText('poweredby', interaction.locale)) + ' erm.dog',
        });

        if (dogData.subreddit) {
          const fromText = await client.getLocaleText('reddit.from', interaction.locale, {
            subreddit: dogData.subreddit,
          });
          embed.setDescription(fromText);
        }
        const refreshLabel = await client.getLocaleText('commands.dog.newdog', interaction.locale);
        const refreshButton = new ButtonBuilder()
          .setCustomId('refresh_dog')
          .setLabel(refreshLabel)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🐶');
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(refreshButton);
        await interaction.editReply({
          embeds: [embed],
          components: [row],
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
