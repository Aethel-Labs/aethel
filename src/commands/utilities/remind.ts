import {
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  EmbedBuilder,
  MessageFlags,
  InteractionContextType,
  ApplicationIntegrationType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
} from 'discord.js';
import logger from '@/utils/logger';
import {
  sanitizeInput,
  validateTimeString,
  parseTimeString,
  formatTimeString,
} from '@/utils/validation';
import {
  saveReminder,
  completeReminder,
  cleanupReminders,
  ensureUserRegistered,
  DatabaseError,
} from '@/utils/reminderDb';
import { RemindCommandProps } from '@/types/command';
import BotClient from '@/services/Client';
import { createCommandLogger } from '@/utils/commandLogger';
import { createErrorHandler } from '@/utils/errorHandler';

interface Reminder {
  reminder_id: string;
  user_id: string;
  user_tag: string;
  channel_id: string;
  guild_id: string | null;
  message: string;
  expires_at: Date;
  created_at?: Date;
  locale: string;
  metadata?: {
    source: string;
    command_id?: string;
    original_message_id?: string;
    original_channel_id?: string;
    message_url?: string;
  };
}

interface ActiveReminder {
  timeoutId: NodeJS.Timeout;
  expiresAt: number;
}

interface MessageInfo {
  content: string;
  url: string;
  channelId: string;
  messageId: string;
  guildId: string | null;
  userTag: string;
  userId: string;
  locale: string;
}

const activeReminders = new Map<string, ActiveReminder>();
const commandLogger = createCommandLogger('remind');
const errorHandler = createErrorHandler('remind');

declare global {
  var _reminders: Map<string, MessageInfo>;
}

if (!global._reminders) global._reminders = new Map<string, MessageInfo>();

function createReminderHandler(client: BotClient, reminder: Reminder) {
  return async () => {
    try {
      const user = await client.users.fetch(reminder.user_id);
      if (!user) {
        logger.warn(`User ${reminder.user_id} not found for reminder ${reminder.reminder_id}`);
        return;
      }

      const minutes = Math.floor(
        (new Date(reminder.expires_at).getTime() - new Date(reminder.created_at!).getTime()) /
          (60 * 1000)
      );

      const reminderTitle =
        '⏰ ' + (await client.getLocaleText('commands.remind.reminder', reminder.locale));
      const reminderDesc = await client.getLocaleText(
        'commands.remind.remindyou',
        reminder.locale,
        { message: reminder.message }
      );

      const timeElapsedText =
        '⏱️ ' + (await client.getLocaleText('commands.remind.timeelapsed', reminder.locale));
      const originalTimeText =
        '📅 ' + (await client.getLocaleText('commands.remind.originaltime', reminder.locale));

      const reminderEmbed = new EmbedBuilder()
        .setColor(0xfaa0a0)
        .setTitle(reminderTitle)
        .setDescription(reminderDesc)
        .addFields(
          { name: timeElapsedText, value: formatTimeString(minutes), inline: true },
          {
            name: originalTimeText,
            value: `<t:${Math.floor(new Date(reminder.created_at!).getTime() / 1000)}:f>`,
            inline: true,
          }
        )
        .setFooter({ text: `ID: ${reminder.reminder_id.slice(-6)}` })
        .setTimestamp();

      if (reminder.metadata?.message_url) {
        const originalMessageText = await client.getLocaleText('common.ogmessage', reminder.locale);
        const jumpToMessageText = await client.getLocaleText(
          'common.jumptomessage',
          reminder.locale
        );

        reminderEmbed.addFields({
          name: originalMessageText,
          value: `[${jumpToMessageText}](${reminder.metadata.message_url})`,
          inline: false,
        });
      }

      if (reminder.message.includes('http') && !reminder.metadata?.message_url) {
        const messageLinkText = await client.getLocaleText('common.messagelink', reminder.locale);
        reminderEmbed.addFields({
          name: messageLinkText,
          value: reminder.message,
          inline: false,
        });
      }

      await user.send({
        embeds: [reminderEmbed],
      });

      logger.info(`Successfully sent reminder to ${reminder.user_tag} (${reminder.user_id})`, {
        reminderId: reminder.reminder_id,
      });
    } catch (error) {
      logger.error(
        `Failed to send reminder to ${reminder.user_tag} (${reminder.user_id}): ${(error as Error).message}`,
        {
          error,
          reminderId: reminder.reminder_id,
        }
      );
    } finally {
      try {
        await completeReminder(reminder.reminder_id);
      } catch (error) {
        if (error instanceof DatabaseError) {
          logger.error(`Database error completing reminder: ${error.message}`, {
            error,
            reminderId: reminder.reminder_id,
          });
        } else {
          logger.error(`Error completing reminder: ${(error as Error).message}`, {
            error,
            reminderId: reminder.reminder_id,
          });
        }
      }
      activeReminders.delete(reminder.reminder_id);
    }
  };
}

