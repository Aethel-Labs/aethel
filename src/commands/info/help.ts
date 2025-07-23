import { SlashCommandProps } from '@/types/command';
import {
  SlashCommandBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SeparatorBuilder,
  SeparatorSpacingSize,
  type MessageActionRowComponentBuilder,
} from 'discord.js';

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
    .setContexts([
      InteractionContextType.BotDM,
      InteractionContextType.Guild,
      InteractionContextType.PrivateChannel,
    ])
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall),
  async execute(client, interaction) {
    try {
      const [
        title,
        description,
        viewCommandsText,
        supportServerText,
        linksSocialText,
        featuresText,
        featuresContent,
        dashboardText,
      ] = await Promise.all([
        client.getLocaleText('commands.help.title', interaction.locale),
        client.getLocaleText('commands.help.about', interaction.locale),
        client.getLocaleText('commands.help.viewcommands', interaction.locale),
        client.getLocaleText('commands.help.supportserver', interaction.locale),
        client.getLocaleText('commands.help.links_social', interaction.locale),
        client.getLocaleText('commands.help.features', interaction.locale),
        client.getLocaleText('commands.help.features_content', interaction.locale),
        client.getLocaleText('commands.help.dashboard', interaction.locale),
      ]);

      const container = new ContainerBuilder()
        .setAccentColor(0x5865f2)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title || 'Aethel Bot'}`))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(description || 'Get information about Aethel')
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `\n## **${linksSocialText || 'Links & Social Media'}**`
          )
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            '[Website](https://aethel.xyz) • [GitHub](https://github.com/aethel-labs/aethel) • [Bluesky](https://bsky.app/profile/aethel.xyz)'
          )
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`\n## **${featuresText || 'Features'}**`)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            featuresContent ||
              '**Fun Commands** - 8ball, cat/dog images, and more\n' +
                '**AI Integration** - Powered by OpenAI and other providers\n' +
                '**Reminders** - Never forget important tasks\n' +
                '**Utilities** - Weather, help, and productivity tools\n' +
                '**Multi-language** - Supports multiple languages'
          )
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `-# ${dashboardText || 'Dashboard available at https://aethel.xyz/dashboard for To-Dos, Reminders and custom AI API key management'}`
          )
        )
        .addActionRowComponents(
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Primary)
              .setLabel(viewCommandsText || 'Commands')
              .setCustomId(`help_commands_${interaction.user.id}`),
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel(supportServerText || 'Support')
              .setURL('https://discord.gg/labs')
          )
        );

      await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch {
      const errorMsg = await client.getLocaleText('unexpectederror', interaction.locale);
      await interaction.reply({
        content: errorMsg,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
} as SlashCommandProps;
