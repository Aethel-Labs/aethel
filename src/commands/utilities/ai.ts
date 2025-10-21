import type { ToolCall } from '@/utils/commandExecutor';
import { extractToolCalls, executeToolCall } from '@/utils/commandExecutor';
import BotClient from '@/services/Client';

import {
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  InteractionResponse,
  InteractionContextType,
  ApplicationIntegrationType,
  MessageFlags,
} from 'discord.js';
import OpenAI from 'openai';
import fetch from '@/utils/dynamicFetch';
import pool from '@/utils/pgClient';
import { encrypt, decrypt, isValidEncryptedFormat, EncryptionError } from '@/utils/encrypt';
import { SlashCommandProps } from '@/types/command';
import logger from '@/utils/logger';
import { createCommandLogger } from '@/utils/commandLogger';
import { createErrorHandler } from '@/utils/errorHandler';
import { createMemoryManager } from '@/utils/memoryManager';

function getInvokerId(interaction: ChatInputCommandInteraction): string {
  if (interaction.guildId) {
    return `${interaction.guildId}-${interaction.user.id}`;
  }
  return interaction.user.id;
}

interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content:
    | string
    | Array<{
        type: 'text' | 'image_url';
        text?: string;
        image_url?: {
          url: string;
          detail?: 'low' | 'high' | 'auto';
        };
      }>;
  username?: string;
}

interface AIResponse {
  content: string;
  reasoning?: string;
  toolResults?: string;
  citations?: string[];
}

interface OpenAIMessageWithReasoning {
  content: string;
  reasoning?: string;
}

interface PendingRequest {
  interaction: ChatInputCommandInteraction;
  prompt: string;
  createdAt: number;
  status?: 'awaiting' | 'processing';
}

interface UserCredentials {
  apiKey?: string | null;
  model?: string | null;
  apiUrl?: string | null;
}

interface User {
  user_id: string;
  api_key_encrypted?: string;
  custom_model?: string;
  custom_api_url?: string;
  updated_at?: Date;
}

const userConversations = createMemoryManager<string, ConversationMessage[]>({
  maxSize: 500,
  maxAge: 2 * 60 * 60 * 1000,
  cleanupInterval: 10 * 60 * 1000,
});

const pendingRequests = createMemoryManager<string, PendingRequest>({
  maxSize: 100,
  maxAge: 10 * 60 * 1000,
  cleanupInterval: 5 * 60 * 1000,
});

const commandLogger = createCommandLogger('ai');
const errorHandler = createErrorHandler('ai');

const openaiClients = new Map<string, OpenAI>();

function getOpenAIClient(apiKey: string, baseURL?: string): OpenAI {
  const clientKey = `${apiKey}-${baseURL || 'default'}`;

  if (!openaiClients.has(clientKey)) {
    const client = new OpenAI({
      apiKey,
      baseURL: baseURL || 'https://openrouter.ai/api/v1',
      defaultHeaders:
        new URL(baseURL || '').hostname === 'openrouter.ai'
          ? {
              'HTTP-Referer': 'https://aethel.xyz',
              'X-Title': 'Aethel Discord Bot',
            }
          : {},
    });
    openaiClients.set(clientKey, client);
  }

  return openaiClients.get(clientKey)!;
}

