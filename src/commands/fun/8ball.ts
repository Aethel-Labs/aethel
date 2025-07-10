import { SlashCommandBuilder, EmbedBuilder, MessageFlags, ApplicationIntegrationType, InteractionContextType } from 'discord.js';
import { validateCommandOptions, sanitizeInput } from '@/utils/validation';
import logger from '@/utils/logger';
import { SlashCommandProps } from '@/types/command';
import { random } from '@/utils/misc';

const responses = [
  "itiscertain",
  "itisdecidedlyso",
  "withoutadoubt",
  "yesdefinitely",
  "youmayrelyonit",
  "asiseeityes",
  "mostlikely",
  "outlookgood",
  "yes",
  "signspointtoyes",
  "replyhazytryagain",
  "askagainlater",
  "betternottellyounow",
  "cannotpredictnow",
  "concentrateandaskagain",
  "dontcountonit",
  "myreplyisno",
  "mysourcessayno",
  "outlooknotsogood",
  "verydoubtful"
];

const cooldowns = new Map();
const COOLDOWN_TIME = 3000;

export default {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setNameLocalizations({
      'es-ES': 'bola8',
      'es-419': 'bola8',
      'en-US': '8ball',
    })
    .setDescription('Ask the magic 8-ball a question')
    .setDescriptionLocalizations({
      'es-ES': 'Haz una pregunta a la bola 8 mágica',
      'es-419': 'Haz una pregunta a la bola 8 mágica',
      'en-US': 'Ask the magic 8-ball a question',
    })
    .addStringOption((option) =>
      option
        .setName('question')
        .setNameLocalizations({
          'es-ES': 'pregunta',
          'es-419': 'pregunta',
          'en-US': 'question',
        })
        .setDescription('Your yes/no question for the magic 8-ball')
        .setDescriptionLocalizations({
          'es-ES': 'Tu pregunta de sí/no para la bola 8 mágica',
          'es-419': 'Tu pregunta de sí/no para la bola 8 mágica',
          'en-US': 'Your yes/no question for the magic 8-ball',
        })
        .setRequired(true)
        .setMaxLength(200)
    )
    .setContexts([InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel])
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall),

  execute: async (client, interaction) => {
    try {
      const now = Date.now();
      const cooldownKey = `${interaction.user.id}-8ball`;
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

      const validation = validateCommandOptions(interaction, ['question']);
      if (!validation.isValid) {
        return interaction.reply({
          content: validation.message,
          flags: 1 << 6,
        });
      }

      const question = sanitizeInput(interaction.options.getString('question'));
      const translatedResponse = await client.getLocaleText(`commands.8ball.responces.${random(responses)}`, interaction.locale);
      logger.info(`8ball used by ${interaction.user.tag}: ${question}`);
      const [title, questionLabel, answerLabel, footer] = await Promise.all([
        await client.getLocaleText("commands.8ball.says", interaction.locale),
        await client.getLocaleText("commands.8ball.question", interaction.locale),
        await client.getLocaleText("commands.8ball.answer", interaction.locale),
        await client.getLocaleText("commands.8ball.anotherfortune", interaction.locale)
      ]);

      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(title)
        .addFields(
          { name: `🎱 ${questionLabel}`, value: question },
          { name: answerLabel, value: `**${translatedResponse}**` }
        )
        .setFooter({ text: footer })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error in 8ball command:', error);
      const errorMessage = await client.getLocaleText('failedrequest', interaction.locale);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: errorMessage,
          flags: 1 << 6,
        });
      } else {
        await interaction.reply({
          content: errorMessage,
          flags: 1 << 6,
        });
      }
    }
  },
} as SlashCommandProps;

// atleast, we've a proper structure now