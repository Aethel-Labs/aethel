import fetch from 'node-fetch';
import logger from '@/utils/logger';
import { formatToolResponse, ToolDefinition } from '@/types/tools';

const dogTool: ToolDefinition = {
  name: 'dog',
  description: 'Fetch a random dog image.',
  async handler() {
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      };

      const res = await fetch('https://api.erm.dog/random-dog', { headers });
      if (!res.ok) throw new Error(`API request failed with status ${res.status}`);

      const data = (await res.json()) as { url: string; title?: string; subreddit?: string };

      if (!data || !data.url) {
        throw new Error('Invalid response format from dog API');
      }

      return formatToolResponse(`Here's a cute dog for you! 🐶\n\nImage URL: ${data.url}`, {
        type: 'dog',
        url: data.url,
        title: data.title || 'Random Dog',
        subreddit: data.subreddit || 'dogpictures',
        source: 'erm.dog',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in dog tool:', error);
      throw new Error(`Failed to fetch dog image: ${errorMessage}`);
    }
  },
};

export default dogTool;
