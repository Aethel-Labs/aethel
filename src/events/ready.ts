import BotClient from '@/services/Client';
import logger from '@/utils/logger';
import { loadActiveReminders } from '@/commands/utilities/remind';

export default class ReadyEvent {
  constructor(c: BotClient) {
    c.once('ready', () => this.readyEvent(c));
  }

  private async readyEvent(client: BotClient) {
    try {
      logger.info(`Logged in as ${client.user?.username}`);
      await client.application?.commands.fetch({ withLocalizations: true });

      await loadActiveReminders(client);
    } catch (error) {
      logger.error('Error during ready event:', error);
    }
  }
}
