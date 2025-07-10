import { SlashCommandBuilder, EmbedBuilder, MessageFlags, InteractionContextType, ApplicationIntegrationType } from 'discord.js';
import fetch from '@/utils/dynamicFetch';
import { sanitizeInput } from '@/utils/validation';
import logger from '@/utils/logger';
import { SlashCommandProps } from '@/types/command';
import * as config from "@/config";
import { WeatherAPIResponse, WeatherErrorResponse, WeatherResponse } from '@/types/base';

const cooldowns = new Map();
const COOLDOWN_TIME = 5000;

const FAHRENHEIT_COUNTRIES = new Set(['US', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH', 'LR']); // Let's make sure we all understand the weather

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
  const data = await response.json() as WeatherAPIResponse;
  if (!response.ok || data.cod !== 200) {
    const error = new Error((data as WeatherErrorResponse).message ?? 'Failed to fetch weather data');
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
        .setMaxLength(100)
    )
    .setContexts([InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel])
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall),

  async execute(client, interaction) {
    try {
      const now = Date.now();
      const cooldownKey = `${interaction.user.id}-weather`;
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

      const location = interaction.options.getString('location')!;
      logger.info(`Weather command used by ${interaction.user.tag} for location: ${location}`);

      let metricData: WeatherAPIResponse
      try {
        metricData = await fetchWeatherData(location, 'metric');
      } catch (error: any) {
        logger.error('Error in weather command:', error);
        let errorMsg = await client.getLocaleText("commands.weather.error", interaction.locale);
        if (error.status === '404') {
          errorMsg = await client.getLocaleText("commands.weather.nolocation", interaction.locale);
        } else if (error.message.includes('API key')) {
          errorMsg = await client.getLocaleText("commands.weather.epikeymissing", interaction.locale);
        } else if (error.message) {
          errorMsg = error.message;
        }
        return await interaction.editReply({
          content: errorMsg,
          flags: 1 << 6,
        });
      }
      const data = metricData as WeatherResponse
      const useFahrenheit = FAHRENHEIT_COUNTRIES.has(data.sys.country);

      if (useFahrenheit) {
        metricData = await fetchWeatherData(location, 'imperial');
      }

      // eslint-disable-next-line no-unused-vars
      const tempUnit = useFahrenheit ? '°F' : '°C';
      const windUnit = useFahrenheit ? 'mph' : 'km/h';
      const windSpeed = useFahrenheit ? Math.round(data.wind.speed) : Math.round(data.wind.speed * 3.6);

      const weatherEmoji = getWeatherEmoji(data.weather[0].main);
      const description = data.weather[0].description.split(' ').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

      const currentTime = new Date();
      const formattedDateString = currentTime.toLocaleString(interaction.locale || 'en', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const [tempText, feelsLikeText, weatherText, humidityText, windText, pressureText, title, footer] = await Promise.all([
        await client.getLocaleText("commands.weather.temperature", interaction.locale),
        await client.getLocaleText("commands.weather.feelslike", interaction.locale),
        await client.getLocaleText("commands.weather.default", interaction.locale),
        await client.getLocaleText("commands.weather.humidity", interaction.locale),
        await client.getLocaleText("commands.weather.windspeed", interaction.locale),
        await client.getLocaleText("commands.weather.pressure", interaction.locale),
        await client.getLocaleText("commands.weather.weatherin", interaction.locale, {
          location: `${sanitizeInput(data.name)}, ${data.sys.country} ${weatherEmoji}`
        }),
        await client.getLocaleText("poweredby", interaction.locale),
      ]);

      const embed = new EmbedBuilder()
        .setColor(0x4285f4)
        .setTitle(title)
        .addFields(
          { name: tempText, value: `${Math.round(data.main.temp)}${tempUnit}`, inline: true },
          { name: feelsLikeText, value: `${Math.round(data.main.feels_like)}${tempUnit}`, inline: true },
          { name: weatherText, value: description, inline: true },
          { name: humidityText, value: `${data.main.humidity}%`, inline: true },
          { name: windText, value: `${windSpeed} ${windUnit}`, inline: true },
          { name: pressureText, value: `${data.main.pressure} hPa`, inline: true }
        )
        .setFooter({ text: footer + " Open Weather" })
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Unexpected error in weather command:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: await client.getLocaleText("unexpectederror", interaction.locale),
          flags: MessageFlags.Ephemeral,
        });
      } else if (interaction.deferred) {
        const errorMsg = await client.getLocaleText("unexpectederror", interaction.locale);
        await interaction.editReply({
          content: errorMsg,
          flags: 1 << 6,
        });
      }
    }
  },
} as SlashCommandProps;
