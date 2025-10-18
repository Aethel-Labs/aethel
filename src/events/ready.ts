import BotClient from '@/services/Client';
import logger from '@/utils/logger';
import { loadActiveReminders } from '@/commands/utilities/remind';

export default class ReadyEvent {
  private startTime: number;

  constructor(c: BotClient, startTime: number = Date.now()) {
    this.startTime = startTime;
    c.once('clientReady', () => this.readyEvent(c));
  }

  private async readyEvent(client: BotClient) {
    try {
      logger.info(`Logged in as ${client.user?.username}`);
      await client.application?.commands.fetch({ withLocalizations: true });
      await loadActiveReminders(client);

      const { sendDeploymentNotification } = await import('../utils/sendDeploymentNotification.js');
      await sendDeploymentNotification(this.startTime);
    } catch (error) {
      logger.error('Error during ready event:', error);
    }
  }
}
