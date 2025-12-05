import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  InteractionContextType,
  ApplicationIntegrationType,
} from 'discord.js';
import { SlashCommandProps } from '@/types/command';
import BotClient from '@/services/Client';
import logger from '@/utils/logger';
import { SocialMediaSubscription } from '@/types/social';

interface SocialCommand extends SlashCommandProps {
  handleAdd: (client: BotClient, interaction: ChatInputCommandInteraction) => Promise<void>;
  handleRemove: (client: BotClient, interaction: ChatInputCommandInteraction) => Promise<void>;
  handleList: (client: BotClient, interaction: ChatInputCommandInteraction) => Promise<void>;
  handleRefresh: (client: BotClient, interaction: ChatInputCommandInteraction) => Promise<void>;
}

const platforms = [
  { name: 'Bluesky', value: 'bluesky' },
  { name: 'Fediverse (Mastodon, Pleroma, etc.)', value: 'fediverse' },
] as const;

type SocialPlatform = (typeof platforms)[number]['value'];

const platformNames: Record<string, string> = {
  bluesky: 'Bluesky',
  fediverse: 'Fediverse',
};

const platformEmojis: Record<string, string> = {
  bluesky: '🔵',
  fediverse: '🐘',
};

const command: SocialCommand = {
  data: new SlashCommandBuilder()
    .setName('social')
    .setDescription('Get notifications of posts from Fediverse and Bluesky accounts')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .setContexts([InteractionContextType.Guild])
    .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Add a social media account to track')
        .addStringOption((option) =>
          option
            .setName('platform')
            .setDescription('Social media platform')
            .setRequired(true)
            .addChoices(...platforms),
        )
        .addStringOption((option) =>
          option
            .setName('account')
            .setDescription(
              'Account handle (e.g., user@instance.social for Fediverse, or user.bsky.social for Bluesky)',
            )
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel to post notifications (defaults to current channel)')
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove a social media account from tracking')
        .addStringOption((option) =>
          option
            .setName('platform')
            .setDescription('Social media platform')
            .setRequired(true)
            .addChoices(...platforms),
        )
        .addStringOption((option) =>
          option
            .setName('account')
            .setDescription('Account handle to remove from tracking')
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('List all tracked social media accounts for this server'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('refresh')
        .setDescription('Check for new posts and send notifications immediately'),
    ) as unknown as SlashCommandBuilder,

  handleAdd: async (client: BotClient, interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const platform = interaction.options.getString('platform', true) as SocialPlatform;
    const account = interaction.options.getString('account', true);
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    if (!channel || !('isTextBased' in channel) || !channel.isTextBased()) {
      const msg = await client.getLocaleText(
        'commands.social.invalidChannel',
        interaction.locale || 'en-US',
      );
      await interaction.editReply(msg);
      return;
    }

    if (!client.socialMediaManager) {
      throw new Error(
        await client.getLocaleText(
          'commands.social.notInitializedThrow',
          interaction.locale || 'en-US',
        ),
      );
    }

    await client.socialMediaManager
      .getService()
      .addSubscription(interaction.guildId!, platform, account, channel.id);

    await client.socialMediaManager.onSubscriptionAdded(platform, account);

    const success = await client.getLocaleText(
      'commands.social.addSuccess',
      interaction.locale || 'en-US',
      {
        platform,
        account,
        channel: String(channel),
      },
    );
    await interaction.editReply(success);

    logger.info(
      `Added social media subscription for ${platform} account ${account} in guild ${interaction.guildId}`,
    );
  },

  handleRefresh: async (client: BotClient, interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!client.socialMediaManager) {
      const msg = await client.getLocaleText(
        'commands.social.notInitialized',
        interaction.locale || 'en-US',
      );
      await interaction.editReply(msg);
      return;
    }
    try {
      const count = await client.socialMediaManager.refreshOnce();
      const msg = await client.getLocaleText(
        'commands.social.refreshSuccess',
        interaction.locale || 'en-US',
        { count: String(count) },
      );
      await interaction.editReply(msg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const loc = await client.getLocaleText(
        'commands.social.refreshFailed',
        interaction.locale || 'en-US',
        { message: msg },
      );
      await interaction.editReply(loc);
    }
  },

  handleRemove: async (client: BotClient, interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const platform = interaction.options.getString('platform', true) as SocialPlatform;
    const account = interaction.options.getString('account', true);

    if (!client.socialMediaManager) {
      throw new Error('Social media features are not properly initialized.');
    }

    const removed = await client.socialMediaManager
      .getService()
      .removeSubscription(interaction.guildId!, platform, account);

    if (removed) {
      await client.socialMediaManager.onSubscriptionRemoved(platform, account);

      const msg = await client.getLocaleText(
        'commands.social.removeSuccess',
        interaction.locale || 'en-US',
        { platform, account },
      );
      await interaction.editReply(msg);
      logger.info(
        `Removed social media subscription for ${platform} account ${account} in guild ${interaction.guildId}`,
      );
    } else {
      const msg = await client.getLocaleText(
        'commands.social.removeNotFound',
        interaction.locale || 'en-US',
        { platform, account },
      );
      await interaction.editReply(msg);
    }
  },

  handleList: async (client: BotClient, interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!client.socialMediaManager) {
      throw new Error('Social media features are not properly initialized.');
    }

    const subscriptions = await client.socialMediaManager
      .getService()
      .listSubscriptions(interaction.guildId!);

    if (subscriptions.length === 0) {
      const msg = await client.getLocaleText(
        'commands.social.listNone',
        interaction.locale || 'en-US',
      );
      await interaction.editReply(msg);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(
        await client.getLocaleText('commands.social.listTitle', interaction.locale || 'en-US'),
      )
      .setColor(0x3498db)
      .setDescription(
        await client.getLocaleText(
          'commands.social.listDescription',
          interaction.locale || 'en-US',
        ),
      );

    const groupedByPlatform = subscriptions.reduce(
      (acc, sub) => {
        if (!acc[sub.platform]) {
          acc[sub.platform] = [];
        }
        acc[sub.platform].push(sub);
        return acc;
      },
      {} as Record<string, SocialMediaSubscription[]>,
    );

    for (const [platform, subs] of Object.entries(groupedByPlatform)) {
      const platformName =
        platformNames[platform] || platform.charAt(0).toUpperCase() + platform.slice(1);
      const emoji = platformEmojis[platform] || '📱';

      const channelUnset = await client.getLocaleText(
        'commands.social.channelUnset',
        interaction.locale || 'en-US',
      );

      const value = subs
        .map((sub) => {
          const channelMention = sub.channelId ? `<#${sub.channelId}>` : channelUnset;
          return `• ${sub.accountHandle} → ${channelMention}`;
        })
        .join('\n');

      embed.addFields({
        name: `${emoji} ${platformName} (${subs.length})`,
        value:
          value ||
          (await client.getLocaleText(
            'commands.social.fieldNoAccounts',
            interaction.locale || 'en-US',
          )),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
    logger.info(
      `Listed ${subscriptions.length} social media subscriptions for guild ${interaction.guildId}`,
    );
  },

  async execute(client: BotClient, interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: await client.getLocaleText(
          'commands.social.guildOnly',
          interaction.locale || 'en-US',
        ),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'add':
          await command.handleAdd(client, interaction);
          break;
        case 'remove':
          await command.handleRemove(client, interaction);
          break;
        case 'list':
          await command.handleList(client, interaction);
          break;
        case 'refresh':
          await command.handleRefresh(client, interaction);
          break;
        default:
          await interaction.reply({
            content: await client.getLocaleText(
              'commands.social.unknownSubcommand',
              interaction.locale || 'en-US',
            ),
            flags: MessageFlags.Ephemeral,
          });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      logger.error(`Error in social ${subcommand} command:`, error);

      if (interaction.deferred || interaction.replied) {
        const msg = await client.getLocaleText(
          'commands.social.failedAction',
          interaction.locale || 'en-US',
          { action: subcommand, message: errorMessage },
        );
        await interaction.editReply(msg);
      } else {
        await interaction.reply({
          content: await client.getLocaleText(
            'commands.social.failedAction',
            interaction.locale || 'en-US',
            { action: subcommand, message: errorMessage },
          ),
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};

export default command;
