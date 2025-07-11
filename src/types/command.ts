import BotClient from "@/services/Client";
import { ChatInputCommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, ModalSubmitInteraction, SlashCommandBuilder, AutocompleteInteraction } from "discord.js";

export interface SlashCommandProps {
    data: SlashCommandBuilder,
    category?: string,
    execute: (client: BotClient, interaction: ChatInputCommandInteraction) => Promise<void>;
    autocomplete?: (client: BotClient, interaction: AutocompleteInteraction) => Promise<void>;
}

export interface RemindCommandProps extends SlashCommandProps {
    contextMenu: ContextMenuCommandBuilder,
    contextMenuExecute: (c: BotClient, i: ContextMenuCommandInteraction) => Promise<void>;
    handleModal: (c: BotClient, i: ModalSubmitInteraction) => Promise<void>;
}