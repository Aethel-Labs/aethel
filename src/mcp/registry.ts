import { ToolContext, ToolDefinition, ToolDescriptor, ToolResult } from '@/types/tools';
import logger from '@/utils/logger';
import catTool from '@/mcp/tools/cat';
import dogTool from '@/mcp/tools/dog';
import wikiTool from '@/mcp/tools/wiki';
import weatherTool from '@/mcp/tools/weather';
import tavilyTool from '@/mcp/tools/tavily';
import reactionTool from '@/mcp/tools/reaction';

const registry = new Map<string, ToolDefinition>();

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function registerTool(tool: ToolDefinition): void {
  const key = normalizeName(tool.name);
  registry.set(key, {
    ...tool,
    name: key,
  });
  logger.debug(`[MCP] Registered tool '${key}'`);
}

export function listTools(): ToolDescriptor[] {
  return Array.from(registry.values()).map(({ handler: _handler, ...rest }) => rest);
}

export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(normalizeName(name));
}

export async function invokeTool(
  name: string,
  args: Record<string, unknown> = {},
  context: ToolContext = {},
): Promise<ToolResult> {
  const tool = getTool(name);
  if (!tool) {
    throw new Error(`Tool '${name}' is not registered`);
  }

  return tool.handler(args, context);
}

function bootstrapTools() {
  registerTool(catTool);
  registerTool(dogTool);
  registerTool(wikiTool);
  registerTool(weatherTool);
  registerTool(tavilyTool);
  registerTool(reactionTool);
}

bootstrapTools();