setInterval(
  async () => {
    try {
      const deletedCount = await cleanupReminders(30);
      if (deletedCount && deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} old completed reminders`);
      }
    } catch (error) {
      if (error instanceof DatabaseError) {
        logger.error(`Database error during reminder cleanup: ${error.message}`, { error });
      } else {
        logger.error('Error during reminder cleanup:', error);
      }
    }
  },
  60 * 60 * 1000
);

function createCommandBuilder() {
  return new SlashCommandBuilder()
    .setName('remind')
    .setNameLocalizations({
      'es-ES': 'recordatorio',
      'es-419': 'recordatorio',
    })
    .setDescription('Set a reminder')
    .setDescriptionLocalizations({
      'es-ES': 'Establece un recordatorio',
      'es-419': 'Establece un recordatorio',
    })
    .addStringOption((option) =>
      option
        .setName('time')
        .setNameLocalizations({
          'es-ES': 'tiempo',
          'es-419': 'tiempo',
        })
        .setDescription('When to remind you (e.g., 1h, 30m, 5h30m)')
        .setDescriptionLocalizations({
          'es-ES': 'Cuándo recordarte (ej: 1h, 30m, 5h30m)',
          'es-419': 'Cuándo recordarte (ej: 1h, 30m, 5h30m)',
        })
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('message')
        .setNameLocalizations({
          'es-ES': 'mensaje',
          'es-419': 'mensaje',
        })
        .setDescription('What to remind you about')
        .setDescriptionLocalizations({
          'es-ES': 'Sobre qué quieres que te recuerde',
          'es-419': 'Sobre qué quieres que te recuerde',
        })
        .setRequired(true)
    )
    .setContexts([
      InteractionContextType.BotDM,
      InteractionContextType.Guild,
      InteractionContextType.PrivateChannel,
    ])
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall);
}

function createContextMenu(): ContextMenuCommandBuilder {
  return new ContextMenuCommandBuilder()
    .setName('Remind Me')
    .setNameLocalizations({
      'es-ES': 'Recordarme',
      'es-419': 'Recordarme',
    })
    .setType(ApplicationCommandType.Message)
    .setContexts([
      InteractionContextType.BotDM,
      InteractionContextType.Guild,
      InteractionContextType.PrivateChannel,
    ])
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall);
}

export default {
  data: createCommandBuilder(),
  contextMenu: createContextMenu(),

  async execute(client, interaction) {
    if (!interaction.isChatInputCommand()) return;

    const userId = interaction.user.id;
    const userTag = interaction.user.tag;
    const channelId = interaction.channelId;
    const guildId = interaction.guildId;

    try {
      await ensureUserRegistered(userId, userTag, interaction.locale || 'en');

      await interaction.deferReply({ flags: 1 << 6 });

      const timeStr = interaction.options.getString('time')!;
      let message = interaction.options.getString('message')!;

      commandLogger.logFromInteraction(
        interaction,
        `time: ${timeStr}, message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`
      );

      if (!validateTimeString(timeStr)) {
        logger.warn(`Invalid time format from ${userTag}: ${timeStr}`);
        const errorMsg = await client.getLocaleText(
          'commands.remind.errors.invalidformat',
          interaction.locale
        );
        return await interaction.editReply({
          content: errorMsg,
        });
      }

      message = sanitizeInput(message);
      if (!message || message.length > 1000) {
        logger.warn(`Invalid message from ${userTag} - Length: ${message?.length}`);
        const errorMsg = await client.getLocaleText(
          'commands.remind.errors.providevalidchars',
          interaction.locale
        );
        return await interaction.editReply({
          content: errorMsg,
        });
      }

      const minutes = parseTimeString(timeStr);

      if (!minutes || minutes < 1) {
        logger.warn(`Reminder time too short from ${userTag}: ${timeStr}`);
        const errorMsg = await client.getLocaleText(
          'commands.remind.errors.atleastoneminute',
          interaction.locale
        );
        return await interaction.editReply({
          content: errorMsg,
        });
      }

      if (minutes > 60 * 24) {
        logger.warn(`Reminder time too long from ${userTag}: ${minutes} minutes`);
        const errorMsg = await client.getLocaleText(
          'commands.remind.errors.notlongerthanaday',
          interaction.locale
        );
        return await interaction.editReply({
          content: errorMsg,
        });
      }

      const reminderId = `${userId}-${Date.now()}`;
      const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

      try {
        const reminderData: Reminder = {
          reminder_id: reminderId,
          user_id: userId,
          user_tag: userTag,
          channel_id: channelId,
          guild_id: guildId,
          message: message,
          expires_at: expiresAt,
          locale: interaction.locale || 'en',
          metadata: {
            source: 'slash_command',
            command_id: interaction.commandId,
          },
        };

        await saveReminder(reminderData);

        const timeoutId = setTimeout(
          createReminderHandler(client, {
            ...reminderData,
            created_at: new Date(),
          }),
          minutes * 60 * 1000
        );

        activeReminders.set(reminderId, {
          timeoutId,
          expiresAt: expiresAt.getTime(),
        });

        const embed = new EmbedBuilder()
          .setColor(0xfaa0a0)
          .setTitle(
            '⏰ ' + (await client.getLocaleText('commands.remind.reminderset', interaction.locale))
          )
          .setDescription(
            await client.getLocaleText('commands.remind.iwillremindyou', interaction.locale, {
              message,
              time: formatTimeString(minutes),
            })
          )
          .addFields(
            {
              name:
                '⏱️ ' + (await client.getLocaleText('commands.remind.time', interaction.locale)),
              value: formatTimeString(minutes),
              inline: true,
            },
            {
              name:
                '🕒 ' +
                (await client.getLocaleText('commands.remind.willtrigger', interaction.locale)),
              value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
              inline: true,
            }
          )
          .setFooter({
            text: await client.getLocaleText('commands.remind.reminderid', interaction.locale, {
              reminderId: reminderId.slice(-6),
            }),
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        logger.info(
          `Reminder set for ${userTag} (${userId}) - ${formatTimeString(minutes)} from now`,
          {
            reminderId,
            userId,
            userTag,
            expiresAt: expiresAt.toISOString(),
            messagePreview: message.length > 50 ? `${message.substring(0, 50)}...` : message,
          }
        );
        return;
      } catch (error) {
        if (error instanceof DatabaseError) {
          logger.error(`Database error saving reminder: ${error.message}`, {
            error,
            userId,
            userTag,
          });
          throw error;
        } else {
          logger.error(`Error saving reminder to database: ${(error as Error).message}`, {
            error,
            userId,
            userTag,
          });
          const errorMessage = await client.getLocaleText(
            'commands.remind.errors.failedtosave',
            interaction.locale
          );
          throw new Error(errorMessage);
        }
      }
    } catch (error) {
      await errorHandler({
        interaction,
        client,
        error: error as Error,
        userId: interaction.user.id,
        username: interaction.user.tag,
      });
    }
  },

  async contextMenuExecute(client, interaction) {
    if (!interaction.isMessageContextMenuCommand()) return;

    const { user, targetMessage: message } = interaction;

    try {
      await ensureUserRegistered(user.id, user.tag, interaction.locale || 'en');

      const modalId = `remind_${message.id}`;

      global._reminders.set(modalId, {
        content: message.content,
        url: message.url,
        channelId: message.channelId,
        messageId: message.id,
        guildId: message.guildId,
        userTag: user.tag,
        userId: user.id,
        locale: interaction.locale || 'en',
      });

      logger.info(
        `Context menu reminder initiated by ${user.tag} (${user.id}) for message ${message.id}`,
        {
          userId: user.id,
          userTag: user.tag,
          messageId: message.id,
          channelId: message.channelId,
          guildId: message.guildId,
        }
      );

      const modalTitle = await client.getLocaleText(
        'commands.remind.modal.setreminder',
        interaction.locale
      );
      const timeLabel = await client.getLocaleText(
        'commands.remind.modal.whento',
        interaction.locale
      );
      const modal = new ModalBuilder().setCustomId(modalId).setTitle(modalTitle);

      const timeInput = new TextInputBuilder()
        .setCustomId('time')
        .setLabel(timeLabel)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`10m, 1h, or 2h30m`)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(timeInput));

      await interaction.showModal(modal);
      logger.info(`Modal shown to ${user.tag} (${user.id}) for message ${message.id}`);
    } catch (error) {
      logger.error(
        `Error showing reminder modal to ${user.tag} (${user.id}): ${(error as Error).message}`,
        {
          error,
          userId: user.id,
          userTag: user.tag,
          messageId: message?.id,
        }
      );

      let errorMessage: string;
      let errorTitle: string;

      if (error instanceof DatabaseError) {
        errorMessage = error.userMessage;
        errorTitle = error.isUserFriendly ? '⚠️ Database Error' : '❌ Database Error';
      } else {
        errorMessage = await client.getLocaleText(
          'commands.remind.errors.modalfailed',
          interaction.locale
        );
        errorTitle = '❌ ' + (await client.getLocaleText('error', interaction.locale));
      }

      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(errorTitle)
        .setDescription(errorMessage)
        .setTimestamp();

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }
    }
  },

  async handleModal(client, interaction) {
    if (!interaction.isModalSubmit() || !interaction.customId.startsWith('remind_')) return;

    const modalInteraction = interaction as ModalSubmitInteraction;
    const { user, customId: modalId } = modalInteraction;

    await modalInteraction.deferReply({ flags: 1 << 6 });

    try {
      await ensureUserRegistered(user.id, user.tag, interaction.locale || 'en');

      const messageInfo = global._reminders.get(modalId);

      if (!messageInfo) {
        logger.warn(`No message info found for modal ID: ${modalId}`, { userId: user.id });
        const errorMsg = await client.getLocaleText(
          'commands.remind.errors.expired',
          interaction.locale
        );
        return await modalInteraction.editReply({
          content: errorMsg,
        });
      }

      global._reminders.delete(modalId);

      const timeStr = modalInteraction.fields.getTextInputValue('time');
      const userLocale = messageInfo.locale || modalInteraction.locale || 'en';

      if (!validateTimeString(timeStr)) {
        logger.warn(`Invalid time format from ${user.tag} in modal: ${timeStr}`);
        const errorMsg = await client.getLocaleText(
          'commands.remind.errors.invalidformat',
          interaction.locale
        );
        return await modalInteraction.editReply({
          content: errorMsg,
        });
      }

      const minutes = parseTimeString(timeStr)!;

      if (minutes < 1 || minutes > 60 * 24) {
        logger.warn(`Invalid time duration from ${user.tag} in modal: ${minutes} minutes`);
        const errorMsg = await client.getLocaleText(
          'commands.remind.errors.notlongerthanaday',
          interaction.locale
        );
        return await modalInteraction.editReply({
          content: errorMsg,
        });
      }

      const reminderId = `${user.id}-${Date.now()}`;
      const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
      const createdAt = new Date();

      const reminderMessage = messageInfo.content
        ? `"${sanitizeInput(messageInfo.content)}"`
        : `[View message](${messageInfo.url})`;

      let reminderData: Reminder;
      try {
        reminderData = {
          reminder_id: reminderId,
          user_id: user.id,
          user_tag: user.tag,
          locale: userLocale,
          channel_id: messageInfo.channelId,
          guild_id: messageInfo.guildId,
          message: reminderMessage,
          expires_at: expiresAt,
          created_at: createdAt,
          metadata: {
            source: 'context_menu',
            original_message_id: messageInfo.messageId,
            original_channel_id: messageInfo.channelId,
            message_url: messageInfo.url,
          },
        };

        await saveReminder(reminderData);
      } catch (error) {
        if (error instanceof DatabaseError) {
          logger.error(`Database error saving reminder: ${error.message}`, { error });
          return await modalInteraction.editReply({
            content: error.userMessage,
          });
        } else {
          logger.error(`Error saving reminder to database: ${(error as Error).message}`, { error });
          const errorMsg = await client.getLocaleText(
            'commands.remind.errors.failedtosave',
            interaction.locale
          );
          return await modalInteraction.editReply({
            content: errorMsg,
          });
        }
      }

      const timeoutId = setTimeout(
        createReminderHandler(client, {
          ...reminderData,
          metadata: {
            source: 'context_menu',
            original_message_id: messageInfo.messageId,
            original_channel_id: messageInfo.channelId,
            message_url: messageInfo.url,
          },
        }),
        minutes * 60 * 1000
      );

      activeReminders.set(reminderId, {
        timeoutId,
        expiresAt: expiresAt.getTime(),
      });

      const jumpToMessageField = await client.getLocaleText(
        'common.jumptomessage',
        interaction.locale
      );

      const embed = new EmbedBuilder()
        .setColor(0xfaa0a0)
        .setTitle(
          '⏰ ' + (await client.getLocaleText('commands.remind.reminderset', interaction.locale))
        )
        // .setTitle(reminderSetTitle)
        .setDescription(
          await client.getLocaleText('commands.remind.contextiwillremindyou', interaction.locale, {
            time: formatTimeString(minutes),
          })
        )
        // .setDescription(reminderSetDesc)
        .addFields(
          {
            name: await client.getLocaleText('common.messagelink', interaction.locale),
            value: `[${jumpToMessageField}](${messageInfo.url})`,
          },
          {
            name: await client.getLocaleText('commands.remind.willtrigger', interaction.locale),
            value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
            inline: true,
          }
        )
        .setFooter({
          text: await client.getLocaleText('commands.remind.reminderid', interaction.locale, {
            reminderId: reminderId.slice(-6),
          }),
        })
        .setTimestamp();

      await modalInteraction.editReply({ embeds: [embed] });

      logger.info(`Reminder set via modal for ${user.tag} (${user.id})`, {
        reminderId,
        messageId: messageInfo.messageId,
        channelId: messageInfo.channelId,
        minutes,
      });
      return;
    } catch (error) {
      logger.error(
        `Error handling reminder modal for ${user.tag} (${user.id}): ${(error as Error).message}`,
        {
          error,
          modalId,
        }
      );

      try {
        const errorMsg = await client.getLocaleText(
          'commands.remind.errors.base',
          interaction.locale
        );
        await modalInteraction.editReply({
          content: errorMsg,
        });
      } catch (replyError) {
        logger.error('Failed to send error response to user:', { error: replyError });
      }
      return;
    }
  },
} as RemindCommandProps;
