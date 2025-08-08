import { exec } from 'child_process';
import { promisify } from 'util';
import logger from './logger';

const execAsync = promisify(exec);

let cachedCommitHash: string | null = null;
let isInitialized = false;

function getGitCommitHashSync(): string {
  if (process.env.SOURCE_COMMIT) {
    return process.env.SOURCE_COMMIT.substring(0, 7);
  }

  return process.env.NODE_ENV === 'production' ? 'production' : 'development';
}

async function initializeGitCommitHash(): Promise<void> {
  if (isInitialized) return;

  try {
    if (process.env.SOURCE_COMMIT) {
      cachedCommitHash = process.env.SOURCE_COMMIT.substring(0, 7);
    } else {
      const { stdout } = await execAsync('git rev-parse --short HEAD');
      cachedCommitHash = stdout.trim();
    }

    logger.debug('Git commit hash initialized', { hash: cachedCommitHash });
  } catch (error) {
    logger.warn('Failed to get git commit hash, using fallback', { error });
    cachedCommitHash = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  } finally {
    isInitialized = true;
  }
}

function getGitCommitHash(): string {
  return cachedCommitHash || getGitCommitHashSync();
}

initializeGitCommitHash().catch((error) => {
  console.warn('Failed to initialize git commit hash:', error.message);
});

export default getGitCommitHash;
