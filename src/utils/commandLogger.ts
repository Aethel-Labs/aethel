import logger from './logger';
import { CommandInteraction } from 'discord.js';

export interface CommandLogOptions {
  commandName: string;
  userId: string;
  username: string;
  additionalInfo?: string;
  guildId?: string;
  channelId?: string;
}

export function logUserAction(options: CommandLogOptions): void {
  const { commandName, userId, username, guildId, channelId } = options;

  let logMessage = `User ${username} (${userId}) used ${commandName} command`;

  if (guildId) {
    logMessage += ` in guild ${guildId}`;
  }

  if (channelId) {
    logMessage += ` in channel ${channelId}`;
  }

  logger.info(logMessage);
}

export function logUserActionFromInteraction(
  interaction: CommandInteraction,
  commandName: string,
  additionalInfo?: string
): void {
  logUserAction({
    commandName,
    userId: interaction.user.id,
    username: interaction.user.tag,
    guildId: interaction.guildId || undefined,
    channelId: interaction.channelId,
  });
}

export function createCommandLogger(commandName: string) {
  return {
    logAction: (options: Omit<CommandLogOptions, 'commandName'>) => {
      logUserAction({ ...options, commandName });
    },
    logFromInteraction: (interaction: CommandInteraction, additionalInfo?: string) => {
      logUserActionFromInteraction(interaction, commandName);
    },
  };
}
