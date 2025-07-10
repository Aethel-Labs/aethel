/* eslint-disable @typescript-eslint/no-unused-vars */
import { browserHeaders } from "@/constants/index";
import BotClient from "@/services/Client";
import { RandomReddit } from "@/types/base";
import { RemindCommandProps } from "@/types/command";
import logger from "@/utils/logger";
import { sanitizeInput } from "@/utils/validation.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ClientEvents, EmbedBuilder, MessageFlags } from "discord.js";

type InteractionHandler = (...args: ClientEvents['interactionCreate']) => void;

export default class InteractionCreateEvent {
    private client: BotClient;
    constructor(c: BotClient) {
        this.client = c;
        c.on('interactionCreate', this.handleInteraction.bind(this));
    }

    private handleInteraction: InteractionHandler = async (i) => {
        if (i.isChatInputCommand()) {
            const command = this.client.commands.get(i.commandName);
            if (!command) {
                return i.reply({
                    content: "Command not found",
                    flags: [MessageFlags.Ephemeral]
                });
            };
            try {
                command.execute(this.client, i);
            } catch (e) {
                console.error(`[COMMAND ERROR] ${i.commandName}:`, e);;
                await i.reply({
                    content: 'There was an error executing this command!',
                    ephemeral: true,
                });
            };
        };
        if (i.isModalSubmit()) {
            if (i.customId.startsWith('remind')) {
                const remind = this.client.commands.get('remind') as RemindCommandProps;
                if (remind && remind.handleModal) {
                    await remind.handleModal(this.client, i);
                }
            }
            return;
        };
        if (i.isMessageContextMenuCommand()) {
            const command = this.client.commands.get(i.commandName) as RemindCommandProps;
            if (!command) {
                await i.reply({ content: "Error Occured, Please try again later" })
            };
            command.contextMenuExecute(this.client, i);
        };
        if (i.isButton()) {
            try {
                const originalUser = i.message.interaction!.user;
                if (originalUser.id !== i.user.id) {
                    return await i.reply({
                        content: 'Only the person who used the command can refresh the image!',
                        ephemeral: true,
                    });
                }

                if (i.customId === 'refresh_cat') {
                    try {
                        const response = await fetch('https://api.pur.cat/random-cat');
                        if (!response.ok) {
                            return await i.update({
                                content: await this.client.getLocaleText("commands.cat.error", i.locale),
                                components: [],
                            });
                        }
                        const data = await response.json() as RandomReddit;
                        if (data.url) {
                            const title = data.title ? sanitizeInput(data.title).slice(0, 245) + '...' : await this.client.getLocaleText("random.cat", i.locale);

                            const embed = new EmbedBuilder().setColor(0xfaa0a0).setTitle(title).setImage(data.url);

                            const footerText = await this.client.getLocaleText("poweredby", i.locale) + " pur.cat";
                            embed.setFooter({ text: footerText });

                            if (data.subreddit) {
                                const fromText = await this.client.getLocaleText("reddit.from", i.locale, { subreddit: data.subreddit });
                                embed.setDescription(fromText);
                            }
                            const refreshLabel = await this.client.getLocaleText("commands.cat.newcat", i.locale);
                            const refreshButton = new ButtonBuilder()
                                .setCustomId('refresh_cat')
                                .setLabel(refreshLabel)
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('🐱');
                            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(refreshButton);
                            await i.update({
                                embeds: [embed],
                                components: [row],
                            });
                        } else {
                            await i.update({
                                content: await this.client.getLocaleText("commands.cat.error", i.locale),
                                components: [],
                            });
                        }
                    } catch (error) {
                        logger.error('Error refreshing cat image:', error);
                        await i.update({
                            content: await this.client.getLocaleText("commands.cat.error", i.locale),
                            components: [],
                        });
                    }
                } else if (i.customId === 'refresh_dog') {
                    try {
                        const response = await fetch('https://api.erm.dog/random-dog', {
                            headers: browserHeaders,
                        });
                        if (!response.ok) {
                            return await i.update({
                                content: await this.client.getLocaleText("commands.dog.error", i.locale),
                                components: [],
                            });
                        }
                        let data;
                        let isJson = true;
                        let url = null;
                        try {
                            data = await response.json() as RandomReddit;
                        } catch (e) {
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
                            const title = data!.title ? sanitizeInput(data!.title).slice(0, 245) + '...' : await this.client.getLocaleText("commands.dog.randomdog", i.locale);

                            const embed = new EmbedBuilder().setColor(0x8a2be2).setTitle(title).setImage(data!.url);

                            const footerText = await this.client.getLocaleText("poweredby", i.locale) + " erm.dog";
                            embed.setFooter({ text: footerText });

                            if (data!.subreddit) {
                                const fromText = await this.client.getLocaleText("reddit.from", i.locale, { subreddit: data!.subreddit });
                                embed.setDescription(fromText);
                            }
                            const refreshLabel = await this.client.getLocaleText("commands.dog.newdog", i.locale);
                            const refreshButton = new ButtonBuilder()
                                .setCustomId('refresh_dog')
                                .setLabel(refreshLabel)
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji('🐶');
                            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(refreshButton);
                            await i.update({
                                embeds: [embed],
                                components: [row],
                            });
                        } else {
                            await i.update({
                                content: await this.client.getLocaleText("commands.dog.error", i.locale),
                                components: [],
                            });
                        }
                    } catch (error) {
                        await i.update({
                            content: await this.client.getLocaleText("commands.dog.error", i.locale),
                            components: [],
                        });
                    }
                }
            } catch (error) {
                await i.update({
                    content: await this.client.getLocaleText("unexpectederror", i.locale),
                    components: [],
                });
            }
            return;
        }
    };
};