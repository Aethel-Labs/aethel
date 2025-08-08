import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ApplicationIntegrationType,
  InteractionContextType,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js';
import { SlashCommandProps } from '@/types/command';
import BotClient from '@/services/Client';
import pool from '@/utils/pgClient';
import logger from '@/utils/logger';
import { createCommandLogger } from '@/utils/commandLogger';
import { createErrorHandler } from '@/utils/errorHandler';

const commandLogger = createCommandLogger('todo');
const errorHandler = createErrorHandler('todo');

async function getTodosForUser(userId: string) {
  try {
    const { rows } = await pool.query(
      'SELECT item FROM todos WHERE user_id = $1 AND done = FALSE ORDER BY created_at ASC',
      [userId],
    );
    return rows.map((r) => r.item);
  } catch (error) {
    logger.error('Error fetching todos for user %s: %O', userId, error);
    return [];
  }
}
async function getDoneForUser(userId: string) {
  try {
    const { rows } = await pool.query(
      'SELECT item FROM todos WHERE user_id = $1 AND done = TRUE ORDER BY completed_at ASC',
      [userId],
    );
    return rows.map((r) => r.item);
  } catch (error) {
    logger.error('Error fetching done todos for user %s: %O', userId, error);
    return [];
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('todo')
    .setNameLocalizations({
      'es-ES': 'tareas',
      'es-419': 'tareas',
    })
    .setDescription('Manage your todo list')
    .setDescriptionLocalizations({
      'es-ES': 'Administra tu lista de tareas',
      'es-419': 'Administra tu lista de tareas',
    })
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setNameLocalizations({
          'es-ES': 'agregar',
          'es-419': 'agregar',
        })
        .setDescription('Add a new todo item')
        .setDescriptionLocalizations({
          'es-ES': 'Agregar una nueva tarea',
          'es-419': 'Agregar una nueva tarea',
        })
        .addStringOption((opt) =>
          opt
            .setName('item')
            .setDescription('The todo item to add')
            .setDescriptionLocalizations({
              'es-ES': 'La tarea a agregar',
              'es-419': 'La tarea a agregar',
            })
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('done')
        .setNameLocalizations({
          'es-ES': 'hecha',
          'es-419': 'hecha',
        })
        .setDescription('Mark a todo as done')
        .setDescriptionLocalizations({
          'es-ES': 'Marca una tarea como hecha',
          'es-419': 'Marca una tarea como hecha',
        })
        .addStringOption((opt) =>
          opt
            .setName('item')
            .setDescription('Select a todo to mark as done')
            .setDescriptionLocalizations({
              'es-ES': 'Selecciona una tarea para marcar como hecha',
              'es-419': 'Selecciona una tarea para marcar como hecha',
            })
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setNameLocalizations({
          'es-ES': 'lista',
          'es-419': 'lista',
        })
        .setDescription('View your todo list')
        .setDescriptionLocalizations({
          'es-ES': 'Ver tu lista de tareas',
          'es-419': 'Ver tu lista de tareas',
        }),
    )
    .setContexts([
      InteractionContextType.BotDM,
      InteractionContextType.Guild,
      InteractionContextType.PrivateChannel,
    ])
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall),

  async execute(client: BotClient, interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const locale = interaction.locale;
    const sub = interaction.options.getSubcommand();

    try {
      commandLogger.logFromInteraction(interaction);

      if (sub === 'add') {
        const item = interaction.options.getString('item', true);
        try {
          await pool.query('INSERT INTO todos (user_id, item, done) VALUES ($1, $2, FALSE)', [
            userId,
            item,
          ]);
          const addedMsg = await client.getLocaleText('commands.todo.added', locale, { item });
          await interaction.reply({
            content: addedMsg,
            flags: MessageFlags.Ephemeral,
          });
        } catch (error) {
          logger.error('Error adding todo for user %s: %O', userId, error);
          const errorMsg = await client.getLocaleText('commands.todo.add_error', locale, { item });
          await interaction.reply({
            content: errorMsg || '❌ Failed to add your todo. Please try again later.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } else if (sub === 'done') {
        const item = interaction.options.getString('item', true);
        try {
          const { rowCount } = await pool.query(
            'UPDATE todos SET done = TRUE, completed_at = NOW() WHERE user_id = $1 AND item = $2 AND done = FALSE',
            [userId, item],
          );
          if (rowCount === 0) {
            await interaction.reply({
              content: await client.getLocaleText('commands.todo.notfound', locale, { item }),
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          const checkedMsg = await client.getLocaleText('commands.todo.checked', locale, { item });
          await interaction.reply({
            content: checkedMsg,
            flags: MessageFlags.Ephemeral,
          });
        } catch (error) {
          logger.error('Error marking todo as done for user %s: %O', userId, error);
          const errorMsg = await client.getLocaleText('commands.todo.done_error', locale, { item });
          await interaction.reply({
            content: errorMsg || '❌ Failed to mark your todo as done. Please try again later.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } else if (sub === 'list') {
        const todos = await getTodosForUser(userId);
        const done = await getDoneForUser(userId);
        if (todos.length === 0 && done.length === 0) {
          const emptyMsg = await client.getLocaleText('commands.todo.empty', locale);
          await interaction.reply({
            content: emptyMsg,
            flags: MessageFlags.Ephemeral,
          });
        } else {
          const listTitle =
            (await client.getLocaleText('commands.todo.list_title', locale)) || '📝 To-do List';
          const todoTitle =
            (await client.getLocaleText('commands.todo.todo_title', locale)) || 'To-Do';
          const doneTitle =
            (await client.getLocaleText('commands.todo.done_title', locale)) || 'Done';
          const none = (await client.getLocaleText('commands.todo.none', locale)) || '—';
          const todoList = todos.length > 0 ? todos.map((t) => `☐ ${t}`).join('\n') : none;
          const doneList = done.length > 0 ? done.map((t) => `☑ ${t}`).join('\n') : none;
          const embed = new EmbedBuilder()
            .setTitle(listTitle)
            .addFields([
              { name: todoTitle, value: todoList, inline: true },
              { name: doneTitle, value: doneList, inline: true },
            ])
            .setColor(0x2ecc71);
          await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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

  async autocomplete(client: BotClient, interaction: AutocompleteInteraction) {
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();
    if (sub !== 'done') {
      await interaction.respond([]);
      return;
    }
    const focused = interaction.options.getFocused();
    const todos = await getTodosForUser(userId);
    const filtered = todos
      .filter((t) => t.toLowerCase().includes(focused.toLowerCase()))
      .slice(0, 25);
    await interaction.respond(filtered.map((t) => ({ name: t, value: t })));
  },
} as SlashCommandProps;
