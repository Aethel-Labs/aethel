import { Message } from 'discord.js';
import BotClient from '@/services/Client';
import logger from '@/utils/logger';
import { invokeTool, getTool } from '@/mcp/registry';
import type { ToolResult, ToolContext } from '@/types/tools';

export interface MessageToolCall {
  name: string;
  args: Record<string, unknown>;
}

export type { ToolResult };

const SPECIAL_TOOLS = new Set(['reaction', 'newmessage']);

async function executeSpecialTool(
  name: string,
  args: Record<string, unknown>,
  message: Message,
  _client: BotClient,
  opts?: { originalMessage?: Message; botMessage?: Message },
): Promise<ToolResult> {
  if (name === 'newmessage') {
    return {
      content: [],
      metadata: {
        type: 'newmessage',
        success: true,
        handled: true,
        isSystem: false,
      },
    };
  }

  if (name === 'reaction') {
    const context: ToolContext = {
      message,
      client: _client,
      originalMessage: opts?.originalMessage,
      botMessage: opts?.botMessage,
    };
    return invokeTool('reaction', args, context);
  }

  throw new Error(`Unknown special tool: ${name}`);
}

export async function executeMessageToolCall(
  toolCall: MessageToolCall,
  message: Message,
  _client: BotClient,
  _opts?: { originalMessage?: Message; botMessage?: Message },
): Promise<{
  success: boolean;
  type: string;
  handled: boolean;
  error?: string;
  result?: ToolResult;
}> {
  const name = (toolCall.name || '').toLowerCase();

  try {
    let result: ToolResult;

    if (SPECIAL_TOOLS.has(name)) {
      result = await executeSpecialTool(name, toolCall.args || {}, message, _client, _opts);
    } else {
      const tool = getTool(name);
      if (!tool) {
        return {
          success: false,
          type: 'error',
          handled: false,
          error: `Tool '${name}' not found`,
        };
      }

      const context: ToolContext = {
        message,
        client: _client,
        originalMessage: _opts?.originalMessage,
        botMessage: _opts?.botMessage,
      };

      result = await invokeTool(name, toolCall.args || {}, context);
    }

    return {
      success: true,
      type: result.metadata.type || name,
      handled: true,
      result,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error in executeMessageToolCall for ${name}:`, error);
    return {
      success: false,
      type: 'error',
      handled: true,
      error: errorMessage,
    };
  }
}
