import { Message, ChannelType } from 'discord.js';
import BotClient from '@/services/Client';
import logger from '@/utils/logger';
import {
  makeAIRequest,
  getApiConfiguration,
  buildSystemPrompt,
  buildConversation,
  getUserCredentials,
  incrementAndCheckDailyLimit,
  incrementAndCheckServerDailyLimit,
  splitResponseIntoChunks,
  processUrls,
} from '@/commands/utilities/ai';
import { extractToolCalls as extractSlashToolCalls } from '@/utils/commandExecutor';
import fetch from '@/utils/dynamicFetch';
import { executeMessageToolCall, type MessageToolCall } from '@/utils/messageToolExecutor';
import type { ConversationMessage, AIResponse } from '@/commands/utilities/ai';

type ApiConfiguration = ReturnType<typeof getApiConfiguration>;
import { createMemoryManager } from '@/utils/memoryManager';

const serverConversations = createMemoryManager<string, ConversationMessage[]>({
  maxSize: 1000,
  maxAge: 2 * 60 * 60 * 1000,
  cleanupInterval: 10 * 60 * 1000,
});

const serverMessageContext = createMemoryManager<
  string,
  Array<{
    username: string;
    content: string;
    timestamp: number;
  }>
>({
  maxSize: 1000,
  maxAge: 2 * 60 * 60 * 1000,
  cleanupInterval: 10 * 60 * 1000,
});

const userConversations = createMemoryManager<string, ConversationMessage[]>({
  maxSize: 2000,
  maxAge: 2 * 60 * 60 * 1000,
  cleanupInterval: 10 * 60 * 1000,
});

function extractMessageToolCalls(content: string): {
  cleanContent: string;
  toolCalls: MessageToolCall[];
} {
  const { cleanContent, toolCalls } = extractSlashToolCalls(content);

  return { cleanContent, toolCalls };
}

function getServerConversationKey(guildId: string): string {
  return `server:${guildId}`;
}

function getUserConversationKey(userId: string): string {
  return `dm:${userId}`;
}

export default class MessageCreateEvent {
  constructor(private client: BotClient) {
    this.client = client;
    client.on('messageCreate', this.execute.bind(this));
  }

