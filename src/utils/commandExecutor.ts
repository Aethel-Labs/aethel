import logger from '@/utils/logger';
import { invokeTool, getTool } from '@/mcp/registry';
import type { ToolResult, ToolContext } from '@/types/tools';
import { ChatInputCommandInteraction } from 'discord.js';
import BotClient from '@/services/Client';

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export function extractToolCalls(content: string): { cleanContent: string; toolCalls: ToolCall[] } {
  const toolCallRegex = /{([^{}\s:]+):({[^{}]*}|[^{}]*)?}/g;
  const toolCalls: ToolCall[] = [];
  let cleanContent = content;
  let match;

  while ((match = toolCallRegex.exec(content)) !== null) {
    try {
      if (!match[1]) {
        continue;
      }

      const toolName = match[1].trim();
      const argsString = match[2] ? match[2].trim() : '';

      if (!toolName) {
        continue;
      }

      let args: Record<string, unknown> = {};

      if (argsString.startsWith('{') && argsString.endsWith('}')) {
        try {
          args = JSON.parse(argsString);
        } catch (_error) {
          args = { query: argsString };
        }
      } else if (argsString) {
        if (argsString.startsWith('"') && argsString.endsWith('"')) {
          const unquoted = argsString.slice(1, -1);
          if (toolName === 'reaction') {
            args = { emoji: unquoted };
          } else {
            args = { query: unquoted };
          }
        } else {
          args = { query: argsString };
        }
      } else {
        args = {};
      }

      toolCalls.push({
        name: toolName,
        args,
      });

      cleanContent = cleanContent.replace(match[0], '').trim();
    } catch (error) {
      logger.error(`Error parsing tool call: ${error}`);
    }
  }

  return { cleanContent, toolCalls };
}

export async function executeToolCall(
  toolCall: ToolCall,
  interaction: ChatInputCommandInteraction,
  client: BotClient,
): Promise<string> {
  const name = (toolCall.name || '').toLowerCase();
  const args = toolCall.args || {};

  try {
    const tool = getTool(name);
    if (!tool) {
      return JSON.stringify({
        success: false,
        error: `Tool '${name}' not found in registry`,
        status: 404,
      });
    }

    // Create context for slash command execution
    const context: ToolContext = {
      interaction,
      client,
    };

    const result: ToolResult = await invokeTool(name, args, context);

    const metadata = result.metadata || {};
    const content = result.content;

    let textContent = '';
    if (Array.isArray(content)) {
      textContent = content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
    }

    return JSON.stringify({
      success: true,
      ...metadata,
      content: textContent || undefined,
      handled: true,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error executing tool '${name}':`, error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
      status: 500,
    });
  }
}
