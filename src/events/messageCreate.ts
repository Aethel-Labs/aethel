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
  splitResponseIntoChunks,
  processUrls,
} from '@/commands/utilities/ai';
import type { ConversationMessage, AIResponse } from '@/commands/utilities/ai';
import { createMemoryManager } from '@/utils/memoryManager';

const conversations = createMemoryManager<string, ConversationMessage[]>({
  maxSize: 2000,
  maxAge: 2 * 60 * 60 * 1000,
  cleanupInterval: 10 * 60 * 1000,
});

function getConversationKey(message: Message): string {
  if (message.channel.type === ChannelType.DM) {
    return `dm:${message.author.id}`;
  } else if (message.guildId) {
    return `guild:${message.guildId}:${message.author.id}`;
  }
  return `channel:${message.channelId}`;
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

    if (!isDM && !isMentioned) {
      logger.debug(
        `Ignoring message - not a DM and bot not mentioned (channel type: ${message.channel.type})`,
      );
      return;
    }

    logger.info(isDM ? 'Processing DM message...' : 'Processing mention in server...');

    try {
      logger.debug(
        `${isDM ? 'DM' : 'Message'} received (${message.content.length} characters) - content hidden for privacy`,
      );

      const conversationKey = getConversationKey(message);
      const conversation = conversations.get(conversationKey) || [];

      const hasImageAttachments = message.attachments.some(
        (att) =>
          att.contentType?.startsWith('image/') ||
          att.name?.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i),
      );

      const hasImageUrls = false;

      if (message.attachments.size > 0) {
        logger.debug(`Found ${message.attachments.size} attachment(s)`);
        message.attachments.forEach((att) => {
          logger.debug(`Attachment: type=${att.contentType}, size=${att.size}bytes`);
        });
      } else {
        logger.debug('No attachments found in message');
      }

      logger.debug(`hasImageAttachments: ${hasImageAttachments}, hasImageUrls: ${hasImageUrls}`);
      const hasImages = hasImageAttachments;
      const { model: userCustomModel } = await getUserCredentials(conversationKey);

      const selectedModel = hasImages
        ? 'google/gemma-3-4b-it'
        : userCustomModel || 'moonshotai/kimi-k2';

      logger.info(
        `Using model: ${selectedModel} for message with images: ${hasImages}${userCustomModel ? ' (user custom model)' : ' (default model)'}`,
      );

      const systemPrompt = buildSystemPrompt(
        isDM,
        this.client,
        selectedModel,
        message.author.username,
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

      const { apiKey: userApiKey, apiUrl: userApiUrl } = await getUserCredentials(conversationKey);
      const config = getApiConfiguration(userApiKey ?? null, selectedModel, userApiUrl ?? null);

      if (config.usingDefaultKey) {
        const exemptUserId = process.env.AI_EXEMPT_USER_ID;
        const actorId = message.author.id;

        if (actorId !== exemptUserId) {
          const allowed = await incrementAndCheckDailyLimit(actorId, 10);
          if (!allowed) {
            await message.reply(
              "❌ You've reached your daily limit of AI requests. Please try again tomorrow or set up your own API key using the `/ai` command.",
            );
            return;
          }
        }
      } else if (!config.finalApiKey) {
        await message.reply('❌ Please set up your API key first using the `/ai` command.');
        return;
      }

      let aiResponse = await makeAIRequest(config, updatedConversation);

      if (!aiResponse && hasImages) {
        logger.warn(`First attempt failed for ${selectedModel}, retrying once...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        aiResponse = await makeAIRequest(config, updatedConversation);
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

        const fallbackModel = userCustomModel || 'moonshotai/kimi-k2';

        const fallbackConversation = buildConversation(
          cleanedConversation,
          fallbackContent,
          buildSystemPrompt(isDM, this.client, fallbackModel, message.author.username),
        );

        const fallbackConfig = getApiConfiguration(
          userApiKey ?? null,
          fallbackModel,
          userApiUrl ?? null,
        );
        aiResponse = await makeAIRequest(fallbackConfig, fallbackConversation);

        if (aiResponse) {
          logger.info('Successfully processed message with fallback text-only model');
        }
      }

      if (!aiResponse) {
        await message.reply({
          content: 'Sorry, I encountered an error processing your message. Please try again later.',
          allowedMentions: { parse: ['users'] as const },
        });
        return;
      }

      aiResponse.content = processUrls(aiResponse.content);
      aiResponse.content = aiResponse.content.replace(/@(everyone|here)/gi, '@\u200b$1');

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

      await this.sendResponse(message, aiResponse);

      updatedConversation.push({
        role: 'assistant',
        content: aiResponse.content,
      });
      conversations.set(conversationKey, updatedConversation);

      logger.info(`${isDM ? 'DM' : 'Server'} response sent successfully`);
    } catch (error) {
      logger.error(
        `Error processing ${isDM ? 'DM' : 'server message'}:`,
        error instanceof Error ? error.message : String(error),
      );
      try {
        await message.reply(
          'Sorry, I encountered an error processing your message. Please try again later.',
        );
      } catch (replyError) {
        logger.error('Failed to send error message:', replyError);
      }
    }
  }

  private async sendResponse(message: Message, aiResponse: AIResponse): Promise<void> {
    let fullResponse = '';

    if (aiResponse.reasoning) {
      fullResponse += `> ${aiResponse.reasoning}\n\n`;
    }

    fullResponse += aiResponse.content;

    const maxLength = 2000;
    if (fullResponse.length <= maxLength) {
      await message.reply({
        content: fullResponse,
        allowedMentions: { parse: ['users'] as const },
      });
    } else {
      const chunks = splitResponseIntoChunks(fullResponse, maxLength);

      await message.reply({ content: chunks[0], allowedMentions: { parse: ['users'] as const } });

      for (let i = 1; i < chunks.length; i++) {
        if ('send' in message.channel) {
          await message.channel.send({
            content: chunks[i],
            allowedMentions: { parse: ['users'] as const },
          });
        }
      }
    }
  }
}
