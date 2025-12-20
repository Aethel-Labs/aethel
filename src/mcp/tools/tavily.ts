import logger from '@/utils/logger';
import { formatToolResponse, ToolDefinition } from '@/types/tools';
import { searchTavily } from '@/utils/tavily';

const tavilyTool: ToolDefinition = {
  name: 'tavily',
  description: 'Perform web search using Tavily for fresh information.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query or topic to look up',
      },
      max_results: {
        type: 'integer',
        minimum: 1,
        maximum: 10,
        description: 'Maximum number of search results (default 5)',
      },
      include_images: {
        type: 'boolean',
        description: 'Whether to include image metadata',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  async handler(args) {
    const query = (args.query as string) || (args.search as string);
    if (!query || typeof query !== 'string') {
      throw new Error('Query is required for Tavily search');
    }

    const maxResultsRaw = args.max_results ?? args.maxResults;
    const maxResults =
      typeof maxResultsRaw === 'number'
        ? maxResultsRaw
        : parseInt(String(maxResultsRaw ?? 5), 10) || 5;
    const includeImages = Boolean(args.include_images ?? args.includeImages ?? false);

    try {
      const result = await searchTavily(query, {
        maxResults: Math.max(1, Math.min(maxResults, 10)),
        includeImages,
      });

      const entries = result.results ?? [];
      const summary =
        result.answer ||
        (entries.length > 0
          ? entries
              .slice(0, 3)
              .map((entry, idx) => `${idx + 1}. ${entry.title}\n${entry.content}\n${entry.url}`)
              .join('\n\n')
          : 'No results available.');

      return formatToolResponse(summary, {
        type: 'tavily',
        query,
        answer: result.answer,
        citations: entries.map((entry) => ({
          title: entry.title,
          url: entry.url,
          score: entry.score,
        })),
        follow_up_questions: result.follow_up_questions,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error executing Tavily tool:', error);
      throw new Error(`Failed to search Tavily: ${errorMessage}`);
    }
  },
};

export default tavilyTool;
