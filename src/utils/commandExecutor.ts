import {
  ChatInputCommandInteraction,
  InteractionReplyOptions,
  MessagePayload,
  EmbedBuilder,
} from 'discord.js';
import { SlashCommandProps } from '@/types/command';
import BotClient from '@/services/Client';
import logger from '@/utils/logger';

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

type EmbedInput = Record<string, unknown> & {
  data?: Record<string, unknown>;
  toJSON?: () => unknown;
  title?: unknown;
  description?: unknown;
  fields?: unknown;
  color?: unknown;
  timestamp?: unknown;
  footer?: unknown;
};

function toPlainEmbedObject(embed: unknown): Record<string, unknown> | unknown {
  if (embed && typeof embed === 'object') {
    const embedObj = embed as EmbedInput;
    if ('data' in embedObj && embedObj.data) {
      return embedObj.data as Record<string, unknown>;
    }
    if (typeof embedObj.toJSON === 'function') {
      return embedObj.toJSON();
    }
    const e = embedObj as Record<string, unknown>;
    if ('title' in e || 'fields' in e || 'description' in e) {
      return e;
    }
    return {
      title: embedObj.title,
      description: embedObj.description,
      fields: embedObj.fields,
      color: embedObj.color,
      timestamp: embedObj.timestamp,
      footer: embedObj.footer,
    } as Record<string, unknown>;
  }
  return embed as Record<string, unknown>;
}

function testEmbedBuilderStructure() {
  const testEmbed = new EmbedBuilder()
    .setTitle('Test Title')
    .setDescription('Test Description')
    .addFields({ name: 'Test Field', value: 'Test Value', inline: true });

  logger.debug(`[Command Executor] Test EmbedBuilder structure:`, {
    embed: testEmbed,
    hasData: 'data' in testEmbed,
    data: testEmbed.data,
    hasToJSON: typeof testEmbed.toJSON === 'function',
    toJSON: testEmbed.toJSON ? testEmbed.toJSON() : 'N/A',
    keys: Object.keys(testEmbed),
    prototype: Object.getPrototypeOf(testEmbed)?.constructor?.name,
  });

  if (testEmbed.data) {
    logger.debug(`[Command Executor] Test embed data fields:`, {
      fields: testEmbed.data.fields,
      fieldsLength: testEmbed.data.fields?.length,
      allDataKeys: Object.keys(testEmbed.data),
    });
  }
}

export function extractToolCalls(content: string): { cleanContent: string; toolCalls: ToolCall[] } {
  const toolCallRegex = /{([^{}\s:]+):({[^{}]*}|[^{}]*)?}/g;
  const toolCalls: ToolCall[] = [];
  let cleanContent = content;
  let match;

  while ((match = toolCallRegex.exec(content)) !== null) {
    try {
      if (!match[1]) {
        continue;
      }

      const toolName = match[1].trim();
      const argsString = match[2] ? match[2].trim() : '';

      if (!toolName) {
        continue;
      }

      let args: Record<string, unknown> = {};

      if (argsString.startsWith('{') && argsString.endsWith('}')) {
        try {
          args = JSON.parse(argsString);
        } catch (_error) {
          args = { query: argsString };
        }
      } else if (argsString) {
        if (argsString.startsWith('"') && argsString.endsWith('"')) {
          const unquoted = argsString.slice(1, -1);
          if (toolName === 'reaction') {
            args = { emoji: unquoted };
          } else {
            args = { query: unquoted };
          }
        } else {
          args = { query: argsString };
        }
      } else {
        args = {};
      }

      toolCalls.push({
        name: toolName,
        args,
      });

      cleanContent = cleanContent.replace(match[0], '').trim();
    } catch (error) {
      logger.error(`Error parsing tool call: ${error}`);
    }
  }

  return { cleanContent, toolCalls };
}

