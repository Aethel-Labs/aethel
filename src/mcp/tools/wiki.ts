import fetch from 'node-fetch';
import logger from '@/utils/logger';
import { formatToolResponse, ToolDefinition } from '@/types/tools';

interface WikipediaSummary {
  title: string;
  extract: string;
  content_urls?: {
    desktop?: {
      page: string;
    };
  };
}

const wikiTool: ToolDefinition = {
  name: 'wiki',
  description: 'Search Wikipedia and return an article summary.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query or page title',
      },
    },
    required: ['query'],
  },
  async handler(args) {
    const query = (args.query as string) || (args.search as string);
    if (!query || typeof query !== 'string') {
      throw new Error('Query is required for wiki tool');
    }

    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`Wikipedia API error: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as WikipediaSummary;
      const title = data.title || query;
      const extract = data.extract || 'No summary available.';
      const pageUrl =
        data.content_urls?.desktop?.page ||
        `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

      return formatToolResponse(`${title}\n\n${extract}\n\nSource: ${pageUrl}`, {
        type: 'wiki',
        title,
        extract,
        url: pageUrl,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in wiki tool:', error);
      throw new Error(`Failed to search Wikipedia: ${errorMessage}`);
    }
  },
};

export default wikiTool;