  private async execute(message: Message): Promise<void> {
    logger.debug(`Message received in channel type: ${message.channel.type}`);

    if (message.author.bot) {
      logger.debug('Ignoring message from bot');
      return;
    }

    const isDM = message.channel.type === ChannelType.DM;
    const isMentioned =
      message.mentions.users.has(this.client.user!.id) && !message.mentions.everyone;

    if (!isDM && message.guildId) {
      const contextKey = getServerConversationKey(message.guildId);
      const existingContext = serverMessageContext.get(contextKey) || [];

      const newMessage = {
        username: message.author.username,
        content: message.content,
        timestamp: Date.now(),
      };

      const updatedContext = [...existingContext, newMessage].slice(-10);
      serverMessageContext.set(contextKey, updatedContext);
    }

    if (!isDM && !isMentioned) {
      logger.debug(
        `Storing message for context but not responding - not a DM and bot not mentioned (channel type: ${message.channel.type})`,
      );
      return;
    }

    logger.info(isDM ? 'Processing DM message...' : 'Processing mention in server...');

    try {
      logger.debug(
        `${isDM ? 'DM' : 'Message'} received (${message.content.length} characters) - content hidden for privacy`,
      );

      const hasImageAttachments = message.attachments.some(
        (att) =>
          att.contentType?.startsWith('image/') ||
          att.name?.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i),
      );

      logger.debug(`hasImageAttachments: ${hasImageAttachments}`);
      const hasImages = hasImageAttachments;

      let selectedModel: string;
      let config: ApiConfiguration;
      let usingDefaultKey = true;

      if (isDM) {
        const {
          model: userCustomModel,
          apiKey: userApiKey,
          apiUrl: userApiUrl,
        } = await getUserCredentials(message.author.id);

        selectedModel = hasImages
          ? 'google/gemma-3-4b-it'
          : userCustomModel || 'moonshotai/kimi-k2';

        config = getApiConfiguration(userApiKey ?? null, selectedModel, userApiUrl ?? null);
        usingDefaultKey = config.usingDefaultKey;
      } else {
        selectedModel = hasImages ? 'google/gemma-3-4b-it' : 'google/gemini-2.5-flash-lite';

        config = getApiConfiguration(null, selectedModel, null);
        if (config.usingDefaultKey && !config.finalApiKey) {
          await message.reply({
            content:
              '❌ AI is not configured. Please set OPENROUTER_API_KEY on the bot, or use `/ai` with your own API key.',
            allowedMentions: { parse: ['users'] as const },
          });
          return;
        }
      }

      logger.info(
        `Using model: ${selectedModel} for message with images: ${hasImages}${
          isDM && !usingDefaultKey ? ' (user custom model)' : ' (default model)'
        }`,
      );

      const systemPrompt = buildSystemPrompt(
        usingDefaultKey,
        this.client,
        selectedModel,
        message.author.username,
        undefined,
        !isDM,
        !isDM ? message.guild?.name : undefined,
      );

      let messageContent:
        | string
        | Array<{
            type: 'text' | 'image_url';
            text?: string;
            image_url?: {
              url: string;
              detail?: 'low' | 'high' | 'auto';
            };
          }> = isDM ? message.content : message.content.replace(/<@!?\d+>/g, '').trim();

      if (hasImages) {
        const imageAttachments = message.attachments.filter(
          (att) =>
            att.contentType?.startsWith('image/') ||
            att.name?.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i),
        );

        const contentArray: Array<{
          type: 'text' | 'image_url';
          text?: string;
          image_url?: {
            url: string;
            detail?: 'low' | 'high' | 'auto';
          };
        }> = [];

        const cleanContent = isDM
          ? message.content
          : message.content.replace(/<@!?\d+>/g, '').trim();
        if (cleanContent.trim()) {
          contentArray.push({
            type: 'text',
            text: cleanContent,
          });
        }

        imageAttachments.forEach((att) => {
          contentArray.push({
            type: 'image_url',
            image_url: {
              url: att.url,
              detail: 'auto',
            },
          });
        });

        messageContent = contentArray;
      }

      let conversation: ConversationMessage[] = [];

      if (isDM) {
        const conversationKey = getUserConversationKey(message.author.id);
        conversation = userConversations.get(conversationKey) || [];
      } else {
        const serverKey = getServerConversationKey(message.guildId!);
        const serverConversation = serverConversations.get(serverKey) || [];
        const recentMessages = serverMessageContext.get(serverKey) || [];

        const contextMessages = recentMessages.slice(-6, -1).map((msg) => ({
          role: 'user' as const,
          content: `**${msg.username}**: ${msg.content}`,
          username: msg.username,
        }));

        const aiHistory = serverConversation.slice(-3);

        const formattedAiHistory = aiHistory.map((msg) => {
          if (msg.role === 'user' && msg.username) {
            const content = Array.isArray(msg.content)
              ? msg.content.map((c) => (c.type === 'text' ? c.text : '[Image]')).join(' ')
              : msg.content;
            return {
              ...msg,
              content: `**${msg.username}**: ${content}`,
            };
          }
          return msg;
        });

        conversation = [...contextMessages, ...formattedAiHistory];
      }

      let filteredConversation = conversation;
      if (selectedModel === 'moonshotai/kimi-k2') {
        filteredConversation = conversation.map((msg) => {
          if (Array.isArray(msg.content)) {
            const textContent = msg.content
              .filter((item) => item.type === 'text')
              .map((item) => item.text)
              .join(' ');
            return { ...msg, content: textContent || '[Image content]' };
          }
          return msg;
        });
      }

      const updatedConversation = buildConversation(
        filteredConversation,
        messageContent,
        systemPrompt,
      );

