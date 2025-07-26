import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  ChatInputCommandInteraction,
  InteractionContextType,
  ApplicationIntegrationType,
  MessageFlags,
} from 'discord.js';
import pool from '@/utils/pgClient';
import { encrypt, decrypt, isValidEncryptedFormat, EncryptionError } from '@/utils/encrypt';
import { SlashCommandProps } from '@/types/command';
import BotClient from '@/services/Client';
import logger from '@/utils/logger';
import { createCommandLogger } from '@/utils/commandLogger';
import { createErrorHandler } from '@/utils/errorHandler';
import { createMemoryManager } from '@/utils/memoryManager';

interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PendingRequest {
  interaction: ChatInputCommandInteraction;
  prompt: string;
  timestamp: number;
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

interface AIResponse {
  choices?: Array<{
    message?: { content: string };
    text?: string;
  }>;
}

class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;
  private accessTimes = new Map<K, number>();

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.accessTimes.set(key, Date.now());
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.set(key, value);
      this.accessTimes.set(key, Date.now());
      return;
    }

    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, value);
    this.accessTimes.set(key, Date.now());
  }

  delete(key: K): boolean {
    this.accessTimes.delete(key);
    return this.cache.delete(key);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  size(): number {
    return this.cache.size;
  }

  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }

  private evictLRU(): void {
    let oldestKey: K | undefined;
    let oldestTime = Infinity;

    for (const [key, time] of this.accessTimes) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      this.delete(oldestKey);
    }
  }

  cleanupOld(maxAge: number): void {
    const now = Date.now();
    const keysToDelete: K[] = [];

    for (const [key, time] of this.accessTimes) {
      if (now - time > maxAge) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.delete(key));
  }
}

const userConversations = new LRUCache<string, ConversationMessage[]>(500);
const pendingRequests = createMemoryManager<string, PendingRequest>({
  maxSize: 100,
  maxAge: 10 * 60 * 1000,
  cleanupInterval: 5 * 60 * 1000,
});

const commandLogger = createCommandLogger('ai');
const errorHandler = createErrorHandler('ai');

setInterval(
  () => {
    const now = Date.now();

    for (const [userId, request] of pendingRequests.entries()) {
      if (now - request.timestamp > 5 * 60 * 1000) {
        pendingRequests.delete(userId);
      }
    }

    const conversationMaxAge = 2 * 60 * 60 * 1000;
    userConversations.cleanupOld(conversationMaxAge);
  },
  10 * 60 * 1000
);

