import fetch from 'node-fetch';
import logger from '@/utils/logger';
import { formatToolResponse, ToolDefinition } from '@/types/tools';

interface WeatherData {
  main: {
    temp: number;
    feels_like: number;
    humidity: number;
    pressure: number;
  };
  weather: Array<{
    description: string;
  }>;
  wind: {
    speed: number;
  };
  name: string;
}

const weatherTool: ToolDefinition = {
  name: 'weather',
  description: 'Get the current weather for a given location.',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City name to fetch the weather for',
      },
    },
    required: ['location'],
  },
  async handler(args) {
    const location = args.location as string;
    if (!location) {
      throw new Error('Location is required for weather tool');
    }

    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      throw new Error('OpenWeather API key not configured');
    }

    try {
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=imperial`,
      );

      if (!res.ok) {
        throw new Error(`Weather API error: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as WeatherData;
      const temp = Math.round(data.main.temp);
      const feels = Math.round(data.main.feels_like);
      const conditions = data.weather[0]?.description || 'Unknown';
      const humidity = data.main.humidity;
      const wind = Math.round(data.wind.speed);
      const pressure = data.main.pressure;
      const city = data.name || location;

      return formatToolResponse(
        `Weather for ${city}: ${temp}°F (feels ${feels}°F), ${conditions}. ` +
          `Humidity ${humidity}%, Wind ${wind} mph, Pressure ${pressure} hPa.`,
        {
          type: 'weather',
          location: city,
          temperature: temp,
          feels_like: feels,
          conditions,
          humidity,
          wind_speed: wind,
          pressure,
        },
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in weather tool:', error);
      throw new Error(`Failed to get weather: ${errorMessage}`);
    }
  },
};

export default weatherTool;