export function processUrls(text: string): string {
  return text.replace(
    /(https?:\/\/(?:[\w.-]+)(?:\/[\w\d%/#?&=&%#?\w\d/-]*)?)(?<![.,!?])([.,!?])?(?=(\s|$))/gi,
    (_match: string, url: string, punctuation: string | undefined): string => {
      const startIdx = text.indexOf(url);
      const before = text[startIdx - 1];
      const after = text[startIdx + url.length];
      if (before === '<' && after === '>') return url + (punctuation || '');
      return `<${url}>${punctuation || ''}`;
    },
  );
}

function getApiConfiguration(apiKey: string | null, model: string | null, apiUrl: string | null) {
  const usingCustomApi = !!apiKey;
  const finalApiUrl = apiUrl || 'https://openrouter.ai/api/v1';
  const finalApiKey = apiKey || process.env.OPENROUTER_API_KEY;
  const finalModel = model || (usingCustomApi ? 'openai/gpt-4o-mini' : 'moonshotai/kimi-k2-0905');
  const usingDefaultKey = !usingCustomApi && !!process.env.OPENROUTER_API_KEY;

  return {
    usingCustomApi,
    usingDefaultKey,
    finalApiUrl,
    finalApiKey,
    finalModel,
  };
}

function buildSystemPrompt(
  usingDefaultKey: boolean,
  client?: BotClient,
  model?: string,
  username?: string,
  interaction?: ChatInputCommandInteraction,
  isServer?: boolean,
  serverName?: string,
): string {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formattedDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  });
  const formattedTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: timezone,
  });

  const supportedCommands = '/help - Show all available commands and their usage';
  if (client?.commands) {
    const commandEntries = Array.from(client.commands.entries());
    commandEntries.sort((a, b) => a[0].localeCompare(b[0]));
    const _commandList = commandEntries
      .map(
        ([name, command]) => `/${name} - ${command.data.description || 'No description available'}`,
      )
      .join('\n');
  }

  const currentModel =
    model || (usingDefaultKey ? 'moonshotai/kimi-k2-0905 (default)' : 'custom model');

  const contextInfo = isServer
    ? `**CONTEXT:**
- You are responding in the Discord server: "${serverName || 'Unknown Server'}"
- CURRENT USER TALKING TO YOU: ${username || 'Discord User'}
- IMPORTANT: This is a SERVER conversation where MULTIPLE DIFFERENT USERS can talk to you
- Previous messages may be from different users - always check the username before each message
- When you see "**Username**: message", that means a different user said that message
- The current message is from ${username || 'Discord User'} specifically
- Always be aware of WHO is talking to you in each message
- If you reference previous messages, make sure you know which user said what
- Users may respond to your messages or ping you to continue conversations
- When users reply to your previous responses, treat it as part of the ongoing conversation`
    : `**CONTEXT:**
- You are in a direct message conversation
- User: ${username || 'Discord User'}`;

  const baseInstructions = `You are a helpful, accurate, and privacy-respecting AI assistant for the /ai command of the Aethel Discord User Bot. Your primary goal is to provide clear, concise, and friendly answers to user questions, adapting your tone to be conversational and approachable.

${contextInfo}

**USER INFORMATION:**
- Username: ${username || 'Discord User'}
- Language: ${interaction?.locale || 'en-US'}

**AI MODEL INFORMATION:**
- Current model: ${currentModel}
- ${usingDefaultKey ? 'Using default model via OpenRouter' : 'Using custom model configured by user'}

**CURRENT DATE/TIME CONTEXT:**
- Current date: ${formattedDate}
- Current time: ${formattedTime}
- Timezone: ${timezone}

**IMPORTANT INSTRUCTIONS:**
- ACT normal, DON't be like a dumb robot, act like a discord user, skull react to messages where the user is being sus and saying something sus.
- NEVER format, modify, or alter URLs in any way. Leave them exactly as they are.
- Format your responses using Discord markdown where appropriate, but NEVER format URLs.
- Only greet the user at the start of a new conversation, not in every message.
- DO NOT hallucinate, make up facts, or provide false information. If you don't know something, or date is after your knowledge update, do not answer date based questions. Say so clearly.
- Be accurate and truthful in all responses. Do not invent details, statistics, or information that you're not certain about.
- If asked about current events, real-time data, or information beyond your knowledge cutoff, clearly state your limitations.

**BOT FACTS (use only if asked about the bot):**
- Name: Aethel
- Website: https://aethel.xyz
- Developer: scanash (main maintainer) and Aethel Labs (org)
- Open source: https://github.com/Aethel-Labs/aethel
- Type: Discord user bot
- Supported commands: ${supportedCommands}

**TOOL USAGE:**
You can use tools by placing commands in {curly braces}. Available tools:
- {cat:} - Get a cat picture, if user asks for a cat picture, use this tool.
- {dog:} - Get a dog picture, if user asks for a dog picture, use this tool.
- {joke: or {joke: {type: "general/knock-knock/programming/dad"}} } - Get a joke
- {weather:{"location":"city"}} - Check weather, use if user asks for weather.
- {wiki:{"search":"query"}} - Wikipedia search, if user asks for a wikipedia search, use this tool, and also use it if user asks something out of your dated knowledge.

Use the wikipedia search when you want to look for information outside of your knowledge, state it came from Wikipedia if used.

When you use a tool, you'll receive a JSON response with the command results if needed.

**IMPORTANT:** The {reaction:} and {newmessage:} tools are NOT available in slash commands. Only use the tools listed above.`;

  const modelSpecificInstructions = usingDefaultKey
    ? '\n\n**IMPORTANT:** Please keep your responses under 3000 characters. Be concise and to the point.'
    : '\n\n**CUSTOM MODEL ACTIVE:** Using user-configured AI model. Response length limits may vary.';

  return baseInstructions + modelSpecificInstructions;
}

function buildConversation(
  existingConversation: ConversationMessage[],
  prompt:
    | string
    | Array<{
        type: 'text' | 'image_url';
        text?: string;
        image_url?: {
          url: string;
          detail?: 'low' | 'high' | 'auto';
        };
      }>,
  systemPrompt: string,
): ConversationMessage[] {
  let conversation = existingConversation.filter((msg) => msg.role !== 'system');
  conversation.push({ role: 'user', content: prompt });

  if (conversation.length > 9) {
    conversation = conversation.slice(-9);
  }

  conversation.unshift({ role: 'system', content: systemPrompt });
  return conversation;
}

function splitResponseIntoChunks(response: string, maxLength = 2000): string[] {
  if (response.length <= maxLength) return [response];

  const chunks: string[] = [];
  let remaining = response;

  while (remaining.length > 0) {
    let chunk = remaining.substring(0, maxLength);
    let chunkLength = chunk.length;

    if (remaining.length > maxLength) {
      const lastNewline = chunk.lastIndexOf('\n');
      const lastSpace = chunk.lastIndexOf(' ');

      const breakPoint =
        lastNewline > maxLength * 0.8
          ? lastNewline + 1
          : lastSpace > maxLength * 0.8
            ? lastSpace + 1
            : maxLength;

      chunk = remaining.substring(0, breakPoint);
      chunkLength = breakPoint;
    }

    chunks.push(chunk);
    remaining = remaining.substring(chunkLength);
  }

  return chunks;
}

