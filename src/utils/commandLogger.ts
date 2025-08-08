import logger from './logger';
import { CommandInteraction } from 'discord.js';

export interface CommandLogOptions {
  commandName: string;
  additionalInfo?: string;
  isGuild?: boolean;
  isDM?: boolean;
}

export function logUserAction(options: CommandLogOptions): void {
  const { commandName, isGuild, isDM, additionalInfo } = options;

  let logMessage = `User executed ${commandName} command`;

  if (isGuild) {
    logMessage += ` in guild`;
  } else if (isDM) {
    logMessage += ` in DM`;
  }

  if (additionalInfo) {
    logMessage += ` with ${additionalInfo}`;
  }

  logger.info(logMessage);
}

export function logUserActionFromInteraction(
  interaction: CommandInteraction,
  commandName: string,
  additionalInfo?: string,
): void {
  logUserAction({
    commandName,
    isGuild: !!interaction.guildId,
    isDM: !interaction.guildId,
    additionalInfo,
  });
}

export function createCommandLogger(commandName: string) {
  return {
    logAction: (options: Omit<CommandLogOptions, 'commandName'>) => {
      logUserAction({ ...options, commandName });
    },
    logFromInteraction: (interaction: CommandInteraction, additionalInfo?: string) => {
      logUserActionFromInteraction(interaction, commandName, additionalInfo);
    },
  };
}
