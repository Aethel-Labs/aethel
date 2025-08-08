import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  saveReminder,
  getUserReminders,
  getReminder,
  completeReminder,
  getActiveReminders,
  clearCompletedReminders,
} from '../utils/reminderDb';
import { authenticateToken } from '../middlewares/auth';
import logger from '../utils/logger';
import BotClient from '../services/Client';
import { EmbedBuilder } from 'discord.js';
import { formatTimeString } from '../utils/validation';
import { scheduleReminder } from '../commands/utilities/remind';

const router = Router();

router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const reminders = await getUserReminders(userId);
    res.json({ reminders });
  } catch (error) {
    logger.error('Error fetching user reminders:', error);
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const userTag = req.user?.username || 'Unknown';

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { message, expires_at } = req.body;

    if (!message || !expires_at) {
      return res.status(400).json({ error: 'Message and expiration date are required' });
    }

    const reminderData = {
      reminder_id: uuidv4(),
      user_id: userId,
      user_tag: userTag,
      channel_id: 'web',
      guild_id: null,
      message,
      expires_at: new Date(expires_at),
      locale: 'en',
      metadata: {
        source: 'web',
        created_via: 'dashboard',
      },
    };

    const savedReminder = await saveReminder(reminderData);

    try {
      const client = BotClient.getInstance();
      if (client) {
        const scheduled = scheduleReminder(client, {
          ...savedReminder,
          created_at: savedReminder.created_at || new Date(),
        });

        if (scheduled) {
          logger.info(
            `Successfully scheduled reminder ${savedReminder.reminder_id} from dashboard`,
          );
        } else {
          logger.warn(`Failed to schedule reminder ${savedReminder.reminder_id} from dashboard`);
        }
      } else {
        logger.warn('Bot client not available, reminder saved but not scheduled');
      }
    } catch (schedulingError) {
      logger.error(`Error scheduling reminder ${savedReminder.reminder_id}:`, schedulingError);
    }

    res.status(201).json({ reminder: savedReminder });
  } catch (error) {
    logger.error('Error creating reminder:', error);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const reminderId = req.params.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const reminder = await getReminder(reminderId);

    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    if (reminder.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ reminder });
  } catch (error) {
    logger.error('Error fetching reminder:', error);
    res.status(500).json({ error: 'Failed to fetch reminder' });
  }
});

router.patch('/:id/complete', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const reminderId = req.params.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const reminder = await getReminder(reminderId);

    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    if (reminder.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      const client = BotClient.getInstance();
      if (client) {
        const user = await client.users.fetch(reminder.user_id);
        if (user) {
          const minutes = Math.floor(
            (new Date(reminder.expires_at).getTime() - new Date(reminder.created_at!).getTime()) /
              (60 * 1000),
          );

          const reminderTitle =
            '⏰ ' + (await client.getLocaleText('commands.remind.reminder', reminder.locale));
          const reminderDesc = await client.getLocaleText(
            'commands.remind.remindyou',
            reminder.locale,
            { message: reminder.message },
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
              },
            )
            .setFooter({ text: `ID: ${reminder.reminder_id.slice(-6)}` })
            .setTimestamp();

          if (reminder.metadata?.message_url) {
            const originalMessageText = await client.getLocaleText(
              'common.ogmessage',
              reminder.locale,
            );
            const jumpToMessageText = await client.getLocaleText(
              'common.jumptomessage',
              reminder.locale,
            );

            reminderEmbed.addFields({
              name: originalMessageText,
              value: `[${jumpToMessageText}](${reminder.metadata.message_url})`,
              inline: false,
            });
          }

          if (reminder.message.includes('http') && !reminder.metadata?.message_url) {
            const messageLinkText = await client.getLocaleText(
              'common.messagelink',
              reminder.locale,
            );
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
        }
      }
    } catch (notificationError) {
      logger.error(
        `Failed to send reminder notification to ${reminder.user_tag} (${reminder.user_id}): ${(notificationError as Error).message}`,
        {
          error: notificationError,
          reminderId: reminder.reminder_id,
        },
      );
    }

    const completedReminder = await completeReminder(reminderId);
    res.json({ reminder: completedReminder });
  } catch (error) {
    logger.error('Error completing reminder:', error);
    res.status(500).json({ error: 'Failed to complete reminder' });
  }
});

router.get('/active/all', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const activeReminders = await getActiveReminders();
    const userActiveReminders = activeReminders.filter((reminder) => reminder.user_id === userId);

    res.json({ reminders: userActiveReminders });
  } catch (error) {
    logger.error('Error fetching active reminders:', error);
    res.status(500).json({ error: 'Failed to fetch active reminders' });
  }
});

router.delete('/completed', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const deletedCount = await clearCompletedReminders(userId);

    res.json({
      message: `Successfully cleared ${deletedCount} completed reminders`,
      deletedCount,
    });
  } catch (error) {
    logger.error('Error clearing completed reminders:', error);
    res.status(500).json({ error: 'Failed to clear completed reminders' });
  }
});

export default router;
