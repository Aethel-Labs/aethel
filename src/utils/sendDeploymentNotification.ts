import { WebhookClient } from 'discord.js';
import { execSync } from 'child_process';
import logger from './logger';

function getGitInfo() {
  try {
    const commitHash =
      process.env.SOURCE_COMMIT || execSync('git rev-parse HEAD').toString().trim();
    const commitMessage = execSync('git log -1 --pretty=%B').toString().trim();
    const branch =
      process.env.GIT_BRANCH ||
      process.env.VERCEL_GIT_COMMIT_REF ||
      process.env.COOLIFY_BRANCH ||
      execSync('git rev-parse --abbrev-ref HEAD').toString().trim();

    return {
      commitHash: commitHash.substring(0, 7),
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
