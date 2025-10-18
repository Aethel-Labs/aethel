import { Message } from 'discord.js';
import BotClient from '@/services/Client';
import logger from '@/utils/logger';
import fetch from 'node-fetch';

interface WikipediaPage {
  pageid?: number;
  ns?: number;
  title: string;
  extract?: string;
  thumbnail?: {
    source: string;
    width: number;
    height: number;
  };
  pageimage?: string;
  missing?: boolean;
}

interface _WikipediaResponse {
  query: {
    pages: Record<string, WikipediaPage>;
  };
}

interface _WeatherResponse {
  main: {
    temp: number;
    feels_like: number;
    humidity: number;
  };
  weather: Array<{
    description: string;
    icon: string;
  }>;
  wind: {
    speed: number;
  };
  name: string;
  sys: {
    country: string;
  };
}

export interface MessageToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  content: Array<{
    type: string;
    text?: string;
    image_url?: {
      url: string;
      detail?: 'low' | 'high' | 'auto';
    };
  }>;
  metadata: {
    type: string;
    url?: string;
    title?: string;
    subreddit?: string;
    source?: string;
    isSystem?: boolean;
    [key: string]: unknown;
  };
}

function formatToolResponse(
  content: string,
  metadata: Record<string, unknown> = {},
  showSystemMessage = true,
): ToolResult {
  if (showSystemMessage) {
    return {
      content: [
        {
          type: 'text',
          text: `[SYSTEM] ${content}`,
        },
      ],
      metadata: {
        ...metadata,
        type: 'tool_response',
        isSystem: true,
      },
    };
  }

  return {
    content: [],
    metadata: {
      ...metadata,
      type: 'tool_response',
      isSystem: false,
    },
  };
}

async function catTool(): Promise<ToolResult> {
  try {
    const res = await fetch('https://api.pur.cat/random-cat');
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

    const data = (await res.json()) as { url: string; title?: string; subreddit?: string };
    return formatToolResponse(`Here's a cute cat for you! 🐱\n\nImage URL: ${data.url}`, {
      type: 'cat',
      url: data.url,
      title: data.title,
      subreddit: data.subreddit,
      source: 'pur.cat',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in cat tool:', error);
    throw new Error(`Failed to fetch cat image: ${errorMessage}`);
  }
}

async function dogTool(): Promise<ToolResult> {
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    };

    const res = await fetch('https://api.erm.dog/random-dog', { headers });
    if (!res.ok) throw new Error(`API request failed with status ${res.status}`);

    const data = (await res.json()) as { url: string; title?: string; subreddit?: string };

    if (!data || !data.url) {
      throw new Error('Invalid response format from dog API');
    }

    return formatToolResponse(`Here's a cute dog for you! 🐶\n\nImage URL: ${data.url}`, {
      type: 'dog',
      url: data.url,
      title: data.title || 'Random Dog',
      subreddit: data.subreddit || 'dogpictures',
      source: 'erm.dog',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in dog tool:', error);
    throw new Error(`Failed to fetch dog image: ${errorMessage}`);
  }
}

interface WikipediaSummary {
  title: string;
  extract: string;
  content_urls?: {
    desktop?: {
      page: string;
    };
  };
}

async function wikiTool(args: Record<string, unknown>): Promise<ToolResult> {
  const query = args.query as string;
  if (!query) {
    throw new Error('Query is required for wiki tool');
  }

  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`Wikipedia API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as WikipediaSummary;
    const title = data.title || query;
    const extract = data.extract || 'No summary available.';
    const pageUrl =
      data.content_urls?.desktop?.page ||
      `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`;

    return formatToolResponse(`${title}\n\n${extract}\n\nSource: ${pageUrl}`, {
      type: 'wiki',
      title,
      extract,
      url: pageUrl,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in wiki tool:', error);
    throw new Error(`Failed to search Wikipedia: ${errorMessage}`);
  }
}

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

async function weatherTool(args: Record<string, unknown>): Promise<ToolResult> {
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
}

function resolveEmoji(input: string): string {
  const shortcode = input.match(/^:([a-z0-9_+-]+):$/i)?.[1];
  if (shortcode) {
    const map: Record<string, string> = {
      thumbsup: '👍',
      thumbsdown: '👎',
      '+1': '👍',
      '-1': '👎',
      thumbs_up: '👍',
      thumbs_down: '👎',
      heart: '❤️',
      smile: '😄',
      grin: '😁',
      joy: '😂',
      cry: '😢',
      sob: '😭',
      clap: '👏',
      fire: '🔥',
      star: '⭐',
      eyes: '👀',
      tada: '🎉',
    };
    const key = shortcode.toLowerCase();
    return map[key] || input;
  }
  return input;
}

async function reactionTool(
  args: Record<string, unknown>,
  message: Message,
  client: BotClient,
  opts?: { originalMessage?: Message; botMessage?: Message },
): Promise<ToolResult> {
  const emoji = (args.emoji || args.query || '') as string;
  const target = ((args.target as string) || 'user').toLowerCase();
  const targetMessage = target === 'bot' && opts?.botMessage ? opts.botMessage : message;

  if (!emoji) {
    throw new Error('Emoji is required for reaction tool');
  }

  const resolvedEmoji = resolveEmoji(emoji);

  try {
    await targetMessage.react(resolvedEmoji);

    return {
      content: [],
      metadata: {
        type: 'reaction',
        emoji: resolvedEmoji,
        target,
        success: true,
        handled: true,
        isSystem: false,
      },
    };
  } catch (error) {
    logger.error('Failed to add reaction:', { emoji: resolvedEmoji, error });
    throw new Error(
      `Failed to add reaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

type ToolFunction = (
  args: Record<string, unknown>,
  message: Message,
  client: BotClient,
  opts?: { originalMessage?: Message; botMessage?: Message },
) => Promise<ToolResult>;

const TOOLS: Record<string, ToolFunction> = {
  cat: catTool,
  dog: dogTool,
  wiki: wikiTool,
  weather: weatherTool,
  reaction: (args, message, client, opts) => reactionTool(args, message, client, opts),
  newmessage: () =>
    Promise.resolve({
      content: [],
      metadata: {
        type: 'newmessage',
        success: true,
        handled: true,
        isSystem: false,
      },
    }),
};

export async function executeMessageToolCall(
  toolCall: MessageToolCall,
  message: Message,
  _client: BotClient,
  _opts?: { originalMessage?: Message; botMessage?: Message },
): Promise<{
  success: boolean;
  type: string;
  handled: boolean;
  error?: string;
  result?: ToolResult;
}> {
  const name = (toolCall.name || '').toLowerCase();

  try {
    const tool = TOOLS[name];
    if (!tool) {
      return {
        success: false,
        type: 'error',
        handled: false,
        error: `Tool '${name}' not found`,
      };
    }

    const result = await tool(toolCall.args || {}, message, _client, _opts);

    return {
      success: true,
      type: result.metadata.type || name,
      handled: true,
      result,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error in executeMessageToolCall for ${name}:`, error);
    return {
      success: false,
      type: 'error',
      handled: true,
      error: errorMessage,
    };
  }
}
