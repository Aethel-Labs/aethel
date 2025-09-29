import { Message } from 'discord.js';
import BotClient from '@/services/Client';
import logger from '@/utils/logger';

export interface MessageToolCall {
  name: string;
  args: Record<string, unknown>;
}

function extractEmojiArg(args: Record<string, unknown>): string {
  const raw = (args.emoji as string) || (args.query as string) || '';
  return typeof raw === 'string' ? raw.trim() : '';
}

function normalizeEmoji(input: string): string {
  if (!input) return '';
  const customMatch = input.match(/<a?:\w+:(\d+)>/);
  if (customMatch && customMatch[1]) {
    return customMatch[0];
  }
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

export async function executeMessageToolCall(
  toolCall: MessageToolCall,
  message: Message,
  _client: BotClient,
  opts?: { originalMessage?: Message; botMessage?: Message },
): Promise<{ success: boolean; type: string; handled: boolean; error?: string }> {
  const name = (toolCall.name || '').toLowerCase();
  try {
    if (name === 'reaction') {
      const emojiRaw = extractEmojiArg(toolCall.args || {});
      const emoji = normalizeEmoji(emojiRaw);
      if (!emoji) {
        return { success: false, type: 'reaction', handled: false, error: 'Missing emoji' };
      }

      let targetMsg: Message = message;
      try {
        const targetSpec = (toolCall.args?.target as string) || '';
        const msgId = (toolCall.args?.target_message_id as string) || '';
        const url = (toolCall.args?.target_url as string) || '';

        if (targetSpec === 'user' && opts?.originalMessage) {
          targetMsg = opts.originalMessage;
        } else if (targetSpec === 'bot' && opts?.botMessage) {
          targetMsg = opts.botMessage;
        } else if (msgId && message.channel && 'messages' in message.channel) {
          try {
            const fetched = await message.channel.messages.fetch(msgId);
            if (fetched) targetMsg = fetched;
          } catch (error) {
            logger.warn(`Failed to fetch message with ID ${msgId}:`, error);
          }
        } else if (url) {
          const m = url.match(/discord\.com\/channels\/\d+\/(\d+)\/(\d+)/);
          const channelId = m?.[1];
          const messageId = m?.[2];
          try {
            if (channelId && messageId && message.client.channels) {
              const ch = await message.client.channels.fetch(channelId);
              if (ch && 'messages' in ch) {
                const fetched = await ch.messages.fetch(messageId);
                if (fetched) targetMsg = fetched;
              }
            }
          } catch (error) {
            logger.warn(`Failed to fetch message from URL ${url}:`, error);
          }
        }
      } catch (error) {
        logger.warn('Error processing message target:', error);
      }

      try {
        await targetMsg.react(emoji);
        return { success: true, type: 'reaction', handled: true };
      } catch (_err) {
        try {
          await targetMsg.react(emojiRaw);
          return { success: true, type: 'reaction', handled: true };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('[MessageToolExecutor] Failed to add reaction:', {
            emoji: emojiRaw,
            error: errorMessage,
          });
          return { success: false, type: 'reaction', handled: false, error: errorMessage };
        }
      }
    }

    return { success: false, type: name || 'unknown', handled: false, error: 'Unknown tool' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[MessageToolExecutor] Error executing tool call:', { name, error: errorMessage });
    return { success: false, type: name || 'unknown', handled: false, error: errorMessage };
  }
}
