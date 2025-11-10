type RateLimitedTask<T> = () => Promise<T> | T;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createRateLimiter(limitPerSecond: number) {
  const minDelay = Math.ceil(1000 / Math.max(1, limitPerSecond));
  let lastRun = 0;
  let chain: Promise<void> = Promise.resolve();

  const schedule = async <T>(task: RateLimitedTask<T>): Promise<T> => {
    const execute = chain.then(async () => {
      const elapsed = Date.now() - lastRun;
      const waitTime = lastRun === 0 ? 0 : Math.max(0, minDelay - elapsed);
      if (waitTime > 0) {
        await sleep(waitTime);
      }

      const result = await task();
      lastRun = Date.now();
      return result;
    });

    chain = execute.then(
      () => undefined,
      () => undefined,
    );
    return execute;
  };

  return { schedule };
}
