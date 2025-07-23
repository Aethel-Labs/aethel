import {
  SlashCommandBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
  ContainerBuilder,
  ButtonStyle,
  MessageFlags,
  TextDisplayBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { validateCommandOptions, sanitizeInput } from '@/utils/validation';
import { SlashCommandProps } from '@/types/command';
import { random } from '@/utils/misc';
import {
  createCooldownManager,
  checkCooldown,
  setCooldown,
  createCooldownResponse,
} from '@/utils/cooldown';
import { createCommandLogger } from '@/utils/commandLogger';
import { createErrorHandler } from '@/utils/errorHandler';

const responses = [
  'itiscertain',
  'itisdecidedlyso',
  'withoutadoubt',
  'yesdefinitely',
  'youmayrelyonit',
  'asiseeityes',
  'mostlikely',
  'outlookgood',
  'yes',
  'signspointtoyes',
  'replyhazytryagain',
  'askagainlater',
  'betternottellyounow',
  'cannotpredictnow',
  'concentrateandaskagain',
  'dontcountonit',
  'myreplyisno',
  'mysourcessayno',
  'outlooknotsogood',
  'verydoubtful',
];

const cooldownManager = createCooldownManager('8ball', 3000);
const commandLogger = createCommandLogger('8ball');
const errorHandler = createErrorHandler('8ball');

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

      const validation = validateCommandOptions(interaction, ['question']);
      if (!validation.isValid) {
        return interaction.reply({
          content: validation.message,
          flags: MessageFlags.Ephemeral,
        });
      }

      const question = sanitizeInput(interaction.options.getString('question'));
      const translatedResponse = await client.getLocaleText(
        `commands.8ball.responces.${random(responses)}`,
        interaction.locale
      );
      commandLogger.logFromInteraction(
        interaction,
        `question: "${question?.substring(0, 50)}${question && question.length > 50 ? '...' : ''}"`
      );
      const [title, questionLabel, answerLabel, askAgainLabel] = await Promise.all([
        await client.getLocaleText('commands.8ball.says', interaction.locale),
        await client.getLocaleText('commands.8ball.question', interaction.locale),
        await client.getLocaleText('commands.8ball.answer', interaction.locale),
        await client.getLocaleText('commands.8ball.askagain', interaction.locale),
      ]);

      const container = new ContainerBuilder()
        .setAccentColor(0x8b5cf6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🔮 ${title}`))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${questionLabel}**\n> ${question}\n\n`)
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ✨ ${answerLabel}`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(translatedResponse))
        .addActionRowComponents(
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Primary)
              .setLabel(askAgainLabel)
              .setEmoji({ name: '🎱' })
              .setCustomId(
                `8ball_reroll_${interaction.user.id}_${Date.now()}_${encodeURIComponent(question)}`
              )
          )
        );

      await interaction.reply({
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
  },
} as SlashCommandProps;
