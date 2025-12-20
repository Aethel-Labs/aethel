import { ChatInputCommandInteraction, Message } from 'discord.js';
import BotClient from '@/services/Client';

export interface MessageToolCall {
  name: string;
  args: Record<string, unknown>;
}

export type ToolCall = MessageToolCall;

export type ToolContent =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image_url';
      image_url: {
        url: string;
        detail?: 'low' | 'high' | 'auto';
      };
    };

export interface ToolResult {
  content: ToolContent[];
  metadata: {
    type: string;
    url?: string;
    title?: string;
    subreddit?: string;
    source?: string;
    isSystem?: boolean;
    [key: string]: unknown;
  };
}

export interface ToolContext {
  message?: Message;
  client?: BotClient;
  originalMessage?: Message;
  botMessage?: Message;
  interaction?: ChatInputCommandInteraction;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  requiresMessage?: boolean;
}

export interface ToolDefinition extends ToolDescriptor {
  handler: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

export interface McpInvokeResponse {
  success: boolean;
  result?: ToolResult;
  error?: string;
}

export function formatToolResponse(
  content: string,
  metadata: Record<string, unknown> = {},
  showSystemMessage = true,
): ToolResult {
  const type = typeof metadata.type === 'string' ? (metadata.type as string) : 'tool_response';
  if (showSystemMessage) {
    return {
      content: [
        {
          type: 'text',
          text: `[SYSTEM] ${content}`,
        },
      ],
      metadata: {
        ...metadata,
        type,
        isSystem: true,
      },
    };
  }

  return {
    content: [],
    metadata: {
      ...metadata,
      type,
      isSystem: false,
    },
  };
}