export async function executeToolCall(
  toolCall: ToolCall,
  interaction: ChatInputCommandInteraction,
  client: BotClient,
): Promise<string> {
  let { name, args } = toolCall;

  if (name.includes(':')) {
    const parts = name.split(':');
    name = parts[0];
    if (!args || Object.keys(args).length === 0) {
      args = { search: parts[1] };
    }
  }

  try {
    const validCommands = ['cat', 'dog', 'joke', '8ball', 'weather', 'wiki'];

    if (!validCommands.includes(name.toLowerCase())) {
      throw new Error(
        `Command '${name}' is not a valid command. Available commands: ${validCommands.join(', ')}`,
      );
    }

    if (['cat', 'dog'].includes(name)) {
      const commandName = name.charAt(0).toUpperCase() + name.slice(1);
      logger.debug(`[${commandName}] Starting ${name} command execution`);

      try {
        const commandDir = 'fun';
        const commandModule = await import(`../commands/${commandDir}/${name}`);

        const imageData =
          name === 'cat'
            ? await commandModule.fetchCatImage()
            : await commandModule.fetchDogImage();

        return JSON.stringify({
          success: true,
          type: name,
          title: imageData.title || `Random ${commandName}`,
          url: imageData.url,
          subreddit: imageData.subreddit,
          source: name === 'cat' ? 'pur.cat' : 'erm.dog',
          handled: true,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : `Unknown error in ${name} command`;
        logger.error(`[${commandName}] Error: ${errorMessage}`, { error });
        return JSON.stringify({
          success: false,
          error: `Failed to execute ${name} command: ${errorMessage}`,
          handled: false,
        });
      }
    }

    if (name === 'wiki') {
      logger.debug('[Wiki] Starting wiki command execution');

      try {
        const wikiModule = await import('../commands/utilities/wiki');

        let searchQuery = '';
        if (typeof args === 'object' && args !== null) {
          const argsObj = args as Record<string, unknown>;
          searchQuery = (argsObj.search as string) || (argsObj.query as string) || '';
        }

        if (!searchQuery) {
          return JSON.stringify({
            error: true,
            message: 'Missing search query',
            status: 400,
          });
        }

        try {
          logger.debug(
            `[Wiki] Searching Wikipedia for: ${searchQuery} (locale: ${interaction.locale || 'en'})`,
          );

          const searchResult = await wikiModule.searchWikipedia(
            searchQuery,
            interaction.locale || 'en',
          );
          logger.debug(`[Wiki] Search result:`, {
            pageid: searchResult.pageid,
            title: searchResult.title,
          });

          const article = await wikiModule.getArticleSummary(
            searchResult.pageid,
            searchResult.wikiLang,
          );
          logger.debug(`[Wiki] Retrieved article:`, {
            title: article.title,
            extractLength: article.extract?.length,
          });

          const maxLength = 1500;
          const truncated = article.extract && article.extract.length > maxLength;
          const extract = truncated
            ? article.extract.substring(0, maxLength)
            : article.extract || 'No summary available for this article.';

          const response = {
            title: article.title,
            content: extract,
            url: `https://${searchResult.wikiLang}.wikipedia.org/wiki/${encodeURIComponent(article.title.replace(/ /g, '_'))}`,
            truncated: truncated,
          };

          return JSON.stringify(response);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const stack = error instanceof Error ? error.stack : undefined;
          const responseStatus =
            error instanceof Error && 'response' in error
              ? (error as { response?: { status?: number } }).response?.status
              : undefined;

          logger.error('[Wiki] Error executing wiki command:', {
            error: errorMessage,
            stack,
            responseStatus,
            searchQuery,
            locale: interaction.locale,
          });

          return JSON.stringify({
            error: true,
            message:
              responseStatus === 404
                ? 'No Wikipedia article found for that search query. Please try a different search term.'
                : `Error searching Wikipedia: ${errorMessage}`,
            status: responseStatus || 500,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        logger.error('[Wiki] Error in wiki command execution:', { error: errorMessage, stack });

        return JSON.stringify({
          error: true,
          message: `Error in wiki command execution: ${errorMessage}`,
          status: 500,
        });
      }
    }

    let commandModule;
    const isDev = process.env.NODE_ENV !== 'production';
    const ext = isDev ? '.ts' : '.js';

    try {
      let commandDir = 'fun';
      if (
        ['weather', 'wiki', 'ai', 'cobalt', 'remind', 'social', 'time', 'todo', 'whois'].includes(
          name,
        )
      ) {
        commandDir = 'utilities';
      }

      const commandPath = `../commands/${commandDir}/${name}${ext}`;
      logger.debug(`[Command Executor] Trying to import command from: ${commandPath}`);
      commandModule = await import(commandPath).catch((e) => {
        logger.error(`[Command Executor] Error importing command '${name}':`, e);
        throw e;
      });

      if (name === 'cat' || name === 'dog') {
        try {
          const imageData =
            name === 'cat'
              ? await commandModule.fetchCatImage()
              : await commandModule.fetchDogImage();

          return JSON.stringify({
            success: true,
            type: name,
            title: imageData.title || `Random ${name === 'cat' ? 'Cat' : 'Dog'}`,
            url: imageData.url,
            subreddit: imageData.subreddit,
            source: name === 'cat' ? 'pur.cat' : 'erm.dog',
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : `Unknown error fetching ${name} image`;
          logger.error(`[${name}] Error: ${errorMessage}`, { error });
          return JSON.stringify({
            success: false,
            error: `Failed to fetch ${name} image: ${errorMessage}`,
          });
        }
      }
    } catch (error) {
      logger.error(`[Command Executor] Error importing command '${name}':`, error);
      throw new Error(`Command '${name}' not found`);
    }

    const command = commandModule.default as SlashCommandProps;

    if (!command) {
      throw new Error(`Command '${name}' not found`);
    }

    let capturedResponse: unknown = null;

    const mockInteraction = {
      ...interaction,
      options: {
        getString: (param: string) => {
          if (typeof args === 'object' && args !== null) {
            const argsObj = args as Record<string, unknown>;
            return (argsObj[param] as string) || '';
          }
          return '';
        },
        getNumber: (param: string) => {
          if (typeof args === 'object' && args !== null) {
            const argsObj = args as Record<string, unknown>;
            const value = argsObj[param];
            return value !== null && value !== undefined ? Number(value) : null;
          }
          return null;
        },
        getBoolean: (param: string) => {
          if (typeof args === 'object' && args !== null) {
            const argsObj = args as Record<string, unknown>;
            const value = argsObj[param];
            return typeof value === 'boolean' ? value : null;
          }
          return null;
        },
      },
      deferReply: async () => {
        return Promise.resolve();
      },
      reply: async (options: InteractionReplyOptions | MessagePayload) => {
        if ('embeds' in options && options.embeds && options.embeds.length > 0) {
          const processedEmbeds = options.embeds.map((e) => toPlainEmbedObject(e));
          capturedResponse = { ...(options as Record<string, unknown>), embeds: processedEmbeds };
        } else {
          capturedResponse = options;
        }
        if ('embeds' in options && options.embeds && options.embeds.length > 0) {
          return JSON.stringify({
            success: true,
            embeds:
              'embeds' in (capturedResponse as Record<string, unknown>)
                ? (capturedResponse as { embeds?: unknown[] }).embeds
                : options.embeds,
          });
        }
        return JSON.stringify({
          success: true,
          content: 'content' in options ? options.content : undefined,
        });
      },
      editReply: async (options: InteractionReplyOptions | MessagePayload) => {
        if ('embeds' in options && options.embeds && options.embeds.length > 0) {
          const processedEmbeds = options.embeds.map((e) => toPlainEmbedObject(e));
          capturedResponse = { ...(options as Record<string, unknown>), embeds: processedEmbeds };
        } else {
          capturedResponse = options;
        }
        logger.debug(`[Command Executor] editReply called with options:`, {
          hasEmbeds: 'embeds' in options && options.embeds && options.embeds.length > 0,
          hasContent: 'content' in options,
          options: options,
        });

        if ('embeds' in options && options.embeds && options.embeds.length > 0) {
          logger.debug(`[Command Executor] Raw embeds before processing:`, options.embeds);

          testEmbedBuilderStructure();

          const processedEmbeds = options.embeds.map((embed) => {
            const embedObj = embed as EmbedInput;
            logger.debug(`[Command Executor] Processing embed:`, {
              hasData: !!(embedObj && typeof embedObj === 'object' && 'data' in embedObj),
              embedKeys: embedObj ? Object.keys(embedObj) : [],
              embedType: (embed as { constructor?: { name?: string } })?.constructor?.name,
              embedPrototype: Object.getPrototypeOf(embedObj as object)?.constructor?.name,
            });
            const plain = toPlainEmbedObject(embedObj);
            return plain;
          });

          logger.debug(`[Command Executor] Processed embeds:`, processedEmbeds);

          if (processedEmbeds.length > 0) {
            const firstEmbed = processedEmbeds[0];
            const firstEmbedObj = firstEmbed as Record<string, unknown>;
            logger.debug(`[Command Executor] First processed embed details:`, {
              title: (firstEmbedObj as { title?: unknown })?.title,
              description: (firstEmbedObj as { description?: unknown })?.description,
              fields: (firstEmbedObj as { fields?: unknown })?.fields,
              fieldsLength: (firstEmbedObj as { fields?: Array<unknown> })?.fields?.length,
              allKeys: firstEmbedObj ? Object.keys(firstEmbedObj) : [],
            });

            logger.debug(
              `[Command Executor] Full embed structure:`,
              JSON.stringify(firstEmbedObj, null, 2),
            );
          }

          const response = {
            success: true,
            embeds: processedEmbeds,
          };
          logger.debug(`[Command Executor] Returning embed response:`, response);
          return JSON.stringify(response);
        }
        const response = {
          success: true,
          content: 'content' in options ? options.content : undefined,
        };
        logger.debug(`[Command Executor] Returning content response:`, response);
        return JSON.stringify(response);
      },
      followUp: async (options: InteractionReplyOptions | MessagePayload) => {
        capturedResponse = options;
        return JSON.stringify({
          success: true,
          content: 'content' in options ? options.content : undefined,
        });
      },
    } as unknown as ChatInputCommandInteraction;

    try {
      const result = await command.execute(client, mockInteraction);

      const responseToProcess = capturedResponse || result;

      logger.debug(`[Command Executor] Processing response for ${name}:`, {
        hasCapturedResponse: !!capturedResponse,
        hasResult: result !== undefined,
        responseType: typeof responseToProcess,
      });

      if (!responseToProcess) {
        return JSON.stringify({
          success: true,
          message: 'Command executed successfully',
        });
      }

      if (typeof responseToProcess === 'string') {
        return JSON.stringify({
          success: true,
          content: responseToProcess,
        });
      }

      if (typeof responseToProcess === 'object') {
        const response = responseToProcess as Record<string, unknown>;

        if (Array.isArray(response.embeds) && response.embeds.length > 0) {
          const embeds = response.embeds as Array<{
            title?: string;
            description?: string;
            fields?: Array<{ name: string; value: string; inline?: boolean }>;
            color?: number;
            timestamp?: string | number | Date;
            footer?: { text: string; icon_url?: string };
          }>;

          logger.debug(`[Command Executor] Processing embeds for ${name}:`, {
            embedCount: embeds.length,
            firstEmbed: embeds[0],
            embedFields: embeds[0]?.fields,
            embedTitle: embeds[0]?.title,
          });

          if (name === 'weather') {
            const embed = embeds[0];
            logger.debug(`[Command Executor] Weather embed details:`, {
              hasEmbed: !!embed,
              hasFields: !!(embed && embed.fields),
              fieldsCount: embed?.fields?.length || 0,
              embedData: embed,
            });

            if (embed && embed.fields && embed.fields.length > 0) {
              const f = embed.fields;
              const title = embed.title || '';
              let locationFromTitle = '';
              try {
                const m = title.match(/([A-Za-zÀ-ÖØ-öø-ÿ' .-]+,\s*[A-Z]{2})/u);
                if (m && m[1]) {
                  locationFromTitle = m[1].trim();
                }
              } catch (_err) {
                /* ignore */
              }
              let locationArg = '';
              if (args && typeof args === 'object') {
                const a = args as Record<string, unknown>;
                locationArg = String(a.location || a.query || a.search || '').trim();
              }
              const weatherResponse = {
                success: true,
                type: 'weather',
                location: locationFromTitle || locationArg || 'Unknown location',
                temperature: f[0]?.value || 'N/A',
                feels_like: f[1]?.value || 'N/A',
                conditions: f[2]?.value || 'N/A',
                humidity: f[3]?.value || 'N/A',
                wind_speed: f[4]?.value || 'N/A',
                pressure: f[5]?.value || 'N/A',
                handled: true,
              };
              logger.debug(`[Command Executor] Weather response:`, weatherResponse);
              return JSON.stringify(weatherResponse);
            }
            logger.debug(`[Command Executor] Weather embed has no fields, using fallback`);
            logger.debug(`[Command Executor] Weather embed fallback data:`, {
              title: embed?.title,
              description: embed?.description,
              fields: embed?.fields,
              allProperties: embed ? Object.keys(embed) : [],
            });

            const fallbackResponse = {
              success: true,
              type: 'weather',
              location:
                embed?.title ||
                (args && typeof args === 'object'
                  ? String(
                      (args as Record<string, unknown>).location ||
                        (args as Record<string, unknown>).query ||
                        (args as Record<string, unknown>).search ||
                        '',
                    )
                  : '') ||
                'Unknown location',
              description: embed?.description || 'Weather data unavailable',
              rawEmbed: embed,
              handled: true,
            };

            return JSON.stringify(fallbackResponse);
          }

          if (name === 'joke') {
            const embed = embeds[0];
            return JSON.stringify({
              success: true,
              type: 'joke',
              title: embed.title || 'Random Joke',
              setup: embed.description || 'No joke available',
              handled: true,
            });
          }

          return JSON.stringify({
            success: true,
            embeds: embeds.map((embed) => ({
              title: embed.title,
              description: embed.description,
              fields:
                embed.fields?.map((f) => ({
                  name: f.name,
                  value: f.value,
                  inline: f.inline,
                })) || [],
              color: embed.color,
              timestamp: embed.timestamp,
              footer: embed.footer,
            })),
          });
        }

        if (Array.isArray(response.components) && response.components.length > 0) {
          if (name === '8ball') {
            const components = response.components as Array<{
              components?: Array<{
                data?: {
                  components?: Array<{
                    data?: {
                      content?: string;
                    };
                  }>;
                };
              }>;
            }>;

            let question = '';
            let answer = '';

            for (const component of components) {
              if (component.components) {
                for (const subComponent of component.components) {
                  if (subComponent.data?.components) {
                    for (const textComponent of subComponent.data.components) {
                      const content = textComponent.data?.content || '';
                      if (content.includes('**Question**') || content.includes('**Pregunta**')) {
                        question = content
                          .replace(/.*?\*\*(.*?)\*\*\s*>\s*(.*?)\n\n.*/s, '$2')
                          .trim();
                      } else if (
                        content.includes('**Answer**') ||
                        content.includes('**Respuesta**') ||
                        content.includes('✨')
                      ) {
                        answer = content.replace(/.*?✨\s*(.*?)$/s, '$1').trim();
                      }
                    }
                  }
                }
              }
            }

            return JSON.stringify({
              success: true,
              type: '8ball',
              question: question || 'Unknown question',
              answer: answer || 'Unknown answer',
              handled: true,
            });
          }
        }

        if (typeof response.content === 'string') {
          return JSON.stringify({
            success: true,
            content: response.content,
          });
        }
      }

      return JSON.stringify({
        success: true,
        message: 'Command executed successfully',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error executing command '${name}':`, errorMessage);
      return JSON.stringify({
        success: false,
        error: errorMessage,
        status: 500,
      });
    }
  } catch (error) {
    logger.error(`Error executing tool call '${name}':`, error);
    return JSON.stringify({
      success: false,
      error: `Error executing tool call '${name}': ${error}`,
      status: 500,
    });
  }
}
