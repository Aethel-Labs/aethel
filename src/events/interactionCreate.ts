import { browserHeaders } from '@/constants/index';
import BotClient from '@/services/Client';
import * as config from '@/config';
import { renderStocksView, parseStocksButtonId } from '@/commands/utilities/stocks';
import { RandomReddit } from '@/types/base';
import { RemindCommandProps } from '@/types/command';
import logger from '@/utils/logger';
import { sanitizeInput } from '@/utils/validation';
import {
  ButtonStyle,
  ClientEvents,
  ContainerBuilder,
  MessageFlags,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ButtonInteraction,
  type MessageActionRowComponentBuilder,
} from 'discord.js';

type InteractionHandler = (...args: ClientEvents['interactionCreate']) => void;

export default class InteractionCreateEvent {
  private client: BotClient;
  constructor(c: BotClient) {
    this.client = c;
    c.on('interactionCreate', this.handleInteraction.bind(this));
  }

  private handleInteraction: InteractionHandler = async (i) => {
    if (i.isAutocomplete()) {
      const command = this.client.commands.get(i.commandName);
      if (command && typeof command.autocomplete === 'function') {
        await command.autocomplete(this.client, i);
        return;
      }
    }
    if (i.isChatInputCommand()) {
      const command = this.client.commands.get(i.commandName);
      if (!command) {
        return i.reply({
          content: 'Command not found',
          flags: MessageFlags.Ephemeral,
        });
      }
      try {
        command.execute(this.client, i);
      } catch (error) {
        console.error(`[COMMAND ERROR] ${i.commandName}:`, error);
        await i.reply({
          content: 'There was an error executing this command!',
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    if (i.isModalSubmit()) {
      if (i.customId.startsWith('remind')) {
        const remind = this.client.commands.get('remind') as RemindCommandProps;
        if (remind && remind.handleModal) {
          await remind.handleModal(this.client, i);
        }
      } else if (i.customId.startsWith('apiCredentials')) {
        const ai = this.client.commands.get('ai');
        if (ai && 'handleModal' in ai) {
          await (ai as unknown as RemindCommandProps).handleModal(this.client, i);
        }
      }
      return;
    }
    if (i.isMessageContextMenuCommand()) {
      let targetCommand = null;
      for (const [, command] of this.client.commands) {
        if ('contextMenuExecute' in command) {
          const remindCommand = command as RemindCommandProps;
          if (remindCommand.contextMenu.name === i.commandName) {
            targetCommand = command;
            break;
          }
        }
      }

      if (!targetCommand) {
        await i.reply({ content: 'Error Occured, Please try again later' });
        return;
      }

      (targetCommand as RemindCommandProps).contextMenuExecute(this.client, i);
    }
    if (i.isButton()) {
      try {
        if (i.customId.startsWith('trivia_')) {
          const triviaCommand = this.client.commands.get('trivia');
          if (triviaCommand && 'handleButton' in triviaCommand) {
            return await (
              triviaCommand as {
                handleButton: (client: BotClient, interaction: ButtonInteraction) => Promise<void>;
              }
            ).handleButton(this.client, i);
          }
        }

        const stocksPayload = parseStocksButtonId(i.customId);
        if (stocksPayload) {
          if (!config.MASSIVE_API_KEY) {
            const message = await this.client.getLocaleText(
              'commands.stocks.errors.noapikey',
              i.locale,
            );
            return await i.reply({ content: message, flags: MessageFlags.Ephemeral });
          }

          if (stocksPayload.userId !== i.user.id) {
            const unauthorized =
              (await this.client.getLocaleText('commands.stocks.errors.unauthorized', i.locale)) ||
              'Only the person who used /stocks can use these buttons.';
            return await i.reply({ content: unauthorized, flags: MessageFlags.Ephemeral });
          }

          await i.deferUpdate();

          try {
            const response = await renderStocksView({
              client: this.client,
              locale: i.locale,
              ticker: stocksPayload.ticker,
              timeframe: stocksPayload.timeframe,
              userId: stocksPayload.userId,
            });
            await i.editReply(response);
          } catch (error) {
            if ((error as Error).message === 'STOCKS_TICKER_NOT_FOUND') {
              const notFound = await this.client.getLocaleText(
                'commands.stocks.errors.notfound',
                i.locale,
                { ticker: stocksPayload.ticker },
              );
              await i.editReply({ content: notFound, components: [] });
            } else {
              logger.error('Error updating stocks view:', error);
              const failMsg = await this.client.getLocaleText('failedrequest', i.locale);
              await i.editReply({ content: failMsg, components: [] });
            }
          }
          return;
        }

        const originalUser = i.message.interaction!.user;
        if (originalUser.id !== i.user.id) {
          return await i.reply({
            content: 'Only the person who used the command can refresh the image!',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (i.customId === 'refresh_cat') {
          try {
            const response = await fetch('https://api.pur.cat/random-cat');
            if (!response.ok) {
              return await i.update({
                content: await this.client.getLocaleText('commands.cat.error', i.locale),
                components: [],
              });
            }
            const data = (await response.json()) as RandomReddit;
            if (data.url) {
              const title = data.title
                ? sanitizeInput(data.title).slice(0, 245) + '...'
                : await this.client.getLocaleText('random.cat', i.locale);

              const refreshLabel = await this.client.getLocaleText('commands.cat.newcat', i.locale);

              const container = new ContainerBuilder()
                .setAccentColor(0xfaa0a0)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}`))
                .addTextDisplayComponents(
                  new TextDisplayBuilder().setContent(
                    data.subreddit
                      ? await this.client.getLocaleText('reddit.from', i.locale, {
                          subreddit: data.subreddit,
                        })
                      : '',
                  ),
                )
                .addMediaGalleryComponents(
                  new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(data.url),
                  ),
                )
                .addActionRowComponents(
                  new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                      .setStyle(ButtonStyle.Danger)
                      .setLabel(refreshLabel)
                      .setEmoji({ name: '🐱' })
                      .setCustomId('refresh_cat'),
                  ),
                );

              await i.update({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
              });
            } else {
              const container = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  await this.client.getLocaleText('commands.cat.error', i.locale),
                ),
              );

              await i.update({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
              });
            }
          } catch (error) {
            logger.error('Error refreshing cat image:', error);
            const container = new ContainerBuilder().addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                await this.client.getLocaleText('commands.cat.error', i.locale),
              ),
            );

            await i.update({
              components: [container],
              flags: MessageFlags.IsComponentsV2,
            });
          }
        } else if (i.customId.startsWith('help_commands_')) {
          const customIdParts = i.customId.split('_');
          const originalUserId = customIdParts[2];

          if (originalUserId !== i.user.id) {
            return await i.reply({
              content: 'Only the person who used the command can view commands!',
              flags: MessageFlags.Ephemeral,
            });
          }

          const commandCategories: Map<string, string[]> = new Map();

          for (const cmd of this.client.commands.values()) {
            const ClientApplicationCommandCache = this.client.application?.commands.cache.find(
              (command) => command.name === cmd.data.name,
            );
            const category = cmd.category || 'Uncategorized';
            if (!commandCategories.has(category)) {
              commandCategories.set(category, []);
            }

            const localizedDescription = await this.client.getLocaleText(
              `commands.${cmd.data.name}.description`,
              i.locale,
            );
            commandCategories
              .get(category)!
              .push(
                `</${ClientApplicationCommandCache?.name}:${ClientApplicationCommandCache?.id}> - ${localizedDescription}`,
              );
          }

          const container = new ContainerBuilder()
            .setAccentColor(0x5865f2)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('# 📋 **Available Commands**'),
            );

          for (const [category, cmds] of commandCategories.entries()) {
            const localizedCategory = await this.client.getLocaleText(
              `categories.${category}`,
              i.locale,
            );

            container.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`\n## 📂 ${localizedCategory}`),
            );

            container.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                cmds.map((line) => line.replace(/\u007F/g, '')).join('\n'),
              ),
            );
          }

          const backLabel =
            (await this.client.getLocaleText('commands.help.back', i.locale)) || 'Back';
          container.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setStyle(ButtonStyle.Secondary)
                .setLabel(backLabel)
                .setEmoji({ name: '⬅️' })
                .setCustomId(`help_back_${i.user.id}`),
            ),
          );

          await i.update({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
          });
        } else if (i.customId.startsWith('help_back_')) {
          const customIdParts = i.customId.split('_');
          const originalUserId = customIdParts[2];

          if (originalUserId !== i.user.id) {
            return await i.reply({
              content: 'Only the person who used the command can go back!',
              flags: MessageFlags.Ephemeral,
            });
          }

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
            this.client.getLocaleText('commands.help.title', i.locale),
            this.client.getLocaleText('commands.help.about', i.locale),
            this.client.getLocaleText('commands.help.viewcommands', i.locale),
            this.client.getLocaleText('commands.help.supportserver', i.locale),
            this.client.getLocaleText('commands.help.links_social', i.locale),
            this.client.getLocaleText('commands.help.features', i.locale),
            this.client.getLocaleText('commands.help.features_content', i.locale),
            this.client.getLocaleText('commands.help.dashboard', i.locale),
          ]);

          const container = new ContainerBuilder()
            .setAccentColor(0xf4f4f4)

            .addMediaGalleryComponents(
              new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('https://aethel.xyz/aethel_banner_white.png'),
              ),
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`# ${title || 'Aethel Bot'}`),
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(description || 'Get information about Aethel'),
            )
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `\n## **${linksSocialText || 'Links & Social Media'}**`,
              ),
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                '[Website](https://aethel.xyz) • [GitHub](https://github.com/aethel-labs/aethel) • [Bluesky](https://bsky.app/profile/aethel.xyz)',
              ),
            )
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`\n## **${featuresText || 'Features'}**`),
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                featuresContent ||
                  '**Fun Commands** - 8ball, cat/dog images, and more\n' +
                    '**AI Integration** - Powered by OpenAI and other providers\n' +
                    '**Reminders** - Never forget important tasks\n' +
                    '**Utilities** - Weather, help, and productivity tools\n' +
                    '**Multi-language** - Supports multiple languages',
              ),
            )

            .addSeparatorComponents(
              new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true),
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `-# ${dashboardText || 'Dashboard available at https://aethel.xyz/login for To-Dos, Reminders and custom AI API key management'}`,
              ),
            )
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
            .addActionRowComponents(
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder()
                  .setStyle(ButtonStyle.Primary)
                  .setLabel(viewCommandsText || 'Commands')
                  .setCustomId(`help_commands_${i.user.id}`),
                new ButtonBuilder()
                  .setStyle(ButtonStyle.Link)
                  .setLabel(supportServerText || 'Support')
                  .setURL('https://discord.gg/63stE8pEaK'),
              ),
            );

          await i.update({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
          });
        } else if (i.customId === 'refresh_dog') {
          try {
            const response = await fetch('https://api.erm.dog/random-dog', {
              headers: browserHeaders,
            });
            if (!response.ok) {
              const container = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  await this.client.getLocaleText('commands.dog.error', i.locale),
                ),
              );

              return await i.update({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
              });
            }
            let data;
            let isJson = true;
            let url = null;
            try {
              data = (await response.json()) as RandomReddit;
            } catch {
              isJson = false;
            }
            if (isJson && data!.url) {
              url = data!.url;
            } else {
              const response2 = await fetch('https://api.erm.dog/random-dog', {
                headers: browserHeaders,
              });
              url = await response2.text();
              data = { url };
            }
            if (url && url.startsWith('http')) {
              const title = data!.title
                ? sanitizeInput(data!.title).slice(0, 245) + '...'
                : await this.client.getLocaleText('commands.dog.randomdog', i.locale);

              const refreshLabel = await this.client.getLocaleText('commands.dog.newdog', i.locale);

              const container = new ContainerBuilder()
                .setAccentColor(0x8a2be2)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}`))
                .addTextDisplayComponents(
                  new TextDisplayBuilder().setContent(
                    data!.subreddit
                      ? await this.client.getLocaleText('reddit.from', i.locale, {
                          subreddit: data!.subreddit,
                        })
                      : '',
                  ),
                )
                .addMediaGalleryComponents(
                  new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(data!.url),
                  ),
                )
                .addActionRowComponents(
                  new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                      .setStyle(ButtonStyle.Secondary)
                      .setLabel(refreshLabel)
                      .setEmoji({ name: '🐶' })
                      .setCustomId('refresh_dog'),
                  ),
                );

              await i.update({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
              });
            } else {
              const container = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  await this.client.getLocaleText('commands.dog.error', i.locale),
                ),
              );

              await i.update({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
              });
            }
          } catch (error) {
            logger.error('Error refreshing dog image:', error);
            const container = new ContainerBuilder().addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                await this.client.getLocaleText('commands.dog.error', i.locale),
              ),
            );

            await i.update({
              components: [container],
              flags: MessageFlags.IsComponentsV2,
            });
          }
        }
      } catch (error) {
        logger.error('Unexpected error in button interaction:', error);
        await i.update({
          content: await this.client.getLocaleText('unexpectederror', i.locale),
          components: [],
        });
      }
    }
  };
}
