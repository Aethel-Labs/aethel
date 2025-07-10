import * as config from "@/config";
import BotClient, { srcDir } from '@/services/Client';
import { SlashCommandProps } from '@/types/command';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { readdirSync } from 'fs';
import path from 'path';

export default async (c: BotClient) => {
  console.log("processing commands");
  const cmdDir = path.join(srcDir, 'commands');
  console.log(cmdDir);
  const cmdCat = readdirSync(cmdDir);
  const commands: SlashCommandBuilder[] = [];
  for (const cat of cmdCat) {
    const commandFiles = readdirSync(path.join(cmdDir, cat)).filter(f => f.endsWith('.js') || f.endsWith('.ts'));
    for (const file of commandFiles) {
      // await Promise.all(commandFiles.map(async (val, i) => {
      const commandPath = path.join(cmdDir, cat, file);
      // const commandURL = pathToFileURL(commandPath).href
      const command = await (await import(commandPath)).default as SlashCommandProps;
      if (!command.data) {
        console.log('No command data in file', `${cat}/${file}.. Skipping`);
        return;
      }
      command.category = cat;
      console.log(command);
      c.commands.set(command.data.name, command);
      commands.push(command.data);
      // }));
    };
  }
  try {
    const rest = new REST({ version: "10" }).setToken(config.TOKEN!);
    await rest.put(Routes.applicationCommands(config.CLIENT_ID!), { body: commands });
    console.log("all commands has been registered")
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    console.error("Error on deploying commands. Aborting");
  }
}