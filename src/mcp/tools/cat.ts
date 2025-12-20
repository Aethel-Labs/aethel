import fetch from 'node-fetch';
import logger from '@/utils/logger';
import { formatToolResponse, ToolDefinition } from '@/types/tools';

const catTool: ToolDefinition = {
  name: 'cat',
  description: 'Fetch a random cat image.',
  async handler() {
    try {
      const res = await fetch('https://api.pur.cat/random-cat');
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      const data = (await res.json()) as { url: string; title?: string; subreddit?: string };
      return formatToolResponse(`Here's a cute cat for you! 🐱\n\nImage URL: ${data.url}`, {
        type: 'cat',
        url: data.url,
        title: data.title,
        subreddit: data.subreddit,
        source: 'pur.cat',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in cat tool:', error);
      throw new Error(`Failed to fetch cat image: ${errorMessage}`);
    }
  },
};

export default catTool;
