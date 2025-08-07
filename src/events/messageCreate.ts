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
} from '@/commands/utilities/ai';
import { createMemoryManager } from '@/utils/memoryManager';

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

const dmConversations = createMemoryManager<string, ConversationMessage[]>({
  maxSize: 500,
  maxAge: 2 * 60 * 60 * 1000,
  cleanupInterval: 10 * 60 * 1000,
});

export default class MessageCreateEvent {
  constructor(private client: BotClient) {
    this.client = client;
    client.on('messageCreate', this.execute.bind(this));
  }

  private async execute(message: Message): Promise<void> {
    logger.info(
      `Message received: ${message.content} from ${message.author.username} in channel type: ${message.channel.type}`
    );

    if (message.author.bot) {
      logger.info('Ignoring message from bot');
      return;
    }

    if (message.channel.type !== ChannelType.DM) {
      logger.info(`Ignoring message - not a DM (channel type: ${message.channel.type})`);
      return;
    }

    logger.info('Processing DM message...');

    try {
      logger.info(
        `DM received from ${message.author.tag} (${message.author.id}): ${message.content}`
      );

      const userId = message.author.id;
      const conversation = dmConversations.get(userId) || [];

      const hasImageAttachments = message.attachments.some(
        (att) =>
          att.contentType?.startsWith('image/') ||
          att.name?.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)
      );
      const hasImageUrls =
        /\.(jpg|jpeg|png|gif|webp|bmp|svg)\b/i.test(message.content) ||
        /https?:\/\/[^\s]*\.(jpg|jpeg|png|gif|webp|bmp|svg)/i.test(message.content) ||
        /discord(?:app)?\.com\/attachments\/[^\s]*\.(jpg|jpeg|png|gif|webp|bmp|svg)/i.test(
          message.content
        );

      if (message.attachments.size > 0) {
        logger.info(`Found ${message.attachments.size} attachment(s)`);
        message.attachments.forEach((att) => {
          logger.info(
            `Attachment: ${att.name}, Content-Type: ${att.contentType}, URL: ${att.url}, Size: ${att.size}`
          );
        });
      } else {
        logger.info('No attachments found in message');
      }

      logger.info(`hasImageAttachments: ${hasImageAttachments}, hasImageUrls: ${hasImageUrls}`);
      const hasImages = hasImageAttachments || hasImageUrls;

      const { model: userCustomModel } = await getUserCredentials(message.author.id);

      const selectedModel =
        userCustomModel || (hasImages ? 'google/gemma-3-4b-it' : 'moonshotai/kimi-k2');

      logger.info(
        `Using model: ${selectedModel} for message with images: ${hasImages}${userCustomModel ? ' (user custom model)' : ' (default model)'}`
      );

      const systemPrompt = buildSystemPrompt(
        true,
        this.client,
        selectedModel,
        message.author.username
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
          }> = message.content;

      if (hasImages) {
        const imageAttachments = message.attachments.filter(
          (att) =>
            att.contentType?.startsWith('image/') ||
            att.name?.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)
        );

        const imageUrlRegex = /https?:\/\/[^\s]*\.(jpg|jpeg|png|gif|webp|bmp|svg)[^\s]*/gi;
        const discordImageRegex =
          /https?:\/\/(?:cdn\.)?discord(?:app)?\.com\/attachments\/[^\s]+/gi;
        const imageUrls = [
          ...(message.content.match(imageUrlRegex) || []),
          ...(message.content.match(discordImageRegex) || []),
        ];

        const contentArray: Array<{
          type: 'text' | 'image_url';
          text?: string;
          image_url?: {
            url: string;
            detail?: 'low' | 'high' | 'auto';
          };
        }> = [];

        let textContent = message.content;
        imageUrls.forEach((url) => {
          textContent = textContent.replace(url, '').trim();
        });

        if (textContent.trim()) {
          contentArray.push({
            type: 'text',
            text: textContent,
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

        imageUrls.forEach((url) => {
          contentArray.push({
            type: 'image_url',
            image_url: {
              url: url,
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
        systemPrompt
      );

      const { apiKey: userApiKey, apiUrl: userApiUrl } = await getUserCredentials(
        message.author.id
      );
      const config = getApiConfiguration(userApiKey ?? null, selectedModel, userApiUrl ?? null);

      if (config.usingDefaultKey) {
        const exemptUserId = process.env.AI_EXEMPT_USER_ID;
        if (message.author.id !== exemptUserId) {
          const allowed = await incrementAndCheckDailyLimit(message.author.id, 10);
          if (!allowed) {
            await message.reply(
              "❌ You've reached your daily limit of AI requests. Please try again tomorrow or set up your own API key using the `/ai` command."
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
          buildSystemPrompt(true, this.client, fallbackModel, message.author.username)
        );

        const fallbackConfig = getApiConfiguration(
          userApiKey ?? null,
          fallbackModel,
          userApiUrl ?? null
        );
        aiResponse = await makeAIRequest(fallbackConfig, fallbackConversation);

        if (aiResponse) {
          logger.info('Successfully processed message with fallback text-only model');
        }
      }

      if (!aiResponse) {
        await message.reply(
          'Sorry, I encountered an error processing your message. Please try again later.'
        );
        return;
      }

      await this.sendDMResponse(message, aiResponse);

      updatedConversation.push({
        role: 'assistant',
        content: aiResponse.content,
      });
      dmConversations.set(userId, updatedConversation);

      logger.info(`DM response sent to ${message.author.tag} (${message.author.id})`);
    } catch (error) {
      logger.error(`Error processing DM from ${message.author.tag} (${message.author.id}):`, error);
      try {
        await message.reply(
          'Sorry, I encountered an error processing your message. Please try again later.'
        );
      } catch (replyError) {
        logger.error('Failed to send error message:', replyError);
      }
    }
  }

  private async sendDMResponse(message: Message, aiResponse: AIResponse): Promise<void> {
    let fullResponse = '';

    if (aiResponse.reasoning) {
      fullResponse += `> ${aiResponse.reasoning}\n\n`;
    }

    fullResponse += aiResponse.content;

    const maxLength = 2000;
    if (fullResponse.length <= maxLength) {
      await message.reply(fullResponse);
    } else {
      const chunks = this.splitResponseIntoChunks(fullResponse, maxLength);

      await message.reply(chunks[0]);

      for (let i = 1; i < chunks.length; i++) {
        if ('send' in message.channel) {
          await message.channel.send(chunks[i]);
        }
      }
    }
  }

  private splitResponseIntoChunks(response: string, maxLength: number = 2000): string[] {
    if (response.length <= maxLength) {
      return [response];
    }

    const chunks: string[] = [];
    let currentChunk = '';
    const lines = response.split('\n');

    for (const line of lines) {
      if (currentChunk.length + line.length + 1 <= maxLength) {
        currentChunk += (currentChunk ? '\n' : '') + line;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = line;
        } else {
          const words = line.split(' ');
          for (const word of words) {
            if (currentChunk.length + word.length + 1 <= maxLength) {
              currentChunk += (currentChunk ? ' ' : '') + word;
            } else {
              if (currentChunk) {
                chunks.push(currentChunk);
                currentChunk = word;
              } else {
                chunks.push(word.substring(0, maxLength));
                currentChunk = word.substring(maxLength);
              }
            }
          }
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }
}
