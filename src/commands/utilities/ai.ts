import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ModalSubmitInteraction, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import pool from '@/utils/pgClient';
import { encrypt, decrypt } from '@/utils/encrypt';
import { SlashCommandProps } from '@/types/command';
import BotClient from '@/services/Client';

interface ConversationMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface PendingRequest {
    interaction: ChatInputCommandInteraction;
    prompt: string;
    timestamp: number;
}

interface UserCredentials {
    apiKey?: string | null;
    model?: string | null;
    apiUrl?: string | null;
}

interface User {
    user_id: string;
    api_key_encrypted?: string;
    custom_model?: string;
    custom_api_url?: string;
    updated_at?: Date;
}

interface AIResponse {
    choices?: Array<{
        message?: { content: string };
        text?: string;
    }>;
}

interface ExtendedSlashCommandProps extends SlashCommandProps {
    handleModal: (c: BotClient, i: ModalSubmitInteraction) => Promise<void>;
    processAIRequest: (c: BotClient, i: ChatInputCommandInteraction) => Promise<void>;
}

const userConversations = new Map<string, ConversationMessage[]>();
const pendingRequests = new Map<string, PendingRequest>();

function processUrls(text: string): string {
    return text.replace(
        /(https?:\/\/(?:[\w.-]+)(?:\/[\w\d%/#?&=&%#?\w\d/-]*)?)(?<![.,!?])([.,!?])?(?=(\s|$))/gi,
        (match: string, url: string, punctuation: string | undefined): string => {
            const startIdx = text.indexOf(url);
            const before = text[startIdx - 1];
            const after = text[startIdx + url.length];
            if (before === '<' && after === '>') return url + (punctuation || '');
            return `<${url}>${punctuation || ''}`;
        }
    );
}

async function getUserById(userId: string): Promise<User | undefined> {
    const { rows } = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    return rows[0];
}

async function setUserApiKey(
    userId: string,
    apiKey: string | null,
    model: string | null,
    apiUrl: string | null
): Promise<void> {
    if (apiKey === null) {
        await pool.query(
            `UPDATE users  
         SET api_key_encrypted = NULL, 
             custom_model = NULL,  
             custom_api_url = NULL, 
             updated_at = now() 
         WHERE user_id = $1`,
            [userId]
        );
    } else {
        const encrypted = encrypt(apiKey);
        await pool.query(
            `INSERT INTO users (user_id, api_key_encrypted, custom_model, custom_api_url, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (user_id) 
         DO UPDATE SET 
           api_key_encrypted = $2, 
           custom_model = $3, 
           custom_api_url = $4, 
           updated_at = now()`,
            [userId, encrypted, model, apiUrl]
        );
    }

    userConversations.delete(userId);
}

async function getUserCredentials(userId: string): Promise<UserCredentials> {
    const user = await getUserById(userId);
    if (!user) return {};
    let apiKey: string | null = null;
    if (user.api_key_encrypted) {
        try {
            apiKey = decrypt(user.api_key_encrypted);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
            // console.error('Failed to decrypt API key for user', userId, e);
        }
    }
    return {
        apiKey,
        model: user.custom_model,
        apiUrl: user.custom_api_url,
    };
}

async function incrementAndCheckDailyLimit(userId: string, limit: number = 20): Promise<boolean> {
    const today = new Date().toISOString().slice(0, 10);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query('INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [
            userId,
        ]);
        const res = await client.query(
            `INSERT INTO ai_usage (user_id, usage_date, count) VALUES ($1, $2, 1)
         ON CONFLICT (user_id, usage_date) DO UPDATE SET count = ai_usage.count + 1 RETURNING count`,
            [userId, today]
        );
        await client.query('COMMIT');
        return res.rows[0].count <= limit;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('ai')
        .setNameLocalizations({
            'es-ES': 'ia',
            'es-419': 'ia',
            'en-US': 'ai',
        })
        .setDescription('Chat with an AI assistant')
        .setDescriptionLocalizations({
            'es-ES': 'Chatea con un asistente de IA',
            'es-419': 'Chatea con un asistente de IA',
            'en-US': 'Chat with an AI assistant',
        })
        .addStringOption((option) =>
            option
                .setName('prompt')
                .setNameLocalizations({
                    'es-ES': 'mensaje',
                    'es-419': 'mensaje',
                    'en-US': 'prompt',
                })
                .setDescription('Your message to the AI')
                .setDescriptionLocalizations({
                    'es-ES': 'Tu mensaje para la IA',
                    'es-419': 'Tu mensaje para la IA',
                    'en-US': 'Your message to the AI',
                })
                .setRequired(true)
        )
        .addBooleanOption((option) =>
            option.setName('use_custom_api').setDescription('Use your own API key?').setRequired(false)
        )
        .addBooleanOption((option) =>
            option.setName('reset').setDescription('Reset your AI chat history').setRequired(false)
        ),

    async execute(client, interaction) {
        const userId = interaction.user.id;

        if (pendingRequests.has(userId)) {
            const pending = pendingRequests.get(userId);
            if (pending && pending.timestamp && Date.now() - pending.timestamp > 30000) {
                pendingRequests.delete(userId);
            } else {
                return interaction.reply({
                    content: await client.getLocaleText("commands.ai.request.inprogress", interaction.locale),
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        try {
            const useCustomApi = interaction.options.getBoolean('use_custom_api');
            const prompt = interaction.options.getString('prompt');
            const reset = interaction.options.getBoolean('reset');

            pendingRequests.set(userId, { interaction, prompt: prompt!, timestamp: Date.now() });

            if (reset) {
                userConversations.delete(userId);
                await interaction.reply({
                    content: await client.getLocaleText("commands.reset", interaction.locale),
                    flags: MessageFlags.Ephemeral
                });
                pendingRequests.delete(userId);
                return;
            }

            if (useCustomApi === false) {
                await setUserApiKey(userId, null, null, null);
                userConversations.delete(userId);
                await interaction.reply({
                    content: await client.getLocaleText("commands.ai.defaultapi", interaction.locale),
                    flags: MessageFlags.Ephemeral
                });

                await this.processAIRequest(client, interaction);
                return;
            }

            const { apiKey } = await getUserCredentials(userId);
            if (useCustomApi && !apiKey) {
                const modal = new ModalBuilder().setCustomId('apiCredentials').setTitle(
                    await client.getLocaleText('commands.ai.modal.title', interaction.locale)
                );

                const apiKeyInput = new TextInputBuilder()
                    .setCustomId('apiKey')
                    .setLabel(await client.getLocaleText('commands.ai.modal.apikey', interaction.locale))
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(
                        await client.getLocaleText('commands.ai.modal.apikeyplaceholder', interaction.locale)
                    )
                    .setRequired(true);

                const apiUrlInput = new TextInputBuilder()
                    .setCustomId('apiUrl')
                    .setLabel(await client.getLocaleText('commands.ai.modal.apiurl', interaction.locale))
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(
                        await client.getLocaleText('commands.ai.modal.apiurlplaceholder', interaction.locale)
                    )
                    .setRequired(true);

                const modelInput = new TextInputBuilder()
                    .setCustomId('model')
                    .setLabel(await client.getLocaleText('commands.ai.modal.model', interaction.locale))
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(
                        await client.getLocaleText('commands.ai.modal.modelplaceholder', interaction.locale)
                    )
                    .setRequired(true);

                const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(apiKeyInput);
                const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(apiUrlInput);
                const thirdActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(modelInput);

                modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

                await interaction.showModal(modal);
            } else if (useCustomApi) {
                await interaction.deferReply();
                await this.processAIRequest(client, interaction);
            } else {
                await interaction.deferReply();
                await this.processAIRequest(client, interaction);
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
            pendingRequests.delete(userId);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: await client.getLocaleText("failedrequest", interaction.locale),
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.editReply({
                    content: await client.getLocaleText("failedrequest", interaction.locale),
                });
            }
        }
    },

    async handleModal(client, interaction) {
        try {
            if (interaction.customId === 'apiCredentials') {
                await interaction.deferReply({ ephemeral: false });

                const userId = interaction.user.id;
                const pendingRequest = pendingRequests.get(userId);

                if (!pendingRequest) {
                    return interaction.editReply(
                        await client.getLocaleText("commands.ai.nopendingrequest", interaction.locale)
                    );
                }

                const { interaction: originalInteraction } = pendingRequest;

                const apiKey = interaction.fields.getTextInputValue('apiKey').trim();
                const apiUrl = interaction.fields.getTextInputValue('apiUrl').trim();
                const model = interaction.fields.getTextInputValue('model').trim();

                await setUserApiKey(userId, apiKey, model, apiUrl);

                await interaction.followUp({
                    // '✅ API credentials saved. You can now use the `/ai` command without re-entering your credentials. To stop using your key, do `/ai use_custom_api false`'
                    content: "✅ " + await client.getLocaleText("commands.ai.apicredssaved", interaction.locale),
                    ephemeral: true,
                });

                if (!originalInteraction.deferred && !originalInteraction.replied) {
                    await originalInteraction.deferReply();
                }
                await this.processAIRequest(client, originalInteraction);
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
            await interaction.editReply({
                content: await client.getLocaleText("failedrequest", interaction.locale),
            });
        } finally {
            pendingRequests.delete(interaction.user.id);
        }
    },

    async processAIRequest(client, interaction): Promise<void> {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply();
            }
            
            const prompt = interaction.options.getString('prompt');
            const { apiKey, model, apiUrl } = await getUserCredentials(interaction.user.id);

            const usingCustomApi = !!apiKey;
            let finalApiUrl = apiUrl || 'https://openrouter.ai/api/v1/chat/completions';
            const finalApiKey = apiKey || process.env.OPENROUTER_API_KEY;
            let finalModel = model || (usingCustomApi ? 'openai/gpt-4.1-mini' : 'x-ai/grok-3-mini-beta');

            const usingDefaultKey = !usingCustomApi && process.env.OPENROUTER_API_KEY;
            if (usingDefaultKey) {
                finalApiUrl = 'https://openrouter.ai/api/v1/chat/completions';
                finalModel = 'x-ai/grok-3-mini-beta';
            }

            if (usingDefaultKey) {
                if (interaction.user.id !== '827389583342698536') {
                    const allowed = await incrementAndCheckDailyLimit(interaction.user.id, 10);
                    if (!allowed) {
                        await interaction.editReply("❌ " + await client.getLocaleText("commands.ai.process.dailylimit", interaction.locale));
                        return;
                    }
                }
            } else if (!finalApiKey) {
                await interaction.editReply("❌" + await client.getLocaleText("commands.ai.process.noapikey", interaction.locale));
                return
            }

            let conversation = userConversations.get(interaction.user.id) || [];

            const baseInstructions = `You are a helpful, accurate, and privacy-respecting AI assistant for the /ai command of the Aethel Discord User Bot. Your primary goal is to provide clear, concise, and friendly answers to user questions, adapting your tone to be conversational and approachable. Only mention your AI model or the /ai command if it is directly relevant to the user's request—do not introduce yourself with this information by default.
  
  **IMPORTANT INSTRUCTIONS ABOUT URLS:**
  - NEVER format, modify, or alter URLs in any way. Leave them exactly as they are.
  - DO NOT add markdown, backticks, or any formatting to URLs.
  - DO NOT add or remove any characters from URLs.
  - The system will handle URL formatting automatically.
  
  **BOT FACTS (use only if asked about the bot):**
  - Name: Aethel
  - Website: https://aethel.xyz
  - Type: Discord user bot (not a server bot; only added to users, not servers)
  - Supported commands: /8ball, /ai, /wiki, /weather, /joke, /remind, /cat, /dog, /help
  - /remind: Can be used with /remind time message, or by right-clicking a message and selecting Apps > Remind Me
  - /dog and /cat: Show an embed with a new dog/cat button (dog images from erm.dog, cat images from pur.cat)
  - The bot status and info are available on its website.
  
  When answering questions about the Aethel bot, only use the above factual information. Do not speculate about features or commands not listed here.
  
  Format your responses using Discord markdown (bold, italics, code blocks, lists, etc) where appropriate, but NEVER format URLs—leave them as-is. Only greet the user at the start of a new conversation, not in every message. Always prioritize being helpful, accurate, and respectful.`;

            const isDefaultModel = usingDefaultKey || !finalApiKey;
            const modelSpecificInstructions = isDefaultModel
                ? '\n\n**IMPORTANT (DEFAULT MODEL ONLY):** Please keep your responses under 3000 characters. Be concise and to the point.'
                : '';

            const systemInstructions = baseInstructions + modelSpecificInstructions;
            conversation = conversation.filter((msg) => msg.role !== 'system');
            conversation.push({ role: 'user', content: prompt! });
            if (conversation.length > 9) conversation = conversation.slice(-9);
            const systemMessage: ConversationMessage = {
                role: 'system',
                content: systemInstructions,
            };
            conversation.unshift(systemMessage);
            const messages = conversation;

            const maxTokens = usingDefaultKey ? 1000 : 3000;

            const requestBody = {
                model: finalModel,
                messages: messages,
                max_tokens: maxTokens,
            };
            const headers: Record<string, string> = {
                Authorization: `Bearer ${finalApiKey}`,
                'Content-Type': 'application/json',
            };
            if (finalApiUrl === 'https://openrouter.ai/api/v1/chat/completions') {
                headers['HTTP-Referer'] = 'https://github.com/aethel-labs/aethel';
            }

            const response = await fetch(finalApiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody),
            });

            const responseText = await response.text();

            if (!response.ok) {
                let errorMessage = 'Unknown error';
                try {
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        const errorData = JSON.parse(responseText);
                        errorMessage = errorData.error?.message || JSON.stringify(errorData);
                    } else {
                        errorMessage = `HTTP ${response.status} - ${response.statusText}`;
                    }
                    pendingRequests.delete(interaction.user.id);
                    await interaction.editReply(await client.getLocaleText("failedrequest", interaction.locale));
                    console.log(errorMessage);
                    return
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                } catch (e) {
                    pendingRequests.delete(interaction.user.id);
                    await interaction.editReply(await client.getLocaleText("failedrequest", interaction.locale));
                    return
                }
            }

            let data: AIResponse;
            try {
                data = JSON.parse(responseText);
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (e) {
                pendingRequests.delete(interaction.user.id);
                await interaction.editReply("❌ " + await client.getLocaleText("commands.ai.errors.failed", interaction.locale));
                return
            }

            let aiResponse: string;
            if (data.choices && data.choices[0]?.message?.content) {
                aiResponse = data.choices[0].message.content;
            } else if (data.choices && data.choices[0]?.text) {
                aiResponse = data.choices[0].text;
            } else {
                aiResponse = "❌ " + await client.getLocaleText("commands.ai.errors.nores", interaction.locale);
            }

            conversation.push({ role: 'assistant', content: aiResponse });

            if (conversation.length > 10) conversation = conversation.slice(-10);
            userConversations.set(interaction.user.id, conversation);

            const maxLength = 2000;

            const processedResponse = processUrls(aiResponse);

            if (processedResponse.length <= maxLength) {
                await interaction.editReply(processedResponse);
                return;
            }

            const chunks: string[] = [];
            let remaining = aiResponse;

            while (remaining.length > 0) {
                const chunk = remaining.substring(0, maxLength);
                chunks.push(chunk);
                remaining = remaining.substring(chunk.length);

                if (remaining.length > 0 && remaining[0] !== '\n') {
                    const nextNewline = remaining.indexOf('\n');
                    if (nextNewline > 0 && nextNewline <= 50) {
                        const extra = remaining.substring(0, nextNewline + 1);
                        chunks[chunks.length - 1] += extra;
                        remaining = remaining.substring(extra.length);
                    }
                }
            }

            try {
                const processedFirstChunk = processUrls(chunks[0]);
                await interaction.editReply(processedFirstChunk);
                for (let i = 1; i < chunks.length; i++) {
                    const processedChunk = processUrls(chunks[i]);
                    await interaction.followUp({
                        content: processedChunk,
                        ephemeral: true,
                    });
                }
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (error) {
                try {
                    await interaction.editReply(`${chunks[0]}\n\n*${"❌ " + await client.getLocaleText("commands.ai.errors.toolong", interaction.locale)}*`);
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                } catch (e) {
                    // Swallow error
                }
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
            try {
                await interaction.editReply(await client.getLocaleText("failedrequest", interaction.locale));
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (e) {
                // Swallow error
            }
        } finally {
            pendingRequests.delete(interaction.user.id);
        }
    },
} as ExtendedSlashCommandProps;