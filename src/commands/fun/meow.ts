import {
  SlashCommandBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
} from 'discord.js';
import { SlashCommandProps } from '@/types/command';
import { createCommandLogger } from '@/utils/commandLogger';
import { createErrorHandler } from '@/utils/errorHandler';
import { sanitizeInput } from '@/utils/validation';
import {
  createCooldownManager,
  checkCooldown,
  setCooldown,
  createCooldownResponse,
} from '@/utils/cooldown';
import BotClient from '@/services/Client';

const cooldownManager = createCooldownManager('meow', 2000);
const commandLogger = createCommandLogger('meow');
const errorHandler = createErrorHandler('meow');

function translateToMeow(text: string): string {
  const words = text.split(/\s+/);
  const meowWords = words.map((word) => {
    if (word.match(/^https?:\/\//) || word.match(/^<[@#]!?\d+>/) || word.match(/^:[^\s:]+:$/)) {
      return word;
    }

    const punctuation = word.match(/[^\w\s]|_/g)?.join('') || '';
    const cleanWord = word.replace(/[^\w\s]|_/g, '');

    if (!cleanWord) return word;

    const meowVariants = [
      'meow',
      'meow~',
      'mew',
      'mrrp',
      'mew!',
      'nya~',
      'mraow',
      'mrrrow',
      'mewo',
    ];
    const randomMeow = meowVariants[Math.floor(Math.random() * meowVariants.length)];

    const firstChar = cleanWord[0];
    const meowed =
      firstChar === firstChar.toUpperCase()
        ? randomMeow.charAt(0).toUpperCase() + randomMeow.slice(1)
        : randomMeow;

    return meowed + punctuation;
  });

  return meowWords.join(' ');
}

export default {
  data: new SlashCommandBuilder()
    .setName('meow')
    .setNameLocalizations({
      'es-ES': 'maullar',
      'pt-BR': 'miau',
      'en-US': 'meow',
    })
    .setDescription('Translate text into meow language')
    .setDescriptionLocalizations({
      'es-ES': 'Traduce texto al idioma de los gatos',
      'pt-BR': 'Traduz texto para a linguagem dos gatos',
      'en-US': 'Translate text into meow language',
    })
    .addStringOption((option) =>
      option
        .setName('text')
        .setNameLocalizations({
          'es-ES': 'texto',
          'pt-BR': 'texto',
          'en-US': 'text',
        })
        .setDescription('The text to translate to meow')
        .setDescriptionLocalizations({
          'es-ES': 'El texto a traducir a maullidos',
          'pt-BR': 'O texto para traduzir para miau',
          'en-US': 'The text to translate to meow',
        })
        .setRequired(true)
        .setMaxLength(1000),
    )
    .setContexts([
      InteractionContextType.BotDM,
      InteractionContextType.Guild,
      InteractionContextType.PrivateChannel,
    ])
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall),

  async execute(client: BotClient, interaction: import('discord.js').ChatInputCommandInteraction) {
    try {
      const cooldownCheck = await checkCooldown(
        cooldownManager,
        interaction.user.id,
        client,
        interaction.guildId || '',
      );

      if (cooldownCheck.onCooldown) {
        await interaction.reply(
          createCooldownResponse(
            cooldownCheck.message || 'Please wait before using this command again.',
          ),
        );
        return;
      }

      await interaction.deferReply();

      const text = interaction.options.getString('text', true);
      const sanitizedText = sanitizeInput(text);

      if (!sanitizedText) {
        const noTextMessage = await client.getLocaleText(
          'commands.meow.noText',
          interaction.locale,
        );
        await interaction.editReply(noTextMessage);
        return;
      }

      const meowText = translateToMeow(sanitizedText);

      const response = await client.getLocaleText('commands.meow.response', interaction.locale, {
        meowText,
      });

      await interaction.editReply({
        content: response,
        allowedMentions: { parse: [] },
      });

      setCooldown(cooldownManager, interaction.user.id);
      commandLogger.logAction({
        additionalInfo: `Text: ${sanitizedText}`,
      });
    } catch (error) {
      await errorHandler({
        interaction,
        client,
        error: error as Error,
        userId: interaction.user.id,
        username: interaction.user.username,
      });
    }
  },
} as SlashCommandProps;
