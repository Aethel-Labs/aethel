import { WebhookClient } from 'discord.js';
import { execSync } from 'child_process';
import logger from './logger';

function getGitInfo() {
  try {
    try {
      execSync('git rev-parse --is-inside-work-tree');

      try {
        execSync('git remote get-url origin');
      } catch {
        execSync('git remote add origin https://github.com/aethel/aethel-labs');
      }

      try {
        execSync('git fetch --depth=100 origin');
      } catch (e) {
        logger.debug('git fetch failed or unnecessary; continuing', {
          error: (e as Error).message,
        });
      }
    } catch (e) {
      logger.debug('Not a git repository; initializing temporary repo for metadata', {
        error: (e as Error).message,
      });
      try {
        execSync('git init');
        try {
          execSync('git remote add origin https://github.com/aethel/aethel-labs');
        } catch (e) {
          logger.debug('origin remote already exists or cannot be added', {
            error: (e as Error).message,
          });
        }
        const sourceCommit = process.env.SOURCE_COMMIT;
        if (sourceCommit) {
          try {
            execSync(`git fetch --depth=1 origin ${sourceCommit}`);
          } catch (err) {
            logger.debug('Failed to fetch SOURCE_COMMIT from origin', {
              error: (err as Error).message,
            });
          }
        } else {
          try {
            const remoteHead = execSync('git ls-remote origin HEAD').toString().split('\t')[0];
            if (remoteHead) {
              execSync(`git fetch --depth=1 origin ${remoteHead}`);
              process.env.SOURCE_COMMIT = remoteHead;
            }
          } catch (err) {
            logger.debug('Failed to resolve remote HEAD', { error: (err as Error).message });
          }
        }
      } catch (err) {
        logger.debug('Failed to bootstrap temporary git repo', { error: (err as Error).message });
      }
    }

    let commitHash: string | null = null;
    try {
      commitHash = process.env.SOURCE_COMMIT || execSync('git rev-parse HEAD').toString().trim();
    } catch {
      try {
        const remoteHead = execSync('git ls-remote origin HEAD').toString().split('\t')[0];
        commitHash = remoteHead || null;
      } catch (e) {
        logger.debug('Failed to resolve remote HEAD for commit hash', {
          error: (e as Error).message,
        });
      }
    }

    const shortHash = commitHash ? commitHash.substring(0, 7) : 'unknown';
    let commitMessage = 'No commit message';
    try {
      commitMessage = commitHash
        ? execSync(`git log -1 --pretty=%B ${commitHash}`).toString().trim()
        : commitMessage;
    } catch (e) {
      logger.debug('Failed to resolve commit message', { error: (e as Error).message });
    }
    const branch =
      process.env.GIT_BRANCH ||
      process.env.VERCEL_GIT_COMMIT_REF ||
      process.env.COOLIFY_BRANCH ||
      (() => {
        try {
          return execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
        } catch (e) {
          logger.debug('Failed to resolve branch', { error: (e as Error).message });
          return 'unknown';
        }
      })();

    return {
      commitHash: shortHash,
      commitMessage,
      branch,
    };
  } catch (error) {
    logger.warn('Failed to get git info:', error);
    return {
      commitHash: 'unknown',
      commitMessage: 'No commit message',
      branch: 'unknown',
    };
  }
}

export async function sendDeploymentNotification(startTime: number) {
  const webhookUrl = process.env.DEPLOYMENT_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn('DEPLOYMENT_WEBHOOK_URL not set, skipping deployment notification');
    return;
  }

  try {
    const webhook = new WebhookClient({ url: webhookUrl });
    const deploymentTime = Date.now() - startTime;
    const seconds = (deploymentTime / 1000).toFixed(2);

    const { commitHash, commitMessage, branch } = getGitInfo();

    await webhook.send({
      embeds: [
        {
          title: '<:check:942538737332662282> Aethel was deployed successfully',
          color: 0xf4f4f4,
          fields: [
            {
              name: '<:development:1269783674782748775> Branch',
              value: branch,
              inline: true,
            },
            {
              name: '<:4_:1387343665264853092> Commit',
              value: `\`${commitHash}\``,
              inline: true,
            },
            {
              name: '<a:Time:1186795135263051847> Deployment Time',
              value: `${seconds}s`,
              inline: true,
            },
            {
              name: '<:github:1371987360044159016> Commit Message',
              value:
                commitMessage.length > 100
                  ? `${commitMessage.substring(0, 100)}...`
                  : commitMessage,
            },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    });

    logger.info('Deployment notification sent successfully');
  } catch (error) {
    logger.error('Failed to send deployment notification:', error);
  }
}
