import {
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
  InteractionContextType,
  ApplicationIntegrationType,
} from 'discord.js';
import fetch from '@/utils/dynamicFetch';
import { sanitizeInput } from '@/utils/validation';
import logger from '@/utils/logger';
import { RandomReddit } from '@/types/base';
import { SlashCommandProps } from '@/types/command';
import { browserHeaders } from '@/constants';

const cooldowns = new Map();
const COOLDOWN_TIME = 3000;

async function fetchDogImage(): Promise<RandomReddit> {
  const response = await fetch('https://api.erm.dog/random-dog', { headers: browserHeaders });
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }
  return await response.json() as RandomReddit;
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
    .setContexts([InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel])
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall),

  async execute(client, interaction) {
    try {
      const now = Date.now();
      const cooldownKey = `${interaction.user.id}-dog`;
      const cooldownEnd = cooldowns.get(cooldownKey) || 0;

      if (now < cooldownEnd) {
        const timeLeft = Math.ceil((cooldownEnd - now) / 1000);
        const waitMessage = await client.getLocaleText("cooldown", interaction.locale, {
          cooldown: timeLeft
        });
        return interaction.reply({
          content: waitMessage,
          flags: MessageFlags.Ephemeral,
        });
      }

      cooldowns.set(cooldownKey, now + COOLDOWN_TIME);
      setTimeout(() => cooldowns.delete(cooldownKey), COOLDOWN_TIME);

      await interaction.deferReply();
      try {
        logger.info(`Dog command used by ${interaction.user.tag}`);
        const dogData = await fetchDogImage();
        if (!dogData || !dogData.url) {
          throw new Error('No image URL found in response');
        }
        const title = dogData.title ? sanitizeInput(dogData.title).slice(0, 245) + '...' : await client.getLocaleText("commands.dog.randomdog", interaction.locale);

        const embed = new EmbedBuilder().setColor(0x8a2be2).setTitle(title).setImage(dogData.url);

        let footerText = await client.getLocaleText("poweredby", interaction.locale) + " erm.dog";
        embed.setFooter({ text: footerText });

        if (dogData.subreddit) {
          let fromText = await client.getLocaleText("reddit.from", interaction.locale, { subreddit: dogData.subreddit });
          embed.setDescription(fromText);
        }
        const refreshLabel = await client.getLocaleText("commands.dog.newdog", interaction.locale);
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
        logger.error('Error fetching dog image:', error);
        const errorMsg = await client.getLocaleText("commands.dog.error", interaction.locale);
        await interaction.editReply({
          content: errorMsg,
          // flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      logger.error('Unexpected error in dog command:', error);
      const errorMsg = await client.getLocaleText("unexpectederror", interaction.locale);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: errorMsg,
          flags: MessageFlags.Ephemeral,
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
