import fetch from 'node-fetch';
import logger from '@/utils/logger';
import { invokeTool as invokeLocalTool, listTools } from '@/mcp/registry';
import type { ToolContext, ToolResult } from '@/types/tools';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL?.replace(/\/$/, '');

export class McpClient {
  constructor(private remoteUrl?: string | undefined) {}

  private canUseRemote(context: ToolContext): boolean {
    if (!this.remoteUrl) return false;
    return !context.message && !context.botMessage && !context.originalMessage;
  }

  async listTools() {
    if (!this.remoteUrl) {
      return listTools();
    }

    try {
      const res = await fetch(`${this.remoteUrl}/tools`);
      if (!res.ok) {
        throw new Error(`Remote MCP error: ${res.status}`);
      }
      const data = (await res.json()) as { tools: unknown };
      return data.tools;
    } catch (error) {
      logger.warn('Failed to fetch remote MCP tools, falling back to local registry', error);
      return listTools();
    }
  }

  async invoke(
    name: string,
    args: Record<string, unknown> = {},
    context: ToolContext = {},
  ): Promise<ToolResult> {
    const toolName = name.trim().toLowerCase();
    if (this.canUseRemote(context)) {
      try {
        const res = await fetch(`${this.remoteUrl}/tools/${encodeURIComponent(toolName)}/invoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ args }),
        });

        if (!res.ok) {
          throw new Error(`Remote MCP invoke error: ${res.status}`);
        }

        const data = (await res.json()) as { result: ToolResult };
        return data.result;
      } catch (error) {
        logger.warn('Remote MCP invoke failed, falling back to local tool', {
          tool: toolName,
          error,
        });
      }
    }

    return invokeLocalTool(toolName, args, context);
  }
}

export const mcpClient = new McpClient(MCP_SERVER_URL);