function processUrls(text: string): string {
  return text.replace(
    /(https?:\/\/(?:[\w.-]+)(?:\/[\w\d%/#?&=&%#?\w\d/-]*)?)(?<![.,!?])([.,!?])?(?=(\s|$))/gi,
    (match: string, url: string, punctuation: string | undefined): string => {
      const startIdx = text.indexOf(url);
      const before = text[startIdx - 1];
      const after = text[startIdx + url.length];
      if (before === '<' && after === '>') return url + (punctuation || '');
      return `<${url}>${punctuation || ''}`;
    }
  );
}

function getApiConfiguration(apiKey: string | null, model: string | null, apiUrl: string | null) {
  const usingCustomApi = !!apiKey;
  let finalApiUrl = apiUrl || 'https://openrouter.ai/api/v1/chat/completions';
  const finalApiKey = apiKey || process.env.OPENROUTER_API_KEY;
  let finalModel = model || (usingCustomApi ? 'openai/gpt-4.1-mini' : 'amazon/nova-lite-v1');

  const usingDefaultKey = !usingCustomApi && process.env.OPENROUTER_API_KEY;
  if (usingDefaultKey) {
    finalApiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    finalModel = 'amazon/nova-lite-v1';
  }

  return {
    usingCustomApi,
    usingDefaultKey,
    finalApiUrl,
    finalApiKey,
    finalModel,
  };
}

function buildConversation(
  existingConversation: ConversationMessage[],
  prompt: string,
  usingDefaultKey: boolean
): ConversationMessage[] {
  const baseInstructions = `You are a helpful, accurate, and privacy-respecting AI assistant for the /ai command of the Aethel Discord User Bot. Your primary goal is to provide clear, concise, and friendly answers to user questions, adapting your tone to be conversational and approachable. Only mention your AI model or the /ai command if it is directly relevant to the user's request—do not introduce yourself with this information by default.

**IMPORTANT INSTRUCTIONS ABOUT URLS:**
- NEVER format, modify, or alter URLs in any way. Leave them exactly as they are.
- DO NOT add markdown, backticks, or any formatting to URLs.
- DO NOT add or remove any characters from URLs.
- The system will handle URL formatting automatically.

**BOT FACTS (use only if asked about the bot):**
- Name: Aethel
- Website: https://aethel.xyz
- Type: Discord user bot (not a server bot; only added to users, not servers)
- Supported commands: /8ball, /ai, /wiki, /weather, /joke, /remind, /cat, /dog, /help
- /remind: Can be used with /remind time message, or by right-clicking a message and selecting Apps > Remind Me
- /dog and /cat: Show an embed with a new dog/cat button (dog images from erm.dog, cat images from pur.cat)
- The bot status and info are available on its website.

When answering questions about the Aethel bot, only use the above factual information. Do not speculate about features or commands not listed here.

Format your responses using Discord markdown (bold, italics, code blocks, lists, etc) where appropriate, but NEVER format URLs—leave them as-is. Only greet the user at the start of a new conversation, not in every message. Always prioritize being helpful, accurate, and respectful.`;

  const modelSpecificInstructions = usingDefaultKey
    ? '\n\n**IMPORTANT (DEFAULT MODEL ONLY):** Please keep your responses under 3000 characters. Be concise and to the point.'
    : '';

  const systemInstructions = baseInstructions + modelSpecificInstructions;

  let conversation = existingConversation.filter((msg) => msg.role !== 'system');
  conversation.push({ role: 'user', content: prompt });

  if (conversation.length > 9) {
    conversation = conversation.slice(-9);
  }

  const systemMessage: ConversationMessage = {
    role: 'system',
    content: systemInstructions,
  };

  conversation.unshift(systemMessage);
  return conversation;
}

function splitResponseIntoChunks(response: string, maxLength: number = 2000): string[] {
  if (response.length <= maxLength) {
    return [response];
  }

  const chunks: string[] = [];
  let remaining = response;

  while (remaining.length > 0) {
    const chunk = remaining.substring(0, maxLength);
    chunks.push(chunk);
    remaining = remaining.substring(chunk.length);

    if (remaining.length > 0 && remaining[0] !== '\n') {
      const nextNewline = remaining.indexOf('\n');
      if (nextNewline > 0 && nextNewline <= 50) {
        const extra = remaining.substring(0, nextNewline + 1);
        chunks[chunks.length - 1] += extra;
        remaining = remaining.substring(extra.length);
      }
    }
  }

  return chunks;
}

function extractAIResponse(data: AIResponse): string {
  if (data.choices && data.choices[0]?.message?.content) {
    return data.choices[0].message.content;
  } else if (data.choices && data.choices[0]?.text) {
    return data.choices[0].text;
  }
  return '';
}

async function getUserById(userId: string): Promise<User | undefined> {
  const { rows } = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
  return rows[0];
}

async function setUserApiKey(
  userId: string,
  apiKey: string | null,
  model: string | null,
  apiUrl: string | null
): Promise<void> {
  if (apiKey === null) {
    try {
      await pool.query(
        `UPDATE users  
             SET api_key_encrypted = NULL, 
                 custom_model = NULL,  
                 custom_api_url = NULL, 
                 updated_at = now() 
             WHERE user_id = $1`,
        [userId]
      );
      logger.info(`Cleared API credentials for user ${userId}`);
    } catch (error) {
      logger.error(`Failed to clear API credentials for user ${userId}:`, error);
      throw error;
    }
  } else {
    if (!apiKey.trim()) {
      throw new Error('API key cannot be empty');
    }

    if (apiKey.length < 10) {
      throw new Error('API key appears to be too short');
    }

    if (apiKey.length > 500) {
      throw new Error('API key is too long');
    }

    try {
      const encrypted = encrypt(apiKey.trim());
      await pool.query(
        `INSERT INTO users (user_id, api_key_encrypted, custom_model, custom_api_url, updated_at)
             VALUES ($1, $2, $3, $4, now())
             ON CONFLICT (user_id) 
             DO UPDATE SET 
               api_key_encrypted = $2, 
               custom_model = $3, 
               custom_api_url = $4, 
               updated_at = now()`,
        [userId, encrypted, model?.trim() || null, apiUrl?.trim() || null]
      );
      logger.info(`Successfully saved encrypted API credentials for user ${userId}`);
    } catch (error) {
      if (error instanceof EncryptionError) {
        logger.error(`Encryption failed for user ${userId}: ${error.message}`);
        throw new Error('Failed to encrypt API key');
      }
      logger.error(`Failed to save API credentials for user ${userId}:`, error);
      throw error;
    }
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
        return {
          apiKey: null,
          model: user.custom_model,
          apiUrl: user.custom_api_url,
        };
      }

      apiKey = decrypt(user.api_key_encrypted);
      logger.debug(`Successfully decrypted API key for user ${userId}`);
    } catch (error) {
      if (error instanceof EncryptionError) {
        logger.warn(`Encryption error for user ${userId}: ${error.message}`);

        if (error.message.includes('Authentication failed')) {
          logger.info(`Clearing corrupted encrypted data for user ${userId}`);
          await clearCorruptedApiKey(userId);
        }
      } else {
        logger.error(`Unexpected error decrypting API key for user ${userId}:`, error);
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

async function incrementAndCheckDailyLimit(userId: string, limit: number = 20): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [
      userId,
    ]);
    const res = await client.query(
      `INSERT INTO ai_usage (user_id, usage_date, count) VALUES ($1, $2, 1)
         ON CONFLICT (user_id, usage_date) DO UPDATE SET count = ai_usage.count + 1 RETURNING count`,
      [userId, today]
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

async function testApiKey(
  apiKey: string,
  model: string,
  apiUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const fullApiUrl = apiUrl;
    const testModel = model;

    const testResponse = await fetch(fullApiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: testModel,
        messages: [
          {
            role: 'user',
            content:
              'Hello! This is a test message. Please respond with "API key test successful!"',
          },
        ],
        max_tokens: 50,
        temperature: 0.1,
      }),
    });

    if (!testResponse.ok) {
      const errorData = await testResponse.json().catch(() => ({}));
      const errorMessage =
        errorData.error?.message || `HTTP ${testResponse.status}: ${testResponse.statusText}`;

      logger.warn(`API key test failed: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
      };
    }

    const responseData = await testResponse.json();
    const testMessage = responseData.choices?.[0]?.message?.content || 'Test completed';

    logger.info('API key test successful');
    return {
      success: true,
    };
  } catch (error) {
    logger.error('Error testing API key:', error);

    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        success: false,
        error: 'Failed to connect to API endpoint. Please check the URL.',
      };
    }

    return {
      success: false,
      error: 'API key test failed due to server error',
    };
  }
}

export default {
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
        .setNameLocalizations({
          'es-ES': 'mensaje',
          'es-419': 'mensaje',
          'en-US': 'prompt',
        })
        .setDescription('Your message to the AI')
        .setDescriptionLocalizations({
          'es-ES': 'Tu mensaje para la IA',
          'es-419': 'Tu mensaje para la IA',
          'en-US': 'Your message to the AI',
        })
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option.setName('use_custom_api').setDescription('Use your own API key?').setRequired(false)
    )
    .addBooleanOption((option) =>
      option.setName('reset').setDescription('Reset your AI chat history').setRequired(false)
    ),

  async execute(client: BotClient, interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;

    if (pendingRequests.has(userId)) {
      const pending = pendingRequests.get(userId);
      if (pending && pending.timestamp && Date.now() - pending.timestamp > 30000) {
        pendingRequests.delete(userId);
      } else {
        return interaction.reply({
          content: await client.getLocaleText('commands.ai.request.inprogress', interaction.locale),
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    try {
      const useCustomApi = interaction.options.getBoolean('use_custom_api');
      const prompt = interaction.options.getString('prompt');
      const reset = interaction.options.getBoolean('reset');

      pendingRequests.set(userId, { interaction, prompt: prompt!, timestamp: Date.now() });

      if (reset) {
        userConversations.delete(userId);
        await interaction.reply({
          content: await client.getLocaleText('commands.ai.reset', interaction.locale),
          flags: MessageFlags.Ephemeral,
        });
        pendingRequests.delete(userId);
        return;
      }

      if (useCustomApi === false) {
        await setUserApiKey(userId, null, null, null);
        userConversations.delete(userId);
        await interaction.reply({
          content: await client.getLocaleText('commands.ai.defaultapi', interaction.locale),
          flags: MessageFlags.Ephemeral,
        });

        await processAIRequest(client, interaction);
        return;
      }

      const { apiKey } = await getUserCredentials(userId);
      if (useCustomApi && !apiKey) {
        const modal = new ModalBuilder()
          .setCustomId('apiCredentials')
          .setTitle(await client.getLocaleText('commands.ai.modal.title', interaction.locale));

        const apiKeyInput = new TextInputBuilder()
          .setCustomId('apiKey')
          .setLabel(await client.getLocaleText('commands.ai.modal.apikey', interaction.locale))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(
            await client.getLocaleText('commands.ai.modal.apikeyplaceholder', interaction.locale)
          )
          .setRequired(true);

        const apiUrlInput = new TextInputBuilder()
          .setCustomId('apiUrl')
          .setLabel(await client.getLocaleText('commands.ai.modal.apiurl', interaction.locale))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(
            await client.getLocaleText('commands.ai.modal.apiurlplaceholder', interaction.locale)
          )
          .setRequired(true);

        const modelInput = new TextInputBuilder()
          .setCustomId('model')
          .setLabel(await client.getLocaleText('commands.ai.modal.model', interaction.locale))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(
            await client.getLocaleText('commands.ai.modal.modelplaceholder', interaction.locale)
          )
          .setRequired(true);

        const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(apiKeyInput);
        const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(apiUrlInput);
        const thirdActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(modelInput);

        modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

        await interaction.showModal(modal);
      } else if (useCustomApi) {
        await interaction.deferReply();
        await processAIRequest(client, interaction);
      } else {
        await interaction.deferReply();
        await processAIRequest(client, interaction);
      }
    } catch {
      pendingRequests.delete(userId);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: await client.getLocaleText('failedrequest', interaction.locale),
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.editReply({
          content: await client.getLocaleText('failedrequest', interaction.locale),
        });
      }
    }
  },

  async handleModal(client: BotClient, interaction: ModalSubmitInteraction) {
    try {
      if (interaction.customId === 'apiCredentials') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const userId = interaction.user.id;
        const pendingRequest = pendingRequests.get(userId);

        if (!pendingRequest) {
          return interaction.editReply(
            await client.getLocaleText('commands.ai.nopendingrequest', interaction.locale)
          );
        }

        const { interaction: originalInteraction } = pendingRequest;

        const apiKey = interaction.fields.getTextInputValue('apiKey').trim();
        const apiUrl = interaction.fields.getTextInputValue('apiUrl').trim();
        const model = interaction.fields.getTextInputValue('model').trim();

        await interaction.editReply(
          await client.getLocaleText('commands.ai.testing', interaction.locale)
        );

        const testResult = await testApiKey(apiKey, model, apiUrl);

        if (!testResult.success) {
          const errorMessage = await client.getLocaleText(
            'commands.ai.testfailed',
            interaction.locale
          );
          await interaction.editReply(
            errorMessage.replace('{error}', testResult.error || 'Unknown error')
          );
          return;
        }

        await setUserApiKey(userId, apiKey, model, apiUrl);

        await interaction.editReply(
          await client.getLocaleText('commands.ai.testsuccess', interaction.locale)
        );

        if (!originalInteraction.deferred && !originalInteraction.replied) {
          await originalInteraction.deferReply();
        }
        await processAIRequest(client, originalInteraction);
      }
    } catch {
      await interaction.editReply({
        content: await client.getLocaleText('failedrequest', interaction.locale),
      });
    } finally {
      pendingRequests.delete(interaction.user.id);
    }
  },
} as unknown as SlashCommandProps;

async function processAIRequest(
  client: BotClient,
  interaction: ChatInputCommandInteraction
): Promise<void> {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const prompt = interaction.options.getString('prompt');
    commandLogger.logFromInteraction(
      interaction,
      `prompt: "${prompt?.substring(0, 50)}${prompt && prompt.length > 50 ? '...' : ''}"`
    );
    const { apiKey, model, apiUrl } = await getUserCredentials(interaction.user.id);
    const config = getApiConfiguration(apiKey || null, model || null, apiUrl || null);

    if (config.usingDefaultKey) {
      const exemptUserId = process.env.AI_EXEMPT_USER_ID;
      if (interaction.user.id !== exemptUserId) {
        const allowed = await incrementAndCheckDailyLimit(interaction.user.id, 10);
        if (!allowed) {
          await interaction.editReply(
            '❌ ' +
              (await client.getLocaleText('commands.ai.process.dailylimit', interaction.locale))
          );
          return;
        }
      }
    } else if (!config.finalApiKey) {
      await interaction.editReply(
        '❌ ' + (await client.getLocaleText('commands.ai.process.noapikey', interaction.locale))
      );
      return;
    }

    const existingConversation = userConversations.get(interaction.user.id) || [];
    const conversation = buildConversation(existingConversation, prompt!, !!config.usingDefaultKey);

    const aiResponse = await makeAIRequest(config, conversation);
    if (!aiResponse) return;

    const updatedConversation = [
      ...conversation.filter((msg) => msg.role !== 'system'),
      { role: 'assistant', content: aiResponse },
    ];
    if (updatedConversation.length > 10) {
      updatedConversation.splice(0, updatedConversation.length - 10);
    }
    userConversations.set(interaction.user.id, updatedConversation as ConversationMessage[]);

    await sendAIResponse(interaction, aiResponse, client);
  } catch (error) {
    await errorHandler({
      interaction,
      client,
      error: error as Error,
      userId: interaction.user.id,
      username: interaction.user.tag,
    });
  } finally {
    pendingRequests.delete(interaction.user.id);
  }
}

async function makeAIRequest(
  config: ReturnType<typeof getApiConfiguration>,
  conversation: ConversationMessage[]
): Promise<string | null> {
  const maxTokens = config.usingDefaultKey ? 1000 : 3000;
  const requestBody = {
    model: config.finalModel,
    messages: conversation,
    max_tokens: maxTokens,
  };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.finalApiKey}`,
    'Content-Type': 'application/json',
  };

  if (config.finalApiUrl === 'https://openrouter.ai/api/v1/chat/completions') {
    headers['HTTP-Referer'] = 'https://aethel.xyz';
    headers['X-Title'] = 'Aethel Discord Bot';
  }

  try {
    const response = await fetch(config.finalApiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();

    if (!response.ok) {
      logger.error(`AI API request failed: ${response.status} - ${response.statusText}`);
      return null;
    }

    const data: AIResponse = JSON.parse(responseText);
    const aiResponse = extractAIResponse(data);

    if (!aiResponse) {
      logger.error('No valid response content from AI API');
      return null;
    }

    return aiResponse;
  } catch (error) {
    logger.error(`Error making AI request: ${error}`);
    return null;
  }
}

async function sendAIResponse(
  interaction: ChatInputCommandInteraction,
  response: string,
  client: BotClient
): Promise<void> {
  const processedResponse = processUrls(response);
  const chunks = splitResponseIntoChunks(processedResponse);

  try {
    await interaction.editReply(chunks[0]);

    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp({
        content: chunks[i],
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch {
    try {
      const fallbackMessage = `${chunks[0]}\n\n*❌ ${await client.getLocaleText('commands.ai.errors.toolong', interaction.locale)}*`;
      await interaction.editReply(fallbackMessage);
    } catch {
      logger.error('Failed to send AI response fallback message');
    }
  }
}
