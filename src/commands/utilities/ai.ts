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
import OpenAI from 'openai';
import pool from '@/utils/pgClient';
import { encrypt, decrypt, isValidEncryptedFormat, EncryptionError } from '@/utils/encrypt';
import { SlashCommandProps } from '@/types/command';
import BotClient from '@/services/Client';
import logger from '@/utils/logger';
import { createCommandLogger } from '@/utils/commandLogger';
import { createErrorHandler } from '@/utils/errorHandler';
import { createMemoryManager } from '@/utils/memoryManager';

const ALLOWED_API_HOSTS = ['api.openai.com', 'openrouter.ai', 'generativelanguage.googleapis.com'];

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
}

interface AIResponse {
  content: string;
  reasoning?: string;
}

interface OpenAIMessageWithReasoning {
  content: string;
  reasoning?: string;
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
  const finalApiUrl = apiUrl || 'https://openrouter.ai/api/v1';
  const finalApiKey = apiKey || process.env.OPENROUTER_API_KEY;
  const finalModel = model || (usingCustomApi ? 'openai/gpt-4o-mini' : 'moonshotai/kimi-k2');
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
  interaction?: ChatInputCommandInteraction
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
    hour12: true,
    timeZone: timezone,
  });

  let supportedCommands = '/help - Show all available commands and their usage';
  if (client?.commands) {
    const commandEntries = Array.from(client.commands.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    supportedCommands = commandEntries
      .map(
        ([name, command]) => `/${name} - ${command.data.description || 'No description available'}`
      )
      .join('\n');
  }

  const currentModel = model || (usingDefaultKey ? 'moonshotai/kimi-k2 (default)' : 'custom model');

  const baseInstructions = `You are a helpful, accurate, and privacy-respecting AI assistant for the /ai command of the Aethel Discord User Bot. Your primary goal is to provide clear, concise, and friendly answers to user questions, adapting your tone to be conversational and approachable.

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
- NEVER format, modify, or alter URLs in any way. Leave them exactly as they are.
- Format your responses using Discord markdown where appropriate, but NEVER format URLs.
- Only greet the user at the start of a new conversation, not in every message.

**BOT FACTS (use only if asked about the bot):**
- Name: Aethel
- Website: https://aethel.xyz
- Developer: scanash (main maintainer) and Aethel Labs (org)
- Open source: https://github.com/Aethel-Labs/aethel
- Type: Discord user bot
- Supported commands: ${supportedCommands}`;

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
  systemPrompt: string
): ConversationMessage[] {
  let conversation = existingConversation.filter((msg) => msg.role !== 'system');
  conversation.push({ role: 'user', content: prompt });

  if (conversation.length > 9) {
    conversation = conversation.slice(-9);
  }

  conversation.unshift({ role: 'system', content: systemPrompt });
  return conversation;
}

function splitResponseIntoChunks(response: string, maxLength: number = 2000): string[] {
  if (response.length <= maxLength) return [response];

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
    await pool.query(
      `UPDATE users SET api_key_encrypted = NULL, custom_model = NULL, custom_api_url = NULL, updated_at = now() WHERE user_id = $1`,
      [userId]
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
      [userId, encrypted, model?.trim() || null, apiUrl?.trim() || null]
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
    const client = getOpenAIClient(apiKey, apiUrl);

    await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: 'Hello! This is a test message. Please respond with "API key test successful!"',
        },
      ],
      max_tokens: 50,
      temperature: 0.1,
    });

    logger.info('API key test successful');
    return { success: true };
  } catch (error: unknown) {
    logger.error('Error testing API key:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

async function makeAIRequest(
  config: ReturnType<typeof getApiConfiguration>,
  conversation: ConversationMessage[]
): Promise<AIResponse | null> {
  try {
    const client = getOpenAIClient(config.finalApiKey!, config.finalApiUrl);
    const maxTokens = config.usingDefaultKey ? 1000 : 3000;

    const completion = await client.chat.completions.create({
      model: config.finalModel,
      messages: conversation as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      max_tokens: maxTokens,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      logger.error('No valid response content from AI API');
      return null;
    }

    const reasoning = (completion.choices[0]?.message as OpenAIMessageWithReasoning)?.reasoning;

    return {
      content,
      reasoning,
    };
  } catch (error) {
    logger.error(`Error making AI request: ${error}`);
    return null;
  }
}

async function processAIRequest(
  client: BotClient,
  interaction: ChatInputCommandInteraction
): Promise<void> {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const prompt = interaction.options.getString('prompt')!;
    commandLogger.logFromInteraction(
      interaction,
      `prompt: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`
    );

    const { apiKey, model, apiUrl } = await getUserCredentials(interaction.user.id);
    const config = getApiConfiguration(apiKey ?? null, model ?? null, apiUrl ?? null);

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
    const conversationArray = Array.isArray(existingConversation) ? existingConversation : [];
    const systemPrompt = buildSystemPrompt(
      !!config.usingDefaultKey,
      client,
      config.finalModel,
      interaction.user.tag,
      interaction
    );
    const conversation = buildConversation(conversationArray, prompt, systemPrompt);

    const aiResponse = await makeAIRequest(config, conversation);
    if (!aiResponse) return;

    const updatedConversation = [
      ...conversation.filter((msg) => msg.role !== 'system'),
      { role: 'assistant', content: aiResponse.content },
    ] as ConversationMessage[];

    if (updatedConversation.length > 10) {
      updatedConversation.splice(0, updatedConversation.length - 10);
    }
    userConversations.set(interaction.user.id, updatedConversation);

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

async function sendAIResponse(
  interaction: ChatInputCommandInteraction,
  aiResponse: AIResponse,
  client: BotClient
): Promise<void> {
  let fullResponse = '';

  if (aiResponse.reasoning) {
    fullResponse += `> ${aiResponse.reasoning}\n\n`;
  }

  fullResponse += aiResponse.content;

  const urlProcessedResponse = processUrls(fullResponse);
  const chunks = splitResponseIntoChunks(urlProcessedResponse);

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

export { makeAIRequest, getApiConfiguration, buildSystemPrompt, buildConversation, sendAIResponse };

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
      if (pending && Date.now() - pending.timestamp > 30000) {
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
      const prompt = interaction.options.getString('prompt')!;
      const reset = interaction.options.getBoolean('reset');

      pendingRequests.set(userId, { interaction, prompt, timestamp: Date.now() });

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

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(apiKeyInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(apiUrlInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(modelInput)
        );

        await interaction.showModal(modal);
      } else {
        await interaction.deferReply();
        await processAIRequest(client, interaction);
      }
    } catch {
      pendingRequests.delete(userId);
      const errorMessage = await client.getLocaleText('failedrequest', interaction.locale);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.editReply({ content: errorMessage });
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

        let parsedUrl;
        try {
          parsedUrl = new URL(apiUrl);
        } catch {
          await interaction.editReply(
            'API URL is invalid. Please use a supported API endpoint (OpenAI, OpenRouter, or Google Gemini).'
          );
          return;
        }

        if (!ALLOWED_API_HOSTS.includes(parsedUrl.hostname)) {
          await interaction.editReply(
            'API URL not allowed. Please use a supported API endpoint (OpenAI, OpenRouter, or Google Gemini).'
          );
          return;
        }

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
