import fetch from 'node-fetch';
import logger from '@/utils/logger';

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface TavilySearchResponse {
  answer?: string;
  query: string;
  results?: TavilyResult[];
  follow_up_questions?: string[];
}

interface TavilyOptions {
  maxResults?: number;
  includeImages?: boolean;
}

export async function searchTavily(
  query: string,
  { maxResults = 5, includeImages = false }: TavilyOptions = {},
): Promise<TavilySearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error('Tavily API key is not configured');
  }

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: Math.max(1, Math.min(maxResults, 10)),
        include_images: includeImages,
        include_answer: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Tavily API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as TavilySearchResponse;
    return data;
  } catch (error) {
    logger.error('Error calling Tavily API:', error);
    throw new Error(
      `Failed to search Tavily: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
