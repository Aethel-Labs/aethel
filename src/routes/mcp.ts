import { Router } from 'express';
import { listTools, invokeTool } from '@/mcp/registry';
import logger from '@/utils/logger';

const router = Router();

router.get('/tools', (_req, res) => {
  const tools = listTools();
  res.json({ tools });
});

router.post('/tools/:name/invoke', async (req, res) => {
  const toolName = req.params.name;
  const args = (req.body && typeof req.body === 'object' ? req.body.args : undefined) || {};

  try {
    const result = await invokeTool(toolName, args, {});
    res.json({ result });
  } catch (error) {
    logger.warn('MCP invoke failed', { tool: toolName, error });
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

export default router;