      if (config.usingDefaultKey) {
        const exemptUserId = process.env.AI_EXEMPT_USER_ID;
        const actorId = message.author.id;

        if (actorId !== exemptUserId) {
          if (isDM) {
            const allowed = await incrementAndCheckDailyLimit(actorId, 10);
            if (!allowed) {
              await message.reply(
                "❌ You've reached your daily limit of AI requests. Please try again tomorrow or set up your own API key using the `/ai` command.",
              );
              return;
            }
          } else {
            let serverLimit = 30;
            try {
              const memberCount = message.guild?.memberCount || 0;
              if (memberCount >= 1000) {
                serverLimit = 500;
              } else if (memberCount >= 100) {
                serverLimit = 150;
              }

              const serverAllowed = await incrementAndCheckServerDailyLimit(
                message.guildId!,
                serverLimit,
              );
              if (!serverAllowed) {
                await message.reply(
                  `❌ This server has reached its daily limit of ${serverLimit} AI requests. Please try again tomorrow.`,
                );
                return;
              }
            } catch (error) {
              logger.error('Error checking server member count:', error);
              const serverAllowed = await incrementAndCheckServerDailyLimit(message.guildId!, 30);
              if (!serverAllowed) {
                await message.reply(
                  '❌ This server has reached its daily limit of AI requests. Please try again tomorrow.',
                );
                return;
              }
            }
          }
        }
      } else if (!config.finalApiKey) {
        await message.reply('❌ Please set up your API key first using the `/ai` command.');
        return;
      }

      const conversationWithTools = [...updatedConversation];
      const executedResults: Array<{ type: string; payload: Record<string, unknown> }> = [];
      let aiResponse = await makeAIRequest(config, conversationWithTools);