async function getUserById(userId: string): Promise<User | undefined> {
  const { rows } = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
  return rows[0];
}

async function setUserApiKey(
  userId: string,
  apiKey: string | null,
  model: string | null,
  apiUrl: string | null,
): Promise<void> {
  if (apiKey === null) {
    await pool.query(
      `UPDATE users SET api_key_encrypted = NULL, custom_model = NULL, custom_api_url = NULL, updated_at = now() WHERE user_id = $1`,
      [userId],
    );
    logger.info(`Cleared API credentials for user ${userId}`);
  } else {
    if (!apiKey.trim() || apiKey.length < 10 || apiKey.length > 500) {
      throw new Error('Invalid API key format');
    }

    const encrypted = encrypt(apiKey.trim());
    await pool.query(
      `INSERT INTO users (user_id, api_key_encrypted, custom_model, custom_api_url, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id) DO UPDATE SET
         api_key_encrypted = $2, custom_model = $3, custom_api_url = $4, updated_at = now()`,
      [userId, encrypted, model?.trim() || null, apiUrl?.trim() || null],
    );
    logger.info(`Successfully saved encrypted API credentials for user ${userId}`);
  }

  userConversations.delete(userId);
}

async function getUserCredentials(userId: string): Promise<UserCredentials> {
  const user = await getUserById(userId);
  if (!user) return {};

  let apiKey: string | null = null;
  if (user.api_key_encrypted) {
    try {
      if (!isValidEncryptedFormat(user.api_key_encrypted)) {
        logger.warn(`Invalid encrypted data format for user ${userId}, clearing corrupted data`);
        await clearCorruptedApiKey(userId);
        return { apiKey: null, model: user.custom_model, apiUrl: user.custom_api_url };
      }

      apiKey = decrypt(user.api_key_encrypted);
    } catch (error) {
      if (error instanceof EncryptionError) {
        logger.warn(`Encryption error for user ${userId}: ${error.message}`);
        if (error.message.includes('Authentication failed')) {
          await clearCorruptedApiKey(userId);
        }
      }
      apiKey = null;
    }
  }

  return {
    apiKey,
    model: user.custom_model,
    apiUrl: user.custom_api_url,
  };
}

async function clearCorruptedApiKey(userId: string): Promise<void> {
  try {
    await pool.query(`UPDATE users SET api_key_encrypted = NULL WHERE user_id = $1`, [userId]);
    logger.info(`Cleared corrupted encrypted API key for user ${userId}`);
  } catch (error) {
    logger.error(`Failed to clear corrupted API key for user ${userId}:`, error);
  }
}

