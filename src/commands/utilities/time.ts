import {
  SlashCommandBuilder,
  EmbedBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js';
import { SlashCommandProps } from '@/types/command';
import cityTimezones from 'city-timezones';
import moment from 'moment-timezone';
import { iso2ToDiscordFlag } from '@/utils/misc';
import BotClient from '@/services/Client';
import { createCommandLogger } from '@/utils/commandLogger';
import { createErrorHandler } from '@/utils/errorHandler';

const POPULAR_CITIES = [
  'London',
  'New York',
  'Tokyo',
  'Paris',
  'Sydney',
  'Los Angeles',
  'Chicago',
  'Toronto',
  'Berlin',
  'Madrid',
  'Mexico City',
  'Moscow',
  'Beijing',
  'Seoul',
  'Mumbai',
  'São Paulo',
  'Johannesburg',
  'Cairo',
  'Istanbul',
  'Dubai',
];

const commandLogger = createCommandLogger('time');
const errorHandler = createErrorHandler('time');

export default {
  data: new SlashCommandBuilder()
    .setName('time')
    .setNameLocalizations({
      'es-ES': 'hora',
      'es-419': 'hora',
    })
    .setDescription('Get the current time for a city')
    .setDescriptionLocalizations({
      'es-ES': 'Obtén la hora actual para una ciudad',
      'es-419': 'Obtén la hora actual para una ciudad',
    })
    .addStringOption((opt) =>
      opt
        .setName('location')
        .setDescription('The city to check (e.g., London, New York)')
        .setDescriptionLocalizations({
          'es-ES': 'La ciudad (ej: Londres, Nueva York)',
          'es-419': 'La ciudad (ej: Londres, Nueva York)',
        })
        .setRequired(true)
        .setAutocomplete(true),
    )
    .setContexts([
      InteractionContextType.BotDM,
      InteractionContextType.Guild,
      InteractionContextType.PrivateChannel,
    ])
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall),

  async execute(client: BotClient, interaction: ChatInputCommandInteraction) {
    const locale = interaction.locale;
    const city = interaction.options.getString('location', true);

    try {
      commandLogger.logFromInteraction(interaction);
      const matches = cityTimezones.lookupViaCity(city);
      if (!matches || matches.length === 0) {
        await interaction.reply({
          content: await client.getLocaleText('commands.time.embed.notfound', locale),
        });
        return;
      }
      const shown = matches.slice(0, 5);
      if (shown.length === 1) {
        const match = shown[0];
        const now = moment().tz(match.timezone);
        const day = now.format('dddd');
        const time = now.format('h:mm A z');
        const date = now.format('MMMM D, YYYY');
        const flag = iso2ToDiscordFlag(match.iso2);
        const fieldDay = await client.getLocaleText(
          'commands.time.embed.field_day_of_week',
          locale,
        );
        const fieldTime = await client.getLocaleText('commands.time.embed.field_time', locale);
        const fieldDate = await client.getLocaleText('commands.time.embed.field_date', locale);
        let title = await client.getLocaleText('commands.time.embed.title_single', locale, {
          city: match.city,
          country: match.iso2,
        });
        title = `${title} ${flag}`;
        const author = {
          name: `🕒 ${await client.getLocaleText('commands.time.embed.author', locale)}`,
          iconURL: undefined,
        };
        const footer = {
          text: await client.getLocaleText('commands.time.embed.footer', locale, {
            timezone: match.timezone,
          }),
        };
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setAuthor(author)
          .addFields([
            { name: fieldDay, value: `**${day}**`, inline: true },
            { name: fieldTime, value: `**${time}**`, inline: true },
            { name: fieldDate, value: `**${date}**`, inline: false },
          ])
          .setFooter(footer)
          .setColor(0x8e44ad);
        await interaction.reply({ embeds: [embed] });
      } else {
        const description = await client.getLocaleText(
          'commands.time.embed.multi_city_description',
          locale,
          { city },
        );
        const fields = await Promise.all(
          shown.map(async (match) => {
            const now = moment().tz(match.timezone);
            const day = now.format('dddd');
            const time = now.format('h:mm A z');
            const date = now.format('MMMM D, YYYY');
            const flag = iso2ToDiscordFlag(match.iso2);
            const fieldDay = await client.getLocaleText(
              'commands.time.embed.field_day_of_week',
              locale,
            );
            const fieldTime = await client.getLocaleText('commands.time.embed.field_time', locale);
            const fieldDate = await client.getLocaleText('commands.time.embed.field_date', locale);
            return {
              name: `${match.city}, ${match.iso2} ${flag}`,
              value: `${fieldDay}: **${day}**\n${fieldTime}: **${time}**\n${fieldDate}: **${date}**`,
              inline: false,
            };
          }),
        );
        const title = await client.getLocaleText('commands.time.embed.title_multi', locale, {
          city,
        });
        const author = {
          name: `🕒 ${await client.getLocaleText('commands.time.embed.author', locale)}`,
          iconURL: undefined,
        };
        const footer = {
          text:
            shown.length > 1
              ? await client.getLocaleText('commands.time.embed.footer_multi', locale)
              : await client.getLocaleText('commands.time.embed.footer', locale, {
                  timezone: shown[0].timezone,
                }),
        };
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setAuthor(author)
          .setDescription(description)
          .addFields(fields)
          .setFooter(footer)
          .setColor(0x8e44ad);
        await interaction.reply({ embeds: [embed] });
      }
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

  async autocomplete(client, interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused();
    const filtered = POPULAR_CITIES.filter((city) =>
      city.toLowerCase().includes(focused.toLowerCase()),
    ).slice(0, 25);
    await interaction.respond(filtered.map((city) => ({ name: city, value: city })));
  },
} as SlashCommandProps;
