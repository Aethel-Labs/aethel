import {
  SlashCommandBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
} from 'discord.js';
import { SlashCommandProps } from '@/types/command';
import { sanitizeInput } from '@/utils/validation';
import {
  createCooldownManager,
  checkCooldown,
  setCooldown,
  createCooldownResponse,
} from '@/utils/cooldown';
import { createCommandLogger } from '@/utils/commandLogger';
import { createErrorHandler } from '@/utils/errorHandler';

const cooldownManager = createCooldownManager('lmgtfy', 5000);
const commandLogger = createCommandLogger('lmgtfy');
const errorHandler = createErrorHandler('lmgtfy');

export default {
  data: new SlashCommandBuilder()
    .setName('lmgtfy')
    .setNameLocalizations({
      'es-ES': 'lmgtfy',
      'es-419': 'lmgtfy',
      'en-US': 'lmgtfy',
    })
    .setDescription('Send someone a Let Me Google That For You link')
    .setDescriptionLocalizations({
      'es-ES': 'Envía a alguien un enlace de "Let Me Google That For You"',
      'es-419': 'Envía a alguien un enlace de "Let Me Google That For You"',
      'en-US': 'Send someone a Let Me Google That For You link',
    })
    .addStringOption((option) =>
      option
        .setName('query')
        .setNameLocalizations({
          'es-ES': 'búsqueda',
          'es-419': 'búsqueda',
          'en-US': 'query',
        })
        .setDescription('The search query')
        .setDescriptionLocalizations({
          'es-ES': 'La búsqueda a realizar',
          'es-419': 'La búsqueda a realizar',
          'en-US': 'The search query',
        })
        .setRequired(true)
        .setMaxLength(200),
    )
    .addUserOption((option) =>
      option
        .setName('user')
        .setNameLocalizations({
          'es-ES': 'usuario',
          'es-419': 'usuario',
          'en-US': 'user',
        })
        .setDescription('The user to mention (optional)')
        .setDescriptionLocalizations({
          'es-ES': 'El usuario a mencionar (opcional)',
          'es-419': 'El usuario a mencionar (opcional)',
          'en-US': 'The user to mention (optional)',
        })
        .setRequired(false),
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

      const query = sanitizeInput(interaction.options.getString('query', true));
      const targetUser = interaction.options.getUser('user');

      commandLogger.logFromInteraction(
        interaction,
        `query: "${query?.substring(0, 50)}${query && query.length > 50 ? '...' : ''}"`,
      );

      const encodedQuery = encodeURIComponent(query || '');
      const lmgtfyUrl = `https://letmegooglethat.com/?q=${encodedQuery}`;

      const responseText = await client.getLocaleText(
        targetUser ? 'commands.lmgtfy.responseWithUser' : 'commands.lmgtfy.response',
        interaction.locale,
        {
          url: lmgtfyUrl,
          user: targetUser?.toString() || '',
        },
      );

      await interaction.reply({
        content: responseText,
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
