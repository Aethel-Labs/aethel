import logger from '@/utils/logger';
import { ToolDefinition } from '@/types/tools';

const reactionTool: ToolDefinition = {
  name: 'reaction',
  description: 'React to the triggering Discord message with an emoji.',
  requiresMessage: true,
  parameters: {
    type: 'object',
    properties: {
      emoji: {
        type: 'string',
        description: 'Emoji to react with. Accepts unicode or Discord custom emoji format.',
      },
      target: {
        type: 'string',
        enum: ['user', 'bot'],
        description: 'Whether to react to the user message or bot response (default user).',
      },
    },
    required: ['emoji'],
  },
  async handler(args, context) {
    const message = args.target === 'bot' ? context.botMessage : context.message;
    if (!message) {
      throw new Error('Reaction tool requires an active message context');
    }

    const emojiInput = (args.emoji || args.query || '') as string;
    if (!emojiInput) {
      throw new Error('Emoji is required for the reaction tool');
    }

    const resolvedEmoji = resolveEmoji(emojiInput);

    try {
      await message.react(resolvedEmoji);
      return {
        content: [],
        metadata: {
          type: 'reaction',
          emoji: resolvedEmoji,
          target: args.target === 'bot' ? 'bot' : 'user',
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
  },
};

function resolveEmoji(input: string): string {
  const shortcode = input.match(/^:([a-z0-9_+-]+):$/i)?.[1];
  if (!shortcode) {
    return input;
  }

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

  return map[shortcode.toLowerCase()] || input;
}

export default reactionTool;
