import { CommandInteraction } from 'discord.js';
import logger from '@/utils/logger';
import BotClient from '@/services/Client';

export interface ErrorHandlerOptions {
  interaction: CommandInteraction;
  client: BotClient;
  error: Error;
  commandName: string;
  userId?: string;
  username?: string;
  customMessage?: string;
}

export async function handleCommandError(options: ErrorHandlerOptions): Promise<void> {
  const { interaction, client, error, commandName, userId, username, customMessage } = options;

  const userInfo = userId && username ? `${username} (${userId})` : interaction.user.tag;
  logger.error(`Error in ${commandName} command for user ${userInfo}: ${error.message}`);

  const errorMessage = customMessage || (await client.getLocaleText('error', interaction.locale));

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: errorMessage,
      });
    } else {
      await interaction.reply({
        content: errorMessage,
        ephemeral: true,
      });
    }
  } catch (replyError) {
    logger.error(`Failed to send error message for ${commandName} command: ${replyError}`);
  }
}

export function createErrorHandler(commandName: string) {
  return async (options: Omit<ErrorHandlerOptions, 'commandName'>) => {
    return handleCommandError({ ...options, commandName });
  };
}
