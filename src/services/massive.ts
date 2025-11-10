import {
  DefaultApi,
  GetStocksAggregatesSortEnum,
  GetStocksAggregatesTimespanEnum,
  GetStocksSnapshotTicker200Response,
  GetStocksSnapshotTicker200ResponseAllOfTicker,
  GetTicker200Response,
  GetTicker200ResponseResults,
  GetStocksAggregates200Response,
  ListTickers200Response,
  ListTickers200ResponseResultsInner,
  ListTickersMarketEnum,
  ListTickersOrderEnum,
  ListTickersSortEnum,
  restClient,
} from '@massive.com/client-js';
import * as config from '@/config';
import logger from '@/utils/logger';
import { createRateLimiter } from '@/utils/rateLimiter';
import type { AxiosError } from 'axios';

const MASSIVE_RATE_LIMIT = 45;
const rateLimiter = createRateLimiter(MASSIVE_RATE_LIMIT);

let cachedClient: DefaultApi | null = null;

export type StockTimeframe = '1d' | '5d' | '1m' | '3m' | '1y';

interface TimeframeConfig {
  multiplier: number;
  timespan: GetStocksAggregatesTimespanEnum;
  daysBack: number;
  limit: number;
  displayWindowMs?: number;
}

const TIMEFRAME_CONFIG: Record<StockTimeframe, TimeframeConfig> = {
  '1d': {
    multiplier: 5,
    timespan: GetStocksAggregatesTimespanEnum.Minute,
    daysBack: 3,
    limit: 400,
    displayWindowMs: 36 * 60 * 60 * 1000,
  },
  '5d': {
    multiplier: 15,
    timespan: GetStocksAggregatesTimespanEnum.Minute,
    daysBack: 7,
    limit: 500,
    displayWindowMs: 7 * 24 * 60 * 60 * 1000,
  },
  '1m': {
    multiplier: 1,
    timespan: GetStocksAggregatesTimespanEnum.Day,
    daysBack: 40,
    limit: 120,
  },
  '3m': {
    multiplier: 1,
    timespan: GetStocksAggregatesTimespanEnum.Day,
    daysBack: 110,
    limit: 200,
  },
  '1y': {
    multiplier: 1,
    timespan: GetStocksAggregatesTimespanEnum.Week,
    daysBack: 400,
    limit: 400,
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StockAggregatePoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
}

export interface StockOverview {
  detail?: GetTicker200ResponseResults;
  snapshot?: GetStocksSnapshotTicker200ResponseAllOfTicker;
}

function ensureClient(): DefaultApi {
  if (!config.MASSIVE_API_KEY) {
    throw new Error('Massive.com API key is not configured');
  }

  if (!cachedClient) {
    cachedClient = restClient(config.MASSIVE_API_KEY, config.MASSIVE_API_BASE_URL, {
      pagination: false,
    });
  }

  return cachedClient;
}

async function withClient<T>(callback: (client: DefaultApi) => Promise<T>): Promise<T> {
  const client = ensureClient();
  return rateLimiter.schedule(() => callback(client));
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isAxiosError' in error &&
    (error as AxiosError).response?.status === 404
  );
}

export async function searchTickers(
  query: string,
  limit = 5,
): Promise<ListTickers200ResponseResultsInner[]> {
  if (!query.trim()) {
    return [];
  }

  const response = await withClient((client) =>
    client.listTickers(
      undefined,
      undefined,
      ListTickersMarketEnum.Stocks,
      undefined,
      undefined,
      undefined,
      undefined,
      query,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      ListTickersOrderEnum.Asc,
      limit,
      ListTickersSortEnum.Ticker,
    ),
  );

  return response.results ?? [];
}

export async function getTickerDetails(
  ticker: string,
): Promise<GetTicker200ResponseResults | null> {
  const normalized = ticker.trim().toUpperCase();
  try {
    const response = await withClient((client) => client.getTicker(normalized));
    return response.results ?? null;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function getTickerSnapshot(
  ticker: string,
): Promise<GetStocksSnapshotTicker200ResponseAllOfTicker | undefined> {
  const normalized = ticker.trim().toUpperCase();
  try {
    const response: GetStocksSnapshotTicker200Response = await withClient((client) =>
      client.getStocksSnapshotTicker(normalized),
    );
    return response.ticker;
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function getTickerOverview(ticker: string): Promise<StockOverview> {
  const [detail, snapshot] = await Promise.all([
    getTickerDetails(ticker),
    getTickerSnapshot(ticker),
  ]);

  return { detail: detail ?? undefined, snapshot };
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export async function getAggregateSeries(
  ticker: string,
  timeframe: StockTimeframe,
): Promise<StockAggregatePoint[]> {
  const config = TIMEFRAME_CONFIG[timeframe];
  if (!config) {
    throw new Error(`Unsupported timeframe: ${timeframe}`);
  }

  const now = new Date();
  const fetchAggregates = async (extraDays: number) => {
    const fromDate = new Date(now.getTime() - (config.daysBack + extraDays) * DAY_MS);
    return withClient((client) =>
      client.getStocksAggregates(
        ticker.trim().toUpperCase(),
        config.multiplier,
        config.timespan,
        formatDate(fromDate),
        formatDate(now),
        true,
        GetStocksAggregatesSortEnum.Asc,
        config.limit,
      ),
    );
  };

  try {
    let response: GetStocksAggregates200Response = await fetchAggregates(0);

    if ((!response.results || response.results.length === 0) && timeframe === '1d') {
      response = await fetchAggregates(5);
    }

    const rawResults = response.results ?? [];
    if (!rawResults.length) {
      return [];
    }

    let filteredResults = rawResults.filter(
      (result) => typeof result.t === 'number' && typeof result.c === 'number',
    );

    if (config.displayWindowMs && filteredResults.length) {
      const latestTimestamp = filteredResults[filteredResults.length - 1].t!;
      const cutoff = latestTimestamp - config.displayWindowMs;
      filteredResults = filteredResults.filter((result) => result.t! >= cutoff);
    }

    return filteredResults.map((result) => ({
      timestamp: result.t!,
      open: result.o ?? result.c ?? 0,
      high: result.h ?? result.c ?? 0,
      low: result.l ?? result.c ?? 0,
      close: result.c ?? 0,
      volume: result.v ?? 0,
      vwap: result.vw,
    }));
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new Error('STOCKS_TICKER_NOT_FOUND');
    }
    throw error;
  }
}

export function buildBrandingUrl(url?: string): string | undefined {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('apiKey') && config.MASSIVE_API_KEY) {
      parsed.searchParams.set('apiKey', config.MASSIVE_API_KEY);
    }
    return parsed.toString();
  } catch (error) {
    logger.warn('Failed to parse branding URL', { url, error });
    return undefined;
  }
}

export function sanitizeTickerInput(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, '')
    .slice(0, 12);
}
