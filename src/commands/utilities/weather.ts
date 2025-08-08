import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  InteractionContextType,
  ApplicationIntegrationType,
} from 'discord.js';
import fetch from '@/utils/dynamicFetch';
import { sanitizeInput } from '@/utils/validation';
import logger from '@/utils/logger';
import { SlashCommandProps } from '@/types/command';
import * as config from '@/config';
import { WeatherAPIResponse, WeatherErrorResponse, WeatherResponse } from '@/types/base';
import {
  createCooldownManager,
  checkCooldown,
  setCooldown,
  createCooldownResponse,
} from '@/utils/cooldown';
import { createCommandLogger } from '@/utils/commandLogger';
import { createErrorHandler } from '@/utils/errorHandler';

const cooldownManager = createCooldownManager('weather', 5000);
const commandLogger = createCommandLogger('weather');
const errorHandler = createErrorHandler('weather');

const FAHRENHEIT_COUNTRIES = new Set(['US', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH', 'LR']);

function getWeatherEmoji(weatherType: string) {
  const weatherEmojis: Record<string, string> = {
    Clear: '☀️',
    Clouds: '☁️',
    Rain: '🌧️',
    Drizzle: '🌦️',
    Thunderstorm: '⛈️',
    Snow: '🌨️',
    Mist: '🌫️',
    Fog: '🌫️',
    Haze: '🌫️',
  };
  return weatherEmojis[weatherType] || '🌡️';
}

async function fetchWeatherData(location: string, units = 'metric') {
  const apiKey = config.OPENWEATHER_API_KEY;
  if (!apiKey) {
    throw new Error('OpenWeather API key not configured');
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=${units}`;
  const response = await fetch(url);
  const data = (await response.json()) as WeatherAPIResponse;
  if (!response.ok || data.cod !== 200) {
    const error = new Error(
      (data as WeatherErrorResponse).message ?? 'Failed to fetch weather data',
    );
    throw error;
  }

  return data;
}

export default {
  data: new SlashCommandBuilder()
    .setName('weather')
    .setNameLocalizations({
      'es-ES': 'clima',
      'es-419': 'clima',
      'en-US': 'weather',
    })
    .setDescription('Get the current weather for a location')
    .setDescriptionLocalizations({
      'es-ES': 'Obtén el clima actual para una ubicación',
      'es-419': 'Obtén el clima actual para una ubicación',
      'en-US': 'Get the current weather for a location',
    })
    .addStringOption((option) =>
      option
        .setName('location')
        .setNameLocalizations({
          'es-ES': 'ubicación',
          'es-419': 'ubicación',
          'en-US': 'location',
        })
        .setDescription('City name (e.g., London, New York, Tokyo)')
        .setDescriptionLocalizations({
          'es-ES': 'Nombre de la ciudad (ej: Madrid, Nueva York, Tokio)',
          'es-419': 'Nombre de la ciudad (ej: Ciudad de México, Buenos Aires, Bogotá)',
          'en-US': 'City name (e.g., London, New York, Tokyo)',
        })
        .setRequired(true)
        .setMaxLength(100),
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

      await interaction.deferReply();

      const location = interaction.options.getString('location')!;
      commandLogger.logFromInteraction(interaction, `location: "${location}"`);

      let data: WeatherResponse;
      try {
        data = (await fetchWeatherData(location, 'metric')) as WeatherResponse;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        await errorHandler({
          interaction,
          client,
          error: error as Error,
          userId: interaction.user.id,
          username: interaction.user.tag,
        });
        return;
      }

      const useFahrenheit = FAHRENHEIT_COUNTRIES.has(data.sys.country);

      let displayTemp = data.main.temp;
      let displayFeelsLike = data.main.feels_like;
      let windSpeed = Math.round(data.wind.speed * 3.6);

      if (useFahrenheit) {
        displayTemp = (data.main.temp * 9) / 5 + 32;
        displayFeelsLike = (data.main.feels_like * 9) / 5 + 32;
        windSpeed = Math.round(data.wind.speed * 2.237);
      }

      const tempUnit = useFahrenheit ? '°F' : '°C';
      const windUnit = useFahrenheit ? 'mph' : 'km/h';

      const weatherEmoji = getWeatherEmoji(data.weather[0].main);
      const description = data.weather[0].description
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      const [
        tempText,
        feelsLikeText,
        weatherText,
        humidityText,
        windText,
        pressureText,
        title,
        footer,
      ] = await Promise.all([
        await client.getLocaleText('commands.weather.temperature', interaction.locale),
        await client.getLocaleText('commands.weather.feelslike', interaction.locale),
        await client.getLocaleText('commands.weather.default', interaction.locale),
        await client.getLocaleText('commands.weather.humidity', interaction.locale),
        await client.getLocaleText('commands.weather.windspeed', interaction.locale),
        await client.getLocaleText('commands.weather.pressure', interaction.locale),
        await client.getLocaleText('commands.weather.weatherin', interaction.locale, {
          location: `${sanitizeInput(data.name)}, ${data.sys.country} ${weatherEmoji}`,
        }),
        await client.getLocaleText('poweredby', interaction.locale),
      ]);

      const embed = new EmbedBuilder()
        .setColor(0x4285f4)
        .setTitle(title)
        .addFields(
          { name: tempText, value: `${Math.round(displayTemp)}${tempUnit}`, inline: true },
          {
            name: feelsLikeText,
            value: `${Math.round(displayFeelsLike)}${tempUnit}`,
            inline: true,
          },
          { name: weatherText, value: description, inline: true },
          { name: humidityText, value: `${data.main.humidity}%`, inline: true },
          { name: windText, value: `${windSpeed} ${windUnit}`, inline: true },
          { name: pressureText, value: `${data.main.pressure} hPa`, inline: true },
        )
        .setFooter({ text: footer + ' Open Weather' })
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Unexpected error in weather command:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: await client.getLocaleText('unexpectederror', interaction.locale),
          flags: MessageFlags.Ephemeral,
        });
      } else if (interaction.deferred) {
        const errorMsg = await client.getLocaleText('unexpectederror', interaction.locale);
        await interaction.editReply({
          content: errorMsg,
        });
      }
    }
  },
} as SlashCommandProps;
