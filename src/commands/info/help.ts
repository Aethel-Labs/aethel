import { SlashCommandProps } from '@/types/command';
import { SlashCommandBuilder, EmbedBuilder, InteractionContextType, ApplicationIntegrationType } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setNameLocalizations({
      'es-ES': 'ayuda',
      'es-419': 'ayuda',
      'en-US': 'help',
    })
    .setDescription('Show all available commands and their usage')
    .setDescriptionLocalizations({
      'es-ES': 'Muestra todos los comandos disponibles y su uso',
      'es-419': 'Muestra todos los comandos disponibles y su uso',
      'en-US': 'Show all available commands and their usage',
    })
    .setContexts([InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel])
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall),
  async execute(client, interaction) {
    try {
      await interaction.deferReply();

      const [title, description] = await Promise.all([
        await client.getLocaleText("commands.help.embed.title", interaction.locale),
        await client.getLocaleText("commands.help.embed.description", interaction.locale),
      ]);

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`🤖 ${title}`)
        .setDescription(description);

      const commandCategories: Map<string, string[]> = new Map();
      // Group commands by category
      for (const cmd of client.commands.values()) {
        const ClientApplicationCommandCache = client.application?.commands.cache.find(command => command.name == cmd.data.name);
        const category = cmd.category || "Uncategorized";
        if (!commandCategories.has(category)) {
          commandCategories.set(category, []);
        }
        const localizedDescription = await client.getLocaleText(`commands.${cmd.data.name}.description`, interaction.locale)
        commandCategories.get(category)!.push(`</${ClientApplicationCommandCache?.name}:${ClientApplicationCommandCache?.id}> - ${localizedDescription}`);
      };
      for (const [category, cmds] of commandCategories.entries()) {
        const localizedCategory = await client.getLocaleText(`categories.${category}`, interaction.locale);
        embed.addFields({
          name: `📂 ${localizedCategory}`,
          value: cmds.join("\n"),
          inline: false,
        });
      }
      await interaction.editReply({ embeds: [embed] });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      const errorMsg = await client.getLocaleText("unexpectederror", interaction.locale);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: errorMsg,
          flags: 1 << 6,
        });
      } else {
        await interaction.reply({
          content: errorMsg,
          flags: 1 << 6,
        });
      }
    }
  },
} as SlashCommandProps;
