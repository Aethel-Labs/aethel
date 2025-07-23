import { browserHeaders } from '@/constants/index';
import BotClient from '@/services/Client';
import { RandomReddit } from '@/types/base';
import { RemindCommandProps } from '@/types/command';
import logger from '@/utils/logger';
import { sanitizeInput, getUnallowedWordCategory } from '@/utils/validation';
import { isUserBanned, incrementUserStrike } from '@/utils/userStrikes';
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
      const userId = i.user.id;
      const bannedUntil = await isUserBanned(userId);
      if (bannedUntil) {
        return i.reply({
          content: `You are banned from using Aethel commands until <t:${Math.floor(bannedUntil.getTime() / 1000)}:F>.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const options = i.options.data;
      for (const opt of options) {
        if (typeof opt.value === 'string') {
          const category = getUnallowedWordCategory(opt.value);
          if (category) {
            const { strike_count, banned_until } = await incrementUserStrike(userId);
            if (banned_until && new Date(banned_until) > new Date()) {
              return i.reply({
                content: `You have been banned from using Aethel commands for 7 days due to repeated use of unallowed language. Ban expires: <t:${Math.floor(new Date(banned_until).getTime() / 1000)}:F>.`,
                flags: MessageFlags.Ephemeral,
              });
            } else {
              return i.reply({
                content: `Your request was flagged by Aethel for ${category}. You have ${strike_count}/5 strikes. For more information, visit https://aethel.xyz/legal/terms`,
                flags: MessageFlags.Ephemeral,
              });
            }
          }
        }
      }
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
      } else if (i.customId === 'apiCredentials') {
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
                      : ''
                  )
                )
                .addMediaGalleryComponents(
                  new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(data.url))
                )
                .addActionRowComponents(
                  new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                      .setStyle(ButtonStyle.Danger)
                      .setLabel(refreshLabel)
                      .setEmoji({ name: '🐱' })
                      .setCustomId('refresh_cat')
                  )
                );

              await i.update({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
              });
            } else {
              const container = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  await this.client.getLocaleText('commands.cat.error', i.locale)
                )
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
                await this.client.getLocaleText('commands.cat.error', i.locale)
              )
            );

            await i.update({
              components: [container],
              flags: MessageFlags.IsComponentsV2,
            });
          }
        } else if (i.customId.startsWith('8ball_reroll_')) {
          const customIdParts = i.customId.split('_');
          const originalUserId = customIdParts[2];

          if (originalUserId !== i.user.id) {
            return await i.reply({
              content: 'Only the person who used the command can reroll the 8ball!',
              flags: MessageFlags.Ephemeral,
            });
          }

          let question = 'What will happen?';

          try {
            const customIdParts = i.customId.split('_');
            if (customIdParts.length >= 5) {
              const encodedQuestion = customIdParts.slice(4).join('_');
              question = decodeURIComponent(encodedQuestion);
            }
          } catch (error) {
            console.log('Error extracting question:', error);
          }

          const responses = [
            'itiscertain',
            'itisdecidedlyso',
            'withoutadoubt',
            'yesdefinitely',
            'youmayrelyonit',
            'asiseeityes',
            'mostlikely',
            'outlookgood',
            'yes',
            'signspointtoyes',
            'replyhazytryagain',
            'askagainlater',
            'betternottellyounow',
            'cannotpredictnow',
            'concentrateandaskagain',
            'dontcountonit',
            'myreplyisno',
            'mysourcessayno',
            'outlooknotsogood',
            'verydoubtful',
          ];

          const randomResponse = responses[Math.floor(Math.random() * responses.length)];

          const title = await this.client.getLocaleText('commands.8ball.says', i.locale);
          const questionLabel = await this.client.getLocaleText(
            'commands.8ball.question',
            i.locale
          );
          const answerLabel = await this.client.getLocaleText('commands.8ball.answer', i.locale);
          const askAgainLabel = await this.client.getLocaleText(
            'commands.8ball.askagain',
            i.locale
          );

          const translatedResponse = await this.client.getLocaleText(
            `commands.8ball.responces.${randomResponse}`,
            i.locale
          );

          const container = new ContainerBuilder()
            .setAccentColor(0x8b5cf6)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🔮 ${title}`))
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`**${questionLabel}**\n> ${question}\n\n`)
            )
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ✨ ${answerLabel}`))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(translatedResponse))
            .addActionRowComponents(
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setStyle(ButtonStyle.Primary)
                  .setLabel(askAgainLabel)
                  .setEmoji({ name: '🎱' })
                  .setCustomId(
                    `8ball_reroll_${i.user.id}_${Date.now()}_${encodeURIComponent(question)}`
                  )
              )
            );

          await i.update({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
          });
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
              (command) => command.name == cmd.data.name
            );
            const category = cmd.category || 'Uncategorized';
            if (!commandCategories.has(category)) {
              commandCategories.set(category, []);
            }

            const localizedDescription = await this.client.getLocaleText(
              `commands.${cmd.data.name}.description`,
              i.locale
            );
            commandCategories
              .get(category)!
              .push(
                `</${ClientApplicationCommandCache?.name}:${ClientApplicationCommandCache?.id}> - ${localizedDescription}`
              );
          }

          const container = new ContainerBuilder()
            .setAccentColor(0x5865f2)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('# 📋 **Available Commands**')
            );

          for (const [category, cmds] of commandCategories.entries()) {
            const localizedCategory = await this.client.getLocaleText(
              `categories.${category}`,
              i.locale
            );

            container.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`\n## 📂 ${localizedCategory}`)
            );

            container.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                cmds.map((line) => line.replace(/\u007F/g, '')).join('\n')
              )
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
                .setCustomId(`help_back_${i.user.id}`)
            )
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
            .setAccentColor(0x5865f2)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`# ${title || 'Aethel Bot'}`)
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                description ||
                  'Enhance your server with fun commands, utilities, and AI-powered features.'
              )
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
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setStyle(ButtonStyle.Primary)
                  .setLabel(viewCommandsText || 'Commands')
                  .setCustomId(`help_commands_${i.user.id}`),
                new ButtonBuilder()
                  .setStyle(ButtonStyle.Link)
                  .setLabel(supportServerText || 'Support')
                  .setURL('https://discord.gg/labs')
              )
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
                  await this.client.getLocaleText('commands.dog.error', i.locale)
                )
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
                      : ''
                  )
                )
                .addMediaGalleryComponents(
                  new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(data!.url)
                  )
                )
                .addActionRowComponents(
                  new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                      .setStyle(ButtonStyle.Secondary)
                      .setLabel(refreshLabel)
                      .setEmoji({ name: '🐶' })
                      .setCustomId('refresh_dog')
                  )
                );

              await i.update({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
              });
            } else {
              const container = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  await this.client.getLocaleText('commands.dog.error', i.locale)
                )
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
                await this.client.getLocaleText('commands.dog.error', i.locale)
              )
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
      return;
    }
  };
}
