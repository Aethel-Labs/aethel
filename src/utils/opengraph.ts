import ogs from 'open-graph-scraper';
import logger from './logger';

export interface OpenGraphData {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  siteName?: string;
  type?: string;
}

const URL_REGEX =
  /https?:\/\/[^\s<>]+|(?:www\.)?[a-zA-Z0-9][-a-zA-Z0-9]*[a-zA-Z0-9]*\.(?:com|org|net|edu|gov|mil|int|xyz|io|co|me|ly|app|dev|tech|info|biz|name|tv|cc|uk|de|fr|jp|cn|au|us|ca|nl|be|it|es|ru|in|br|mx|ch|se|no|dk|fi|pl|cz|hu|ro|bg|hr|sk|si|ee|lv|lt|gr|pt|ie|at|lu)\b(?:\/[^\s<>]*)?/g;
const CACHE_TTL = 24 * 60 * 60 * 1000;
const cache = new Map<string, { data: OpenGraphData | null; timestamp: number }>();

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  if (!matches) return [];

  return matches
    .map((url) => {
      let cleanUrl = url.replace(/[.,;:!?)\]}>'"]*$/, '');

      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = 'https://' + cleanUrl;
      }

      return cleanUrl;
    })
    .filter((url) => {
      try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();
        const skipDomains = ['t.co', 'bit.ly', 'tinyurl.com', 'is.gd', 'localhost'];

        if (!hostname.includes('.') || hostname.endsWith('.') || hostname.startsWith('.')) {
          return false;
        }

        return !skipDomains.includes(hostname) && ['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    })
    .slice(0, 3);
}

export async function fetchOpenGraphData(url: string): Promise<OpenGraphData | null> {
  try {
    const cached = cache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    const options = {
      url: url,
      timeout: 5000,
      fetchOptions: {
        headers: {
          'User-Agent': 'Aethel/2.0 (+https://aethel.xyz)',
        },
      },
    };

    const { error, result } = await ogs(options);

    if (error || !result) {
      cache.set(url, { data: null, timestamp: Date.now() });
      return null;
    }

    let imageUrl = result.ogImage?.[0]?.url || result.twitterImage?.[0]?.url || result.favicon;

    if (imageUrl && !isValidImageUrl(imageUrl)) {
      imageUrl = undefined;
    }

    const ogData: OpenGraphData = {
      title: result.ogTitle || result.twitterTitle || result.dcTitle,
      description: result.ogDescription || result.twitterDescription || result.dcDescription,
      image: imageUrl,
      url: result.ogUrl || result.twitterUrl || url,
      siteName: result.ogSiteName || result.twitterSite,
      type: result.ogType || 'website',
    };

    if (!ogData.title && !ogData.description && !ogData.image) {
      cache.set(url, { data: null, timestamp: Date.now() });
      return null;
    }

    cache.set(url, { data: ogData, timestamp: Date.now() });

    logger.debug(`Fetched OpenGraph data for ${url}:`, ogData);
    return ogData;
  } catch (error) {
    logger.warn(`Failed to fetch OpenGraph data for ${url}:`, error);
    cache.set(url, { data: null, timestamp: Date.now() });
    return null;
  }
}

export async function extractFirstUrlMetadata(text: string): Promise<OpenGraphData | null> {
  const urls = extractUrls(text);
  if (urls.length === 0) return null;

  return await fetchOpenGraphData(urls[0]);
}

export function cleanupCache(): void {
  const now = Date.now();
  for (const [url, cached] of cache.entries()) {
    if (now - cached.timestamp > CACHE_TTL) {
      cache.delete(url);
    }
  }
}

function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

setInterval(cleanupCache, 60 * 60 * 1000);
