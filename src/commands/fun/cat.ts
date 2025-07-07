import {
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
  ApplicationIntegrationType,
  InteractionContextType,
} from 'discord.js';
import fetch from '@/utils/dynamicFetch';
import { sanitizeInput } from '@/utils/validation';
import logger from '@/utils/logger';
import { SlashCommandProps } from '@/types/command';
import { RandomReddit } from '@/types/base';

const cooldowns = new Map();
const COOLDOWN_TIME = 3000;

async function fetchCatImage(): Promise<RandomReddit> {
  const response = await fetch('https://api.pur.cat/random-cat'); //cat
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }
  return await response.json() as RandomReddit;
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
    .setContexts([InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel])
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall),

  execute: async (client, interaction) => {
    try {
      const now = Date.now();
      const cooldownKey = `${interaction.user!.id}-cat`;
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
        logger.info(`Cat command used by ${interaction.user.tag}`);
        const catData = await fetchCatImage();
        if (!catData || !catData.url) {
          throw new Error('No image URL found in response');
        }
        // Use the async embed builder for proper translation
        const title = catData.title ? sanitizeInput(catData.title).slice(0, 245) + '...' : await await client.getLocaleText("random.cat", interaction.locale);

        const embed = new EmbedBuilder().setColor(0xfaa0a0).setTitle(title).setImage(catData.url);

        let footerText = await client.getLocaleText("poweredby", interaction.locale) + " pur.cat";
        embed.setFooter({ text: footerText });

        if (catData.subreddit) {
          let fromText = await client.getLocaleText("reddit.from", interaction.locale, { subreddit: catData.subreddit });
          embed.setDescription(fromText);
        }
        const refreshLabel = await client.getLocaleText("commands.cat.newcat", interaction.locale);
        const refreshButton = new ButtonBuilder()
          .setCustomId('refresh_cat')
          .setLabel(refreshLabel)
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🐱');
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(refreshButton);
        await interaction.editReply({
          embeds: [embed],
          components: [row],
        });
      } catch (error) {
        logger.error('Error fetching cat image:', error);
        const errorMsg = await client.getLocaleText("commands.cat.error", interaction.locale);
        await interaction.editReply({
          content: errorMsg,
          // flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      logger.error('Unexpected error in cat command:', error);
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
