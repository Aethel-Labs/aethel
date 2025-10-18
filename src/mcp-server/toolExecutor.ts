import { Message } from 'discord.js';
import BotClient from '../services/Client.js';
import { mcpClient, MCPToolResult } from './client.js';
import logger from '../utils/logger.js';

export interface MessageToolCall {
  name: string;
  args: Record<string, unknown>;
}

export async function executeMessageToolCall(
  toolCall: MessageToolCall,
  message: Message,
  client: BotClient,
  opts?: { originalMessage?: Message; botMessage?: Message },
): Promise<{
  success: boolean;
  type: string;
  handled: boolean;
  error?: string;
  result?: MCPToolResult;
}> {
  const name = (toolCall.name || '').toLowerCase();

  try {
    if (!mcpClient.isReady()) {
      await mcpClient.connect();
    }
    const result = await mcpClient.executeTool(name, toolCall.args || {});

    if (name === 'reaction') {
      return await handleReactionTool(result, message, client, opts);
    }

    if (name === 'newmessage') {
      return {
        success: true,
        type: 'newmessage',
        handled: true,
        result,
      };
    }

    return {
      success: true,
      type: name,
      handled: true,
      result,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[MCP Tool Executor] Error executing tool ${name}:`, errorMessage);

    return {
      success: false,
      type: name,
      handled: false,
      error: errorMessage,
    };
  }
}

async function handleReactionTool(
  result: MCPToolResult,
  message: Message,
  client: BotClient,
  opts?: { originalMessage?: Message; botMessage?: Message },
): Promise<{
  success: boolean;
  type: string;
  handled: boolean;
  error?: string;
  result?: MCPToolResult;
}> {
  try {
    const emoji = result.metadata.emoji as string;
    const target = (result.metadata.target as string) || 'user';

    if (!emoji) {
      return {
        success: false,
        type: 'reaction',
        handled: false,
        error: 'Missing emoji',
        result,
      };
    }

    const normalizedEmoji = normalizeEmoji(emoji);

    let targetMsg: Message = message;
    if (target === 'user' && opts?.originalMessage) {
      targetMsg = opts.originalMessage;
    } else if (target === 'bot' && opts?.botMessage) {
      targetMsg = opts.botMessage;
    }

    await targetMsg.react(normalizedEmoji);

    return {
      success: true,
      type: 'reaction',
      handled: true,
      result,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[MCP Tool Executor] Reaction tool failed:', errorMessage);

    return {
      success: false,
      type: 'reaction',
      handled: false,
      error: errorMessage,
      result,
    };
  }
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

mcpClient.connect().catch((error) => {
  logger.error('[MCP Tool Executor] Failed to initialize MCP client:', error);
});