      if (!aiResponse && hasImages) {
        logger.warn(`First attempt failed for ${selectedModel}, retrying once...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        aiResponse = await makeAIRequest(config, conversationWithTools);
      }

      if (!aiResponse && hasImages) {
        logger.warn(`Image model ${selectedModel} failed, falling back to text-only model`);

        let fallbackContent = message.content;
        if (Array.isArray(messageContent)) {
          const textParts = messageContent
            .filter((item) => item.type === 'text')
            .map((item) => item.text)
            .filter((text) => text && text.trim());

          const imageParts = messageContent
            .filter((item) => item.type === 'image_url')
            .map((item) => `[Image: ${item.image_url?.url}]`);

          fallbackContent =
            [...textParts, ...imageParts].join(' ') ||
            `[Message contained images that could not be processed: ${message.content}]`;
        }

        const cleanedConversation = conversation.map((msg) => {
          if (Array.isArray(msg.content)) {
            const textContent = msg.content
              .filter((item) => item.type === 'text')
              .map((item) => item.text)
              .join(' ');
            return { ...msg, content: textContent || '[Image content]' };
          }
          return msg;
        });

        const fallbackModel =
          isDM && !usingDefaultKey
            ? 'moonshotai/kimi-k2'
            : isDM
              ? 'moonshotai/kimi-k2'
              : 'google/gemini-2.5-flash-lite';

        const fallbackConversation = buildConversation(
          cleanedConversation,
          fallbackContent,
          buildSystemPrompt(
            usingDefaultKey,
            this.client,
            fallbackModel,
            message.author.username,
            undefined,
            !isDM,
            !isDM ? message.guild?.name : undefined,
          ),
        );

        const fallbackConfig = isDM ? config : getApiConfiguration(null, fallbackModel, null);
        aiResponse = await makeAIRequest(fallbackConfig, fallbackConversation);

        if (aiResponse) {
          logger.info('Successfully processed message with fallback text-only model');
        }
      }

      const maxIterations = 3;
      let iteration = 0;
      while (aiResponse && iteration < maxIterations) {
        iteration++;
        const extraction = extractMessageToolCalls(aiResponse.content || '');
        const toolCalls: MessageToolCall[] = extraction.toolCalls;

        if (toolCalls.length === 0) {
          aiResponse.content = extraction.cleanContent;
          break;
        }

        conversationWithTools.push({ role: 'assistant', content: aiResponse.content });

        for (const tc of toolCalls) {
          const name = tc.name?.toLowerCase();
          try {
            if (name === 'cat' || name === 'dog') {
              const isCat = name === 'cat';
              const url = isCat
                ? 'https://api.pur.cat/random-cat'
                : 'https://api.erm.dog/random-dog';
              const res = await fetch(url);
              let imageUrl = '';
              try {
                const data = await res.json();
                imageUrl = data?.url || '';
                if (!imageUrl && !isCat) {
                  const res2 = await fetch(url);
                  imageUrl = await res2.text();
                }
              } catch {
                const res2 = await fetch(url);
                imageUrl = await res2.text();
              }
              const payload = imageUrl
                ? { type: name, url: imageUrl }
                : { type: name, error: 'no_image' };
              executedResults.push({ type: name, payload });
              conversationWithTools.push({ role: 'user', content: JSON.stringify(payload) });
            } else if (name === 'weather') {
              const raw = (tc.args?.location as string) || (tc.args?.query as string) || '';
              const location = typeof raw === 'string' ? raw.trim() : '';
              const apiKey = process.env.OPENWEATHER_API_KEY;
              let payload: Record<string, unknown> = { type: 'weather', location };
              if (location && apiKey) {
                try {
                  const resp = await fetch(
                    `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=imperial`,
                  );
                  if (resp.ok) {
                    const data = await resp.json();
                    payload = {
                      type: 'weather',
                      location: data.name || location,
                      temperature: `${Math.round(data.main?.temp)}°F`,
                      feels_like: `${Math.round(data.main?.feels_like)}°F`,
                      conditions: data.weather?.[0]?.description || 'Unknown',
                      humidity: `${data.main?.humidity}%`,
                      wind_speed: `${Math.round(data.wind?.speed)} mph`,
                      pressure: `${data.main?.pressure} hPa`,
                    };
                  } else {
                    logger.error('[MessageCreate] Weather fetch failed', {
                      status: resp.status,
                      statusText: resp.statusText,
                    });
                    payload = {
                      type: 'weather',
                      location,
                      error: `${resp.status} ${resp.statusText}`,
                    };
                  }
                } catch (e) {
                  logger.error('[MessageCreate] Weather fetch error', {
                    error: (e as Error)?.message,
                  });
                  payload = {
                    type: 'weather',
                    location,
                    error: (e as Error)?.message || 'fetch_failed',
                  };
                }
              } else {
                logger.warn('[MessageCreate] Weather missing params or API key', {
                  locationPresent: !!location,
                  apiKeyPresent: !!apiKey,
                });
                payload = { type: 'weather', location, error: 'missing_params' };
              }
              executedResults.push({ type: 'weather', payload });
              conversationWithTools.push({ role: 'user', content: JSON.stringify(payload) });
            } else if (name === 'wiki') {
              const query = (tc.args?.search as string) || (tc.args?.query as string) || '';
              const q = typeof query === 'string' ? query.trim() : '';
              let payload: Record<string, unknown> = { type: 'wiki' };
              if (q) {
                try {
                  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`;
                  const res = await fetch(url);
                  if (res.ok) {
                    const data = await res.json();
                    payload = {
                      type: 'wiki',
                      title: data.title || q,
                      extract: data.extract || '',
                      url:
                        data.content_urls?.desktop?.page ||
                        `https://en.wikipedia.org/wiki/${encodeURIComponent(q)}`,
                    };
                  } else {
                    payload = { type: 'wiki', error: `${res.status} ${res.statusText}` };
                  }
                } catch (e) {
                  payload = { type: 'wiki', error: (e as Error)?.message || 'fetch_failed' };
                }
              }
              executedResults.push({ type: 'wiki', payload });
              conversationWithTools.push({ role: 'user', content: JSON.stringify(payload) });
            } else if (name === 'reaction') {
              const emoji = (tc.args?.emoji as string) || '';
              const payload = { type: 'reaction', emoji, deferred: true };
              executedResults.push({ type: 'reaction', payload });
              conversationWithTools.push({ role: 'user', content: JSON.stringify(payload) });

              try {
                await executeMessageToolCall(tc, message, this.client, {
                  originalMessage: message,
                  botMessage: undefined,
                });
              } catch (error) {
                logger.error('[MessageCreate] Iterative loop - reaction execution failed:', error);
              }
            }
          } catch (e) {
            conversationWithTools.push({ role: 'user', content: `[Tool ${tc.name} error]` });
            logger.error('[MessageCreate] Tool execution threw exception', {
              name: tc.name,
              error: (e as Error)?.message,
            });
          }
        }

        aiResponse = await makeAIRequest(config, conversationWithTools);
        if (!aiResponse) break;
      }

      if (!aiResponse) {
        await message.reply({
          content: 'Sorry, I encountered an error processing your message. Please try again later.',
          allowedMentions: { parse: ['users'] as const },
        });
        return;
      }

      if (!aiResponse.content || !aiResponse.content.trim()) {
        const last = executedResults[executedResults.length - 1];
        if (last) {
          if (
            (last.type === 'cat' || last.type === 'dog') &&
            typeof last.payload.url === 'string'
          ) {
            aiResponse.content = `Here you go ${last.type === 'cat' ? '🐱' : '🐶'}: ${last.payload.url}`;
          } else if (last.type === 'weather') {
            const p = last.payload as Record<string, string>;
            if (p.location && p.temperature) {
              aiResponse.content = `Weather for ${p.location}: ${p.temperature} (feels ${p.feels_like}), ${p.conditions}. Humidity ${p.humidity}, Wind ${p.wind_speed}, Pressure ${p.pressure}.`;
            } else if (p.description) {
              aiResponse.content = `Weather in ${p.location || 'the requested area'}: ${p.description}`;
            }
          } else if (last.type === 'wiki') {
            const p = last.payload as Record<string, string>;
            if (p.title || p.extract || p.url) {
              aiResponse.content =
                `${p.title || ''}\n${p.extract || ''}\n${p.url ? `<${p.url}>` : ''}`.trim();
            }
          }
        }

        if (!aiResponse.content || !aiResponse.content.trim()) {
          aiResponse.content = '\u200b';
        }
      }

      aiResponse.content = processUrls(aiResponse.content);
      aiResponse.content = aiResponse.content.replace(/@(everyone|here)/gi, '@\u200b$1');

      const originalContent = aiResponse.content || '';
      const extraction = extractMessageToolCalls(originalContent);
      aiResponse.content = extraction.cleanContent;
      const toolCalls: MessageToolCall[] = extraction.toolCalls;
      const hasReactionTool = toolCalls.some((tc) => tc?.name?.toLowerCase() === 'reaction');
      const originalCleaned = (extraction.cleanContent || '').trim();

      if (!originalCleaned && hasReactionTool) {
        for (const tc of toolCalls) {
          if (!tc || !tc.name) continue;
          const name = tc.name.toLowerCase();
          if (name !== 'reaction') continue;
          try {
            await executeMessageToolCall(tc, message, this.client, {
              originalMessage: message,
              botMessage: undefined,
            });
          } catch (err) {
            logger.error('Error executing reaction tool on original message:', err);
          }
        }
        return;
      }

      const { getUnallowedWordCategory } = await import('@/utils/validation');
      const category = getUnallowedWordCategory(aiResponse.content);
      if (category) {
        logger.warn(`AI response contained unallowed words in category: ${category}`);
        await message.reply({
          content:
            'Sorry, I cannot provide that response as it contains prohibited content. Please try a different prompt.',
          allowedMentions: { parse: ['users'] as const },
        });
        return;
      }

      const cleaned = (aiResponse.content || '').trim();
      const onlyReactions = !cleaned && hasReactionTool;
      if (onlyReactions) {
        const toolCallRegex = /{([^{}\s:]+):({[^{}]*}|[^{}]*)?}/g;
        const fallback = originalContent.replace(toolCallRegex, '').trim();
        if (fallback) {
          aiResponse.content = fallback;
        } else {
          const textParts: string[] = [];
          for (const tc of toolCalls) {
            if (!tc || !tc.args) continue;
            const a = tc.args as Record<string, unknown>;
            const candidates = ['text', 'query', 'content', 'body', 'message'];
            for (const k of candidates) {
              const v = a[k] as unknown;
              if (typeof v === 'string' && v.trim()) {
                textParts.push(v.trim());
                break;
              }
            }
          }
          if (textParts.length) {
            aiResponse.content = textParts.join(' ');
          } else {
            const reactionLabels: string[] = [];
            for (const tc of toolCalls) {
              if (!tc || !tc.name) continue;
              if (tc.name.toLowerCase() !== 'reaction') continue;
              const a = tc.args as Record<string, unknown>;
              const emojiCandidate =
                (a.emoji as string) || (a.query as string) || (a['emojiRaw'] as string) || '';
              if (typeof emojiCandidate === 'string' && emojiCandidate.trim()) {
                reactionLabels.push(emojiCandidate.trim());
              }
            }
            if (reactionLabels.length) {
              aiResponse.content = `Reacted with ${reactionLabels.join(', ')}`;
            } else {
              aiResponse.content = 'Reacted.';
            }
          }
        }
      }

      const sent = await this.sendResponse(message, aiResponse);
      const sentMessage: Message | undefined = sent as Message | undefined;

      if (extraction.toolCalls.length > 0) {
        const target = sentMessage || message;
        const executed: Array<{ name: string; success: boolean }> = [];
        for (const tc of extraction.toolCalls) {
          if (!tc || !tc.name) continue;
          const name = tc.name.toLowerCase();
          if (name === 'reaction') {
            try {
              const result = await executeMessageToolCall(tc, target, this.client, {
                originalMessage: message,
                botMessage: sentMessage,
              });
              executed.push({ name, success: !!result?.success });
            } catch (err) {
              logger.error('Error executing message tool:', { name, err });
              executed.push({ name, success: false });
            }
          } else if (name === 'cat' || name === 'dog') {
            try {
              const isCat = name === 'cat';
              const url = isCat
                ? 'https://api.pur.cat/random-cat'
                : 'https://api.erm.dog/random-dog';
              const res = await fetch(url);
              if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
              let imageUrl = '';
              try {
                const data = await res.json();
                imageUrl = data?.url || '';
                if (!imageUrl && !isCat) {
                  const res2 = await fetch(url);
                  imageUrl = await res2.text();
                }
              } catch {
                const res2 = await fetch(url);
                imageUrl = await res2.text();
              }
              if (imageUrl && imageUrl.startsWith('http')) {
                await target.reply({ content: '', files: [imageUrl] });
                executed.push({ name, success: true });
              } else {
                executed.push({ name, success: false });
              }
            } catch (err) {
              logger.error('Error executing image tool:', { name, err });
              executed.push({ name, success: false });
            }
          } else if (name === 'weather') {
            try {
              const raw = (tc.args?.location as string) || (tc.args?.query as string) || '';
              const location = typeof raw === 'string' ? raw.trim() : '';
              if (!location) {
                executed.push({ name, success: false });
              } else {
                const apiKey = process.env.OPENWEATHER_API_KEY;
                if (!apiKey) {
                  executed.push({ name, success: false });
                } else {
                  const resp = await fetch(
                    `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
                      location,
                    )}&appid=${apiKey}&units=imperial`,
                  );
                  if (!resp.ok) {
                    executed.push({ name, success: false });
                  } else {
                    const data = await resp.json();
                    const temp = Math.round(data.main?.temp);
                    const feels = Math.round(data.main?.feels_like);
                    const cond = data.weather?.[0]?.description || 'Unknown';
                    const hum = data.main?.humidity;
                    const wind = Math.round(data.wind?.speed);
                    const pres = data.main?.pressure;
                    await target.reply(
                      `Weather for ${data.name || location}: ${temp}°F (feels ${feels}°F), ${cond}. Humidity ${hum}%, Wind ${wind} mph, Pressure ${pres} hPa.`,
                    );
                    executed.push({ name, success: true });
                  }
                }
              }
            } catch (err) {
              logger.error('Error executing weather tool:', { err });
              executed.push({ name, success: false });
            }
          } else if (name === 'wiki') {
            try {
              const query = (tc.args?.search as string) || (tc.args?.query as string) || '';
              const q = typeof query === 'string' ? query.trim() : '';
              if (!q) {
                executed.push({ name, success: false });
              } else {
                const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`;
                const res = await fetch(url);
                if (!res.ok) {
                  executed.push({ name, success: false });
                } else {
                  const data = await res.json();
                  const title = data.title || q;
                  const extract = data.extract || 'No summary available.';
                  const pageUrl =
                    data.content_urls?.desktop?.page ||
                    `https://en.wikipedia.org/wiki/${encodeURIComponent(q)}`;
                  await target.reply(`${title}\n${extract}\n<${pageUrl}>`);
                  executed.push({ name, success: true });
                }
              }
            } catch (err) {
              logger.error('Error executing wiki tool:', { err });
              executed.push({ name, success: false });
            }
          }
        }

        if (onlyReactions) {
          const anyFailed = executed.some((e) => e.name === 'reaction' && !e.success);
          if (anyFailed && sentMessage) {
            try {
              await sentMessage.edit(
                'I tried to react, but I do not have permission to add reactions here or the emoji was invalid.',
              );
            } catch (e) {
              logger.error('Failed to edit placeholder message after reaction failure:', e);
            }
          }
        }
      }

      const userMessage: ConversationMessage = {
        role: 'user',
        content: messageContent,
        username: message.author.username,
      };
      const assistantMessage: ConversationMessage = {
        role: 'assistant',
        content: aiResponse.content,
      };

      if (isDM) {
        const conversationKey = getUserConversationKey(message.author.id);
        const newConversation = [...filteredConversation, userMessage, assistantMessage];
        userConversations.set(conversationKey, newConversation);
      } else {
        const serverKey = getServerConversationKey(message.guildId!);
        const serverConversation = serverConversations.get(serverKey) || [];
        const newServerConversation = [...serverConversation, userMessage, assistantMessage];
        serverConversations.set(serverKey, newServerConversation);
      }

      logger.info(`${isDM ? 'DM' : 'Server'} response sent successfully`);
    } catch (error) {
      const err = error as Error;
      logger.error(`Error processing ${isDM ? 'DM' : 'server message'}:`, {
        message: err?.message,
        stack: err?.stack,
        raw: error,
      });
      try {
        await message.reply(
          'Sorry, I encountered an error processing your message. Please try again later.',
        );
      } catch (replyError) {
        logger.error('Failed to send error message:', replyError);
      }
    }
  }

  private async sendResponse(message: Message, aiResponse: AIResponse): Promise<Message | void> {
    let fullResponse = '';

    if (aiResponse.reasoning) {
      fullResponse += `> ${aiResponse.reasoning}\n\n`;
    }

    fullResponse += aiResponse.content;

    if (!fullResponse || !fullResponse.trim()) {
      fullResponse = '\u200b';
    }

    const maxLength = 2000;
    if (fullResponse.length <= maxLength) {
      const sent = await message.reply({
        content: fullResponse,
        allowedMentions: { parse: ['users'] as const },
      });
      return sent;
    }
    const chunks = splitResponseIntoChunks(fullResponse, maxLength);

    const first = await message.reply({
      content: chunks[0],
      allowedMentions: { parse: ['users'] as const },
    });

    for (let i = 1; i < chunks.length; i++) {
      if ('send' in message.channel) {
        await message.channel.send({
          content: chunks[i],
          allowedMentions: { parse: ['users'] as const },
        });
      }
    }
    return first;
  }
}
