import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import logger from '../utils/logger.js';

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string };
  }>;
  metadata: Record<string, unknown>;
}

export class MCPToolClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private isConnected = false;

  async connect(): Promise<void> {
    if (this.isConnected) return;

    try {
      this.transport = new StdioClientTransport({
        command: 'bun',
        args: ['run', 'src/mcp-server/index.ts'],
      });
      this.client = new Client(
        {
          name: 'aethel-discord-bot',
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
          },
        },
      );

      await this.client.connect(this.transport);
      this.isConnected = true;

      logger.info('[MCP Client] Connected to MCP server');
    } catch (error) {
      logger.error('[MCP Client] Failed to connect:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.client) return;

    try {
      await this.client.close();
      this.isConnected = false;
      logger.info('[MCP Client] Disconnected from MCP server');
    } catch (error) {
      logger.error('[MCP Client] Error during disconnect:', error);
    }
  }

  async executeTool(name: string, args: Record<string, unknown> = {}): Promise<MCPToolResult> {
    if (!this.isConnected || !this.client) {
      throw new Error('MCP client not connected');
    }

    try {
      logger.debug(`[MCP Client] Executing tool: ${name}`, args);

      const result = await this.client.callTool({
        name,
        arguments: args,
      });

      logger.debug(`[MCP Client] Tool ${name} completed successfully`);

      return {
        content: result.content as Array<{
          type: 'text' | 'image_url';
          text?: string;
          image_url?: { url: string };
        }>,
        metadata: result.metadata as Record<string, unknown>,
      };
    } catch (error) {
      logger.error(`[MCP Client] Tool ${name} failed:`, error);
      throw error;
    }
  }

  async listTools(): Promise<Array<{ name: string; description: string }>> {
    if (!this.isConnected || !this.client) {
      throw new Error('MCP client not connected');
    }

    try {
      const result = await this.client.listTools();
      return result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description || 'No description available',
      }));
    } catch (error) {
      logger.error('[MCP Client] Failed to list tools:', error);
      throw error;
    }
  }

  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }
}

export const mcpClient = new MCPToolClient();
