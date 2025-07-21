import * as config from '@/config';
import BotClient, { srcDir } from '@/services/Client';
import { SlashCommandProps, RemindCommandProps } from '@/types/command';
import { REST, Routes, SlashCommandBuilder, ContextMenuCommandBuilder } from 'discord.js';
import { readdirSync } from 'fs';
import path from 'path';

function buildLocalizations(client: BotClient, commandKey: string, field: 'name' | 'description') {
  const localizations: Record<string, string> = {};
  for (const [locale, data] of client.t.entries()) {
    const value = data?.commands?.[commandKey]?.[field];
    if (value) {
      localizations[locale] = value;
    }
  }
  return localizations;
}

export default async (c: BotClient) => {
  console.log('Processing commands...');
  const cmdDir = path.join(srcDir, 'commands');
  const cmdCat = readdirSync(cmdDir);
  const commands: (SlashCommandBuilder | ContextMenuCommandBuilder)[] = [];
  for (const cat of cmdCat) {
    const commandFiles = readdirSync(path.join(cmdDir, cat)).filter(
      (f) => f.endsWith('.js') || f.endsWith('.ts')
    );
    for (const file of commandFiles) {
      const commandPath = path.join(cmdDir, cat, file);
      const commandUrl = `file://${commandPath.replace(/\\/g, '/')}`;
      const command = (await (
        await import(commandUrl)
      ).default) as SlashCommandProps | RemindCommandProps;
      if (!command.data) {
        console.log('No command data in file', `${cat}/${file}.. Skipping`);
        continue;
      }
      command.category = cat;

      if (command.data instanceof SlashCommandBuilder) {
        const cmdName = command.data.name;
        const descLoc = buildLocalizations(c, cmdName, 'description');
        if (Object.keys(descLoc).length > 0) {
          command.data.setDescriptionLocalizations(descLoc);
        }
      }

      c.commands.set(command.data.name, command);
      commands.push(command.data);
      if ('contextMenu' in command) {
        const remindCommand = command as RemindCommandProps;
        commands.push(remindCommand.contextMenu);
      }
    }
  }
  try {
    const rest = new REST({ version: '10' }).setToken(config.TOKEN!);
    await rest.put(Routes.applicationCommands(config.CLIENT_ID!), { body: commands });
    console.log('✅ All commands registered successfully');
  } catch (error) {
    console.error('Error on deploying commands:', error);
    console.log('Bot will continue running with existing commands');
  }
};
