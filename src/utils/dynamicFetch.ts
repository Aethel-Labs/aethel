import logger from './logger';

interface FetchOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

class FetchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly statusText?: string,
    public readonly url?: string
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

const defaultOptions: FetchOptions = {
  timeout: 10000,
  retries: 3,
  retryDelay: 1000,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetch = async (url: string | URL, init?: RequestInit & FetchOptions): Promise<Response> => {
  const { timeout, retries = 3, retryDelay = 1000, ...fetchInit } = { ...defaultOptions, ...init };

  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;

  if (timeout) {
    timeoutId = setTimeout(() => controller.abort(), timeout);
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const nodeFetch = await import('node-fetch');

      const response = await nodeFetch.default(url, {
        ...fetchInit,
        signal: controller.signal,
      } as import('node-fetch').RequestInit);

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      logger.debug('HTTP request successful', {
        url: url.toString(),
        status: response.status,
        attempt: attempt + 1,
      });

      return response as unknown as Response;
    } catch (error) {
      lastError = error as Error;

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          throw new FetchError(
            `Request timeout after ${timeout}ms`,
            undefined,
            undefined,
            url.toString()
          );
        }

        if (
          'status' in error &&
          typeof error.status === 'number' &&
          error.status >= 400 &&
          error.status < 500
        ) {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          throw new FetchError(
            `Client error: ${error.message}`,
            error.status,
            'statusText' in error ? (error.statusText as string) : undefined,
            url.toString()
          );
        }
      }

      if (attempt < retries) {
        logger.warn('HTTP request failed, retrying', {
          url: url.toString(),
          attempt: attempt + 1,
          maxRetries: retries,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        await sleep(retryDelay * (attempt + 1));
      }
    }
  }

  clearTimeout(timeoutId);

  logger.error('HTTP request failed after all retries', {
    url: url.toString(),
    retries,
    error: lastError?.message || 'Unknown error',
  });

  throw new FetchError(
    `Request failed after ${retries + 1} attempts: ${lastError?.message || 'Unknown error'}`,
    undefined,
    undefined,
    url.toString()
  );
};

export default fetch;