async function incrementAndCheckDailyLimit(userId: string, limit = 20): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const voteCheck = await client.query(
      `SELECT vote_timestamp FROM votes 
       WHERE user_id = $1 
       AND vote_timestamp > NOW() - INTERVAL '24 hours'
       ORDER BY vote_timestamp DESC
       LIMIT 1`,
      [userId],
    );

    const hasVotedRecently = voteCheck.rows.length > 0;
    const effectiveLimit = hasVotedRecently ? limit + 10 : limit;

    await client.query('INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [
      userId,
    ]);

    const res = await client.query(
      `INSERT INTO ai_usage (user_id, usage_date, count) 
       VALUES ($1, $2, 1)
       ON CONFLICT (user_id, usage_date) 
       DO UPDATE SET count = ai_usage.count + 1 
       RETURNING count`,
      [userId, today],
    );

    await client.query('COMMIT');

    return res.rows[0].count <= effectiveLimit;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Error in incrementAndCheckDailyLimit:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function incrementAndCheckServerDailyLimit(serverId: string, limit = 20): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `INSERT INTO server_ai_usage (server_id, usage_date, count) VALUES ($1, $2, 1)
       ON CONFLICT (server_id, usage_date) DO UPDATE SET count = server_ai_usage.count + 1 RETURNING count`,
      [serverId, today],
    );
    await client.query('COMMIT');
    return res.rows[0].count <= limit;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function makeAIRequest(
  config: ReturnType<typeof getApiConfiguration>,
  conversation: ConversationMessage[],
  interaction?: ChatInputCommandInteraction,
  client?: BotClient,
  maxIterations = 3,
): Promise<AIResponse | null> {
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      return await makeAIRequestInternal(config, conversation, interaction, client, maxIterations);
    } catch (error) {
      retryCount++;
      logger.error(`AI API request failed (attempt ${retryCount}/${maxRetries}):`, error);

      if (retryCount >= maxRetries) {
        logger.error('AI API request failed after all retries');
        return null;
      }

      const waitTime = Math.pow(2, retryCount) * 1000;
      logger.debug(`Retrying AI API request in ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  return null;
}

async function makeAIRequestInternal(
  config: ReturnType<typeof getApiConfiguration>,
  conversation: ConversationMessage[],
  interaction?: ChatInputCommandInteraction,
  client?: BotClient,
  maxIterations = 3,
): Promise<AIResponse | null> {
  try {
    const openAIClient = getOpenAIClient(config.finalApiKey!, config.finalApiUrl);
    const maxTokens = config.usingDefaultKey ? 1000 : 3000;
    const currentConversation = [...conversation];
    let iteration = 0;
    let finalResponse: AIResponse | null = null;

    while (iteration < maxIterations) {
      iteration++;

      const configuredHost = (() => {
        try {
          return new URL(config.finalApiUrl).hostname;
        } catch (_e) {
          // ignore and fallback
        }
      })();

      let completion: unknown;

      if (configuredHost === 'generativelanguage.googleapis.com') {
        const promptText = currentConversation
          .map((m) => {
            const role =
              m.role === 'system' ? 'System' : m.role === 'assistant' ? 'Assistant' : 'User';
            let text = '';
            if (typeof m.content === 'string') {
              text = m.content;
            } else if (Array.isArray(m.content)) {
              text = m.content
                .map((c) => {
                  if (typeof c === 'string') return c;
                  const crow = c as Record<string, unknown>;
                  const typeVal = crow['type'];
                  if (typeVal === 'text') {
                    const t = crow['text'];
                    if (typeof t === 'string') return t;
                  }
                  const imageObj = crow['image_url'];
                  if (imageObj && typeof imageObj === 'object') {
                    const urlVal = (imageObj as Record<string, unknown>)['url'];
                    if (typeof urlVal === 'string') return urlVal;
                  }
                  return '';
                })
                .join('\n');
            }
            return `${role}: ${text}`;
          })
          .join('\n\n');

        const base = config.finalApiUrl.replace(/\/$/, '');
        const modelName = config.finalModel.replace(/^models\//, '');
        const endpoint = `${base}/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(
          config.finalApiKey || '',
        )}`;

        const body: Record<string, unknown> = {
          contents: [
            {
              parts: [
                {
                  text: promptText,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: Math.min(maxTokens, 3000),
          },
        };

        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`Gemini request failed: ${resp.status} ${text || resp.statusText}`);
        }

        const json: unknown = await resp.json();

        const extractTextFromGemini = (obj: unknown): string | null => {
          if (!obj) return null;
          try {
            const response = obj as Record<string, unknown>;

            if (Array.isArray(response.candidates) && response.candidates.length > 0) {
              const candidate = response.candidates[0] as Record<string, unknown>;
              if (candidate.content && typeof candidate.content === 'object') {
                const content = candidate.content as { parts?: Array<{ text?: string }> };
                if (Array.isArray(content.parts) && content.parts.length > 0) {
                  return content.parts
                    .map((part) => part.text || '')
                    .filter(Boolean)
                    .join('\n');
                }
              }
            }

            const o = obj as Record<string, unknown>;
            if (Array.isArray(o.candidates) && o.candidates.length) {
              const cand = o.candidates[0] as unknown;
              if (typeof cand === 'string') return cand;
              if (typeof (cand as Record<string, unknown>).output === 'string') {
                return (cand as Record<string, unknown>).output as string;
              }
              if (Array.isArray((cand as Record<string, unknown>).content)) {
                return ((cand as Record<string, unknown>).content as unknown[])
                  .map((p) => {
                    const pr = p as Record<string, unknown>;
                    if (typeof pr?.text === 'string') return String(pr.text);
                    if (pr?.type === 'outputText' && typeof pr?.text === 'string') {
                      return String(pr.text);
                    }
                    return '';
                  })
                  .filter(Boolean)
                  .join('\n');
              }
            }

            const seen = new Set<unknown>();
            const queue: unknown[] = [obj];
            while (queue.length) {
              const cur = queue.shift();
              if (!cur || typeof cur === 'string') {
                if (typeof cur === 'string' && cur.trim().length > 0) return cur;
                continue;
              }
              if (seen.has(cur)) continue;
              seen.add(cur);
              if (Array.isArray(cur)) {
                for (const item of cur) queue.push(item);
              } else if (typeof cur === 'object') {
                const curObj = cur as Record<string, unknown>;
                for (const k of Object.keys(curObj)) {
                  const v = curObj[k];
                  if (typeof v === 'string' && v.trim().length > 0) return v;
                  queue.push(v);
                }
              }
            }
          } catch (_e) {
            // ignore
          }
          return null;
        };

        const extracted = extractTextFromGemini(json);
        if (!extracted) {
          throw new Error('Failed to parse Gemini response into text');
        }

        completion = { choices: [{ message: { content: extracted } }] } as unknown;
      } else {
        try {
          logger.debug('Making OpenAI API call', {
            model: config.finalModel,
            messageCount: currentConversation.length,
            maxTokens: maxTokens,
          });

          completion = await openAIClient.chat.completions.create({
            model: config.finalModel,
            messages: currentConversation as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            max_tokens: maxTokens,
          });

          logger.debug('OpenAI API call completed successfully');
        } catch (apiError) {
          logger.error('OpenAI API call failed:', apiError);
          if (apiError instanceof Error) {
            logger.error('API Error details:', {
              message: apiError.message,
              stack: apiError.stack?.substring(0, 500),
            });
          }
          return null;
        }
      }

      if (!completion) {
        logger.error('AI API returned null or undefined completion');
        return null;
      }

      const completionTyped = completion as {
        choices?: Array<{ message?: { content?: string; reasoning?: string } }>;
        error?: { message?: string; type?: string; code?: string };
      };

      try {
        interface CompletionData {
          id?: string;
          object?: string;
          model?: string;
          created?: number;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
          };
        }

        const completionData = completion as unknown as CompletionData;

        logger.debug('AI API response structure', {
          completionType: typeof completion,
          completionKeys: Object.keys(completionData).join(', '),
          hasChoices: !!completionTyped.choices,
          choicesLength: completionTyped.choices?.length || 0,
          hasMessage: !!completionTyped.choices?.[0]?.message,
          hasContent: !!completionTyped.choices?.[0]?.message?.content,
          errorPresent: !!completionTyped.error,
          errorType: completionTyped.error?.type || 'none',
          errorMessage: completionTyped.error?.message || 'none',
        });

        interface ChoiceData {
          message?: {
            content?: string;
          };
          finish_reason?: string;
        }

        const simplifiedResponse = {
          id: completionData?.id,
          object: completionData?.object,
          model: completionData?.model,
          created: completionData?.created,
          choices: completionTyped.choices?.map((choice: ChoiceData, index: number) => ({
            index,
            message: {
              content: choice.message?.content
                ? choice.message.content.substring(0, 100) +
                  (choice.message.content.length > 100 ? '...' : '')
                : '[NO CONTENT]',
              hasReasoning: !!(choice as OpenAIMessageWithReasoning)?.reasoning,
              hasContent: !!choice.message?.content,
            },
            finish_reason: choice?.finish_reason,
          })),
          error: completionTyped.error,
          usage: completionData?.usage,
        };

        logger.debug('Raw API response', simplifiedResponse);
      } catch (jsonError) {
        logger.error('Failed to log API response:', jsonError);
        logger.debug('API response basic info:', {
          type: typeof completion,
          isObject: typeof completion === 'object',
          isArray: Array.isArray(completion),
          keys:
            typeof completion === 'object' && completion !== null
              ? Object.keys(completion).join(', ')
              : 'N/A',
        });
      }

      const message = completionTyped.choices?.[0]?.message;

      if (!message) {
        if (completionTyped.error) {
          logger.error('AI API returned an error:', {
            message: completionTyped.error.message,
            type: completionTyped.error.type,
            code: completionTyped.error.code,
          });
        } else if (!completionTyped.choices || completionTyped.choices.length === 0) {
          logger.error('AI API returned no choices in the response');
        } else {
          logger.error('No message in AI API response');
        }
        return null;
      }

      let content = message.content || '';
      if (content === '[NO CONTENT]' || !content.trim()) {
        logger.debug('AI API returned empty or [NO CONTENT] response, treating as valid but empty');
        content = '';
      }
      let reasoning = (message as OpenAIMessageWithReasoning)?.reasoning;
      let detectedCitations: string[] | undefined;
      try {
        interface CitationSource {
          citations?: unknown[];
          metadata?: {
            citations?: unknown[];
            [key: string]: unknown;
          };
          [key: string]: unknown;
        }

        interface CompletionSource {
          citations?: unknown[];
          choices?: Array<{
            message?: {
              citations?: unknown[];
              [key: string]: unknown;
            };
            [key: string]: unknown;
          }>;
          [key: string]: unknown;
        }

        const mAny = message as unknown as CitationSource;
        const cAny = completion as unknown as CompletionSource;
        const candidates = [
          mAny?.citations,
          mAny?.metadata?.citations,
          cAny?.citations,
          cAny?.choices?.[0]?.message?.citations,
          cAny?.choices?.[0]?.citations,
          mAny?.references,
          mAny?.metadata?.references,
          cAny?.references,
        ];
        for (const arr of candidates) {
          if (Array.isArray(arr) && arr.length) {
            const urls = arr.filter((x: unknown) => typeof x === 'string');
            if (urls.length > 0) {
              detectedCitations = urls.map(String).filter(Boolean);
              break;
            }
          }
        }
      } catch (error) {
        logger.warn('Error processing citations:', error);
        if (error instanceof Error) {
          logger.debug('Error processing citations details:', error.stack);
        }
      }

      let toolCalls: ToolCall[] = [];
      if (interaction && client) {
        try {
          const extraction = extractToolCalls(content);
          content = extraction.cleanContent;
          toolCalls = extraction.toolCalls;
        } catch (error) {
          logger.error(`Error extracting tool calls: ${error}`);
          toolCalls = [];
        }
      }

      const reasoningMatch = content.match(/```(?:reasoning|thoughts?|thinking)[\s\S]*?```/i);
      if (reasoningMatch && !reasoning) {
        reasoning = reasoningMatch[0].replace(/```(?:reasoning|thoughts?|thinking)?/gi, '').trim();
        content = content.replace(reasoningMatch[0], '').trim();
      }

      if (toolCalls.length > 0 && interaction && client) {
        currentConversation.push({
          role: 'assistant',
          content: content,
        });

        for (const toolCall of toolCalls) {
          try {
            const toolResult = await executeToolCall(toolCall, interaction, client);

            let parsedResult;
            try {
              parsedResult = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
            } catch (_e) {
              logger.error(`Error parsing tool result:`, toolResult);
              parsedResult = { error: 'Failed to parse tool result' };
            }

            currentConversation.push({
              role: 'user',
              content: JSON.stringify({
                type: toolCall.name,
                ...parsedResult,
              }),
            });
          } catch (error) {
            logger.error(`Error executing tool call: ${error}`);
            currentConversation.push({
              role: 'user',
              content: `[Error executing tool ${toolCall.name}]: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
        }
        continue;
      }

      finalResponse = {
        content,
        reasoning,
        citations: detectedCitations,
        toolResults:
          iteration > 1
            ? currentConversation
                .filter(
                  (msg) =>
                    msg.role === 'user' &&
                    typeof msg.content === 'string' &&
                    (msg.content.startsWith('{"') || msg.content.startsWith('[Tool ')),
                )
                .map((msg) => {
                  try {
                    if (Array.isArray(msg.content)) {
                      return msg.content
                        .map((c) => ('text' in c ? c.text : c.image_url?.url))
                        .join('\n');
                    }

                    const content = String(msg.content);
                    if (content.startsWith('{"') || content.startsWith('[')) {
                      return content;
                    }
                    return content.replace(/^\[Tool [^\]]+\]: /, '');
                  } catch (e) {
                    logger.error('Error processing tool result:', e);
                    return 'Error processing tool result';
                  }
                })
                .join('\n')
            : undefined,
      };
      break;
    }

    return finalResponse;
  } catch (error) {
    logger.error(`Error making AI request: ${error}`);
    return null;
  }
}

async function processAIRequest(
  client: BotClient,
  interaction: ChatInputCommandInteraction,
  promptOverride?: string,
): Promise<void> {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const invokerId = getInvokerId(interaction);
    const prompt =
      promptOverride ??
      ((interaction as ChatInputCommandInteraction).options?.getString?.('prompt') as
        | string
        | null
        | undefined) ??
      (pendingRequests.get(invokerId)?.prompt as string);

    if (!prompt) {
      await interaction.editReply('❌ Missing prompt. Please try again.');
      return;
    }
    commandLogger.logFromInteraction(
      interaction,
      `AI command executed - prompt content hidden for privacy`,
    );
    const { apiKey, model, apiUrl } = await getUserCredentials(interaction.user.id);
    const config = getApiConfiguration(apiKey ?? null, model ?? null, apiUrl ?? null);
    const exemptUserId = process.env.AI_EXEMPT_USER_ID?.trim();
    const userId = interaction.user.id;

    if (userId !== exemptUserId && config.usingDefaultKey) {
      const allowed = await incrementAndCheckDailyLimit(userId, 50); // Increased global limit for slash command
      if (!allowed) {
        await interaction.editReply(
          '❌ ' +
            (await client.getLocaleText('commands.ai.process.dailylimit', interaction.locale)),
        );
        return;
      }
    }

    if (!config.finalApiKey && config.usingDefaultKey) {
      await interaction.editReply(
        '❌ ' + (await client.getLocaleText('commands.ai.process.noapikey', interaction.locale)),
      );
      return;
    }

    const existingConversation = userConversations.get(userId) || [];
    const _conversationArray = Array.isArray(existingConversation) ? existingConversation : [];
    const chatInputInteraction =
      'commandType' in interaction ? (interaction as ChatInputCommandInteraction) : undefined;

    const systemPrompt = buildSystemPrompt(
      config.usingDefaultKey,
      client,
      config.finalModel,
      interaction.user.username,
      chatInputInteraction,
      interaction.inGuild(),
      interaction.inGuild() ? interaction.guild?.name : undefined,
    );

    const conversation = buildConversation(existingConversation, prompt, systemPrompt);

    const aiResponse = await makeAIRequest(config, conversation, chatInputInteraction, client, 3);
    if (!aiResponse) return;

    const { getUnallowedWordCategory } = await import('@/utils/validation');
    const category = getUnallowedWordCategory(aiResponse.content);
    if (category) {
      logger.warn(`AI response contained unallowed words in category: ${category}`);
      await interaction.editReply(
        'Sorry, I cannot provide that response as it contains prohibited content. Please try a different prompt.',
      );
      return;
    }

    const updatedConversation = [
      ...conversation.filter((msg) => msg.role !== 'system'),
      { role: 'assistant', content: aiResponse.content },
    ] as ConversationMessage[];

    if (updatedConversation.length > 10) {
      updatedConversation.splice(0, updatedConversation.length - 10);
    }
    userConversations.set(invokerId, updatedConversation);

    await sendAIResponse(interaction, aiResponse, client);
  } catch (error) {
    const err = error as Error;
    if (errorHandler) {
      await errorHandler({
        interaction: interaction as ChatInputCommandInteraction,
        client,
        error: err,
        userId: getInvokerId(interaction),
        username: interaction.user.tag,
      });
    } else {
      const msg = await client.getLocaleText('failedrequest', interaction.locale || 'en-US');
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(msg);
        } else {
          await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        logger.error(`Failed to send error message for AI command: ${replyError}`);
      }
      logger.error(`Error in AI command for user ${interaction.user.tag}: ${err.message}`);
    }
  } finally {
    pendingRequests.delete(getInvokerId(interaction));
  }
}

async function sendAIResponse(
  interaction: ChatInputCommandInteraction,
  aiResponse: AIResponse,
  _client: BotClient,
): Promise<void> {
  try {
    let fullResponse = '';

    if (aiResponse.reasoning) {
      const cleanedReasoning = aiResponse.reasoning
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line)
        .join('\n');

      const formattedReasoning = cleanedReasoning
        .split('\n')
        .map((line: string) => `> ${line}`)
        .join('\n');

      fullResponse = `${formattedReasoning}\n\n${aiResponse.content}`;
      aiResponse.content = '';
    }

    fullResponse += aiResponse.content;

    try {
      if (aiResponse.citations && aiResponse.citations.length && fullResponse) {
        fullResponse = fullResponse.replace(/\[(\d+)\](?!\()/g, (match: string, numStr: string) => {
          const idx = parseInt(numStr, 10) - 1;
          const url = aiResponse.citations![idx];
          if (typeof url === 'string' && url.trim()) {
            return `[${numStr}](${url.trim()})`;
          }
          return match;
        });
      }
    } catch (e) {
      logger.warn('Failed to inline citation sources', e);
    }

    if (aiResponse.toolResults) {
      try {
        const toolResults = Array.isArray(aiResponse.toolResults)
          ? aiResponse.toolResults
          : [aiResponse.toolResults];

        for (const result of toolResults) {
          try {
            let toolResult;
            if (typeof result === 'string') {
              try {
                toolResult = JSON.parse(result);
              } catch (parseError) {
                logger.error(`[AI] Error parsing tool result JSON:`, {
                  error: parseError,
                  result: result.substring(0, 200) + '...',
                });
                continue;
              }
            } else {
              toolResult = result;
            }

            if ((toolResult.type === 'cat' || toolResult.type === 'dog') && toolResult.url) {
              let cleanContent = aiResponse.content || '';
              if (toolResult.url) {
                cleanContent = cleanContent.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim();
                cleanContent = cleanContent.replace(toolResult.url, '').trim();
              }

              await interaction.editReply({
                content: cleanContent || undefined,
                files: [
                  {
                    attachment: toolResult.url,
                    name: `${toolResult.type}.jpg`,
                  },
                ],
              });
              return;
            }
          } catch (parseError) {
            logger.error('Error parsing individual tool result:', parseError);
          }
        }
      } catch (error) {
        logger.error('Error processing tool results:', error);
      }
    }

    const { getUnallowedWordCategory } = await import('@/utils/validation');
    const category = getUnallowedWordCategory(fullResponse);
    if (category) {
      logger.warn(`AI response contained unallowed words in category: ${category}`);
      await interaction.editReply(
        'Sorry, I cannot provide that response as it contains prohibited content. Please try a different prompt.',
      );
      return;
    }

    const urlProcessedResponse = processUrls(fullResponse);
    const chunks = splitResponseIntoChunks(urlProcessedResponse);

    await interaction.editReply(chunks[0]);

    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp({
        content: chunks[i],
        flags: MessageFlags.SuppressNotifications,
      });
    }
  } catch (error) {
    logger.error('Error in sendAIResponse:', error);
    try {
      await interaction.editReply('An error occurred while processing your request.');
    } catch (editError) {
      logger.error('Failed to send error message:', editError);
    }
    return;
  }

  if (aiResponse.toolResults) {
    try {
      const toolResult = JSON.parse(aiResponse.toolResults);

      if (toolResult.alreadyResponded && !aiResponse.content) {
        return;
      }

      if (toolResult.type === 'command') {
        if (toolResult.image) {
          const embed = new EmbedBuilder().setImage(toolResult.image).setColor(0x8a2be2);

          if (toolResult.title) {
            embed.setTitle(toolResult.title);
          }
          if (toolResult.source) {
            embed.setFooter({ text: `Source: ${toolResult.source}` });
          }

          try {
            await interaction.followUp({
              embeds: [embed],
              flags: MessageFlags.SuppressNotifications,
            });
            return;
          } catch (error) {
            logger.error('Failed to send embed with source:', error);
            return;
          }
        }

        if (toolResult.success && toolResult.data) {
          const components = toolResult.data.components || [];
          let imageUrl: string | null = null;
          let caption = '';

          for (const component of components) {
            if (component.type === 12 && component.items?.[0]?.media?.url) {
              imageUrl = component.items[0].media.url;
              break;
            }
          }

          for (const component of components) {
            if (component.type === 10 && component.content) {
              caption = component.content;
              break;
            }
          }

          if (imageUrl) {
            await interaction.followUp({
              content: caption || undefined,
              files: [imageUrl],
              flags: MessageFlags.SuppressNotifications,
            });
            return;
          }
        }

        if (aiResponse.toolResults) {
          await interaction.followUp({
            content: aiResponse.toolResults,
            flags: MessageFlags.SuppressNotifications,
          });
        }
      }
    } catch (error) {
      logger.error('Error processing tool results:', error);
      try {
        await interaction.followUp({
          content: 'An error occurred while processing the tool results.',
          flags: MessageFlags.SuppressNotifications,
        });
      } catch (followUpError) {
        logger.error('Failed to send error message:', followUpError);
      }
    }
  }
}

export type { ConversationMessage, AIResponse };

export {
  makeAIRequest,
  getApiConfiguration,
  buildSystemPrompt,
  buildConversation,
  getUserCredentials,
  incrementAndCheckDailyLimit,
  incrementAndCheckServerDailyLimit,
  splitResponseIntoChunks,
};

interface AICommand {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (
    client: BotClient,
    interaction: ChatInputCommandInteraction,
  ) => Promise<void | InteractionResponse<boolean>>;
}

const aiCommand: AICommand = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setNameLocalizations({
      'es-ES': 'ia',
      'es-419': 'ia',
      'en-US': 'ai',
    })
    .setDescription('Chat with an AI assistant')
    .setDescriptionLocalizations({
      'es-ES': 'Chatea con un asistente de IA',
      'es-419': 'Chatea con un asistente de IA',
      'en-US': 'Chat with an AI assistant',
    })
    .setContexts([
      InteractionContextType.BotDM,
      InteractionContextType.Guild,
      InteractionContextType.PrivateChannel,
    ])
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall)
    .addStringOption((option) =>
      option
        .setName('prompt')
        .setDescription('Your message to the AI')
        .setDescriptionLocalizations({
          'es-ES': 'Tu mensaje para la IA',
          'es-419': 'Tu mensaje para la IA',
          'en-US': 'Your message to the AI',
        })
        .setRequired(true),
    )
    .addBooleanOption((option) =>
      option.setName('custom_setup').setDescription('Use your own API key?').setRequired(false),
    )
    .addBooleanOption((option) =>
      option.setName('reset').setDescription('Reset your AI chat history').setRequired(false),
    ),

  async execute(client: BotClient, interaction: ChatInputCommandInteraction) {
    const userId = getInvokerId(interaction);

    if (pendingRequests.has(userId)) {
      const pending = pendingRequests.get(userId);
      const isProcessing = pending?.status === 'processing';
      const isExpired = pending ? Date.now() - pending.createdAt > 30000 : true;
      if (isProcessing && !isExpired) {
        return interaction.reply({
          content: await client.getLocaleText('commands.ai.request.inprogress', interaction.locale),
          flags: MessageFlags.Ephemeral,
        });
      }
      pendingRequests.delete(userId);
    }

    try {
      const customSetup = interaction.options.getBoolean('custom_setup');
      const prompt = interaction.options.getString('prompt')!;
      const reset = interaction.options.getBoolean('reset');

      pendingRequests.set(userId, {
        interaction,
        prompt,
        createdAt: Date.now(),
        status: 'awaiting',
      });

      if (reset) {
        userConversations.delete(userId);
        await interaction.reply({
          content: await client.getLocaleText('commands.ai.reset', interaction.locale),
          flags: MessageFlags.Ephemeral,
        });
        pendingRequests.delete(userId);
        return;
      }

      if (customSetup !== null) {
        const { apiKey } = await getUserCredentials(interaction.user.id);

        if (customSetup) {
          if (!apiKey) {
            const setupUrl = process.env.FRONTEND_URL
              ? `${process.env.FRONTEND_URL}/api-keys`
              : 'the API keys page';

            return interaction.reply({
              content: `🔑 Please set up your API key first by visiting: ${setupUrl}\n\nAfter setting up your API key, you can use the AI command with your custom key.`,
              flags: MessageFlags.Ephemeral,
            });
          }
          const setupUrl = process.env.FRONTEND_URL
            ? `${process.env.FRONTEND_URL}/api-keys`
            : 'the API keys page';

          await interaction.reply({
            content: `✅ You're already using a custom API key. To change your API key settings, please visit: ${setupUrl}`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await setUserApiKey(interaction.user.id, null, null, null);
        userConversations.delete(userId);
        await interaction.reply({
          content: await client.getLocaleText('commands.ai.defaultapi', interaction.locale),
          flags: MessageFlags.Ephemeral,
        });
        await processAIRequest(client, interaction);
        return;
      }

      await processAIRequest(client, interaction);
    } catch (error) {
      logger.error('Error in AI command:', error);
      const errorMessage = `❌ An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`;

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ content: errorMessage });
        } else {
          await interaction.reply({
            content: errorMessage,
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        logger.error('Failed to send error message:', replyError);
      }

      const userId = getInvokerId(interaction);
      pendingRequests.delete(userId);
    }
  },
};

export default aiCommand as unknown as SlashCommandProps;
