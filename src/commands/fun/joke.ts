import {
  SlashCommandBuilder,
  EmbedBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
} from 'discord.js';
import fetch from '@/utils/dynamicFetch';
import { SlashCommandProps } from '@/types/command';

import {
  createCooldownManager,
  checkCooldown,
  setCooldown,
  createCooldownResponse,
} from '@/utils/cooldown';
import { createCommandLogger } from '@/utils/commandLogger';
import { createErrorHandler } from '@/utils/errorHandler';
import { sanitizeInput } from '@/utils/validation';

const cooldownManager = createCooldownManager('joke', 3000);
const commandLogger = createCommandLogger('joke');
const errorHandler = createErrorHandler('joke');

async function fetchJoke(type: string | null) {
  const baseUrl = 'https://official-joke-api.appspot.com';
  const url = type ? `${baseUrl}/jokes/${type}/random` : `${baseUrl}/random_joke`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data[0] : data;
}

export default {
  data: new SlashCommandBuilder()
    .setName('joke')
    .setNameLocalizations({
      'es-ES': 'chiste',
      'es-419': 'chiste',
      'en-US': 'joke',
    })
    .setDescription('Get a random joke!')
    .setDescriptionLocalizations({
      'es-ES': '¡Obtén un chiste aleatorio!',
      'es-419': '¡Obtén un chiste aleatorio!',
      'en-US': 'Get a random joke!',
    })
    .addStringOption((option) =>
      option
        .setName('type')
        .setNameLocalizations({
          'es-ES': 'tipo',
          'es-419': 'tipo',
          'en-US': 'type',
        })
        .setDescription('The type of joke you want')
        .setDescriptionLocalizations({
          'es-ES': 'El tipo de chiste que deseas',
          'es-419': 'El tipo de chiste que deseas',
          'en-US': 'The type of joke you want',
        })
        .setRequired(false)
        .addChoices(
          {
            name: 'General',
            value: 'general',
            name_localizations: { 'es-ES': 'General', 'es-419': 'General' },
          },
          {
            name: 'Knock-knock',
            value: 'knock-knock',
            name_localizations: { 'es-ES': 'Toc toc', 'es-419': 'Toc toc' },
          },
          {
            name: 'Programming',
            value: 'programming',
            name_localizations: { 'es-ES': 'Programación', 'es-419': 'Programación' },
          },
          { name: 'Dad', value: 'dad', name_localizations: { 'es-ES': 'Papá', 'es-419': 'Papá' } }
        )
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
        interaction.locale
      );
      if (cooldownCheck.onCooldown) {
        return interaction.reply(createCooldownResponse(cooldownCheck.message!));
      }

      setCooldown(cooldownManager, interaction.user.id);
      await interaction.deferReply();

      const jokeType = interaction.options.getString('type');
      commandLogger.logFromInteraction(interaction);

      const joke = await fetchJoke(jokeType);

      const jokeTitle = await client.getLocaleText(
        'commands.joke.type.default',
        interaction.locale,
        {
          type: await client.getLocaleText(`commands.joke.type.${joke.type}`, interaction.locale),
        }
      );

      const waitingFooter = await client.getLocaleText(
        'commands.joke.waitingpunchline',
        interaction.locale,
        {
          seconds: 3,
        }
      );

      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(jokeTitle)
        .setDescription(sanitizeInput(joke.setup))
        .setFooter({ text: waitingFooter });

      await interaction.editReply({ embeds: [embed] });

      setTimeout(async () => {
        try {
          embed.setDescription(
            `${sanitizeInput(joke.setup)}\n\n*${sanitizeInput(joke.punchline)}*`
          );
          embed.setFooter({ text: 'Ba dum tss! 🥁' });
          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error('Error showing punchline:', error);
        }
      }, 3000);
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
