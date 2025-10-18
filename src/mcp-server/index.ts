import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import fetch from '../utils/dynamicFetch.js';
import logger from '../utils/logger.js';

const tools: Tool[] = [
  {
    name: 'cat',
    description: 'Get a random cat image',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'dog',
    description: 'Get a random dog image',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'weather',
    description: 'Get weather information for a location',
    inputSchema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The location to get weather for',
        },
      },
      required: ['location'],
    },
  },
  {
    name: 'wiki',
    description: 'Search Wikipedia for information',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query for Wikipedia',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'reaction',
    description: 'React to a Discord message with an emoji',
    inputSchema: {
      type: 'object',
      properties: {
        emoji: {
          type: 'string',
          description: 'The emoji to react with',
        },
        target: {
          type: 'string',
          description: 'Target message (user, bot, or message_id)',
          enum: ['user', 'bot'],
        },
      },
      required: ['emoji'],
    },
  },
  {
    name: 'newmessage',
    description: 'Split response into multiple Discord messages',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

function formatToolResponse(
  content: string,
  metadata: Record<string, unknown>,
  showSystemMessage = true,
) {
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
        isSystem: true,
      },
    };
  }

  return {
    content: [],
    metadata: {
      ...metadata,
      isSystem: false,
    },
  };
}

async function executeTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'cat': {
      try {
        const res = await fetch('https://api.pur.cat/random-cat');
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

        const data = await res.json();
        return formatToolResponse(`Here's a cute cat for you! 🐱\n\nImage URL: ${data.url}`, {
          type: 'cat',
          url: data.url,
          title: data.title,
          subreddit: data.subreddit,
          source: 'pur.cat',
        });
      } catch (error) {
        throw new Error(
          `Failed to fetch cat image: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    case 'dog': {
      try {
        const headers = {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
        };

        const res = await fetch('https://api.erm.dog/random-dog', { headers });
        if (!res.ok) throw new Error(`API request failed with status ${res.status}`);

        const data = await res.json();

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
        throw new Error(
          `Failed to fetch dog image: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    case 'weather': {
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

        const data = await res.json();
        const temp = Math.round(data.main?.temp);
        const feels = Math.round(data.main?.feels_like);
        const conditions = data.weather?.[0]?.description || 'Unknown';
        const humidity = data.main?.humidity;
        const wind = Math.round(data.wind?.speed);
        const pressure = data.main?.pressure;

        return formatToolResponse(
          `Weather for ${data.name || location}: ${temp}°F (feels ${feels}°F), ${conditions}. Humidity ${humidity}%, Wind ${wind} mph, Pressure ${pressure} hPa.`,
          {
            type: 'weather',
            location: data.name || location,
            temperature: temp,
            feels_like: feels,
            conditions,
            humidity,
            wind_speed: wind,
            pressure,
          },
        );
      } catch (error) {
        throw new Error(
          `Failed to get weather: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    case 'wiki': {
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

        const data = await res.json();
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
        throw new Error(
          `Failed to search Wikipedia: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    case 'reaction': {
      const emoji = args.emoji as string;
      const target = (args.target as string) || 'user';

      if (!emoji) {
        throw new Error('Emoji is required for reaction tool');
      }

      return {
        content: [],
        metadata: {
          type: 'reaction',
          emoji,
          target,
          success: true,
          handled: true,
          isSystem: false,
        },
      };
    }

    case 'newmessage': {
      return {
        content: [],
        metadata: {
          type: 'newmessage',
          success: true,
          handled: true,
          isSystem: false,
        },
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

const server = new Server(
  {
    name: 'aethel-discord-tools',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    logger.debug(`[MCP Server] Executing tool: ${name}`, args);
    const result = await executeTool(name, args || {});
    logger.debug(`[MCP Server] Tool ${name} completed successfully`);

    return {
      content: result.content,
      metadata: result.metadata,
    };
  } catch (error) {
    logger.error(`[MCP Server] Tool ${name} failed:`, error);
    throw error;
  }
});

async function startServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('[MCP Server] Aethel Discord Tools MCP Server started');
}

process.on('SIGINT', async () => {
  logger.info('[MCP Server] Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('[MCP Server] Shutting down...');
  process.exit(0);
});

startServer().catch((error) => {
  logger.error('[MCP Server] Failed to start:', error);
  process.exit(1);
});
