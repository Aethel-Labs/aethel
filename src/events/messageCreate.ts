import { Message, ChannelType, type ChatInputCommandInteraction } from 'discord.js';
import BotClient from '@/services/Client';
import logger from '@/utils/logger';
import {
  makeAIRequest,
  getApiConfiguration,
  buildSystemPrompt as originalBuildSystemPrompt,
  buildConversation,
  getUserCredentials,
  incrementAndCheckDailyLimit,
  incrementAndCheckServerDailyLimit,
  splitResponseIntoChunks,
  processUrls,
} from '@/commands/utilities/ai';

function buildSystemPrompt(
  usingDefaultKey: boolean,
  client?: BotClient,
  model?: string,
  username?: string,
  interaction?: ChatInputCommandInteraction,
  isServer?: boolean,
  serverName?: string,
): string {
  const basePrompt = originalBuildSystemPrompt(
    usingDefaultKey,
    client,
    model,
    username,
    interaction,
    isServer,
    serverName,
  );

  const reactionInstructions = `
**AVAILABLE TOOLS:**

**REACTION TOOLS:**
- {reaction:"😀"} - React to the user's message with a unicode emoji
- {reaction:{"emoji":":thumbsup:"}} - React using a named emoji if available
- {reaction:{"emoji":"<:name:123456789012345678>"}} - React with a custom emoji by ID (or animated <a:name:id>)

**REACTION GUIDELINES:**
- When asked to react, ALWAYS use the {reaction:"emoji"} tool call
- Use reactions sparingly and only when it adds value to the conversation
- Add at most 1–2 reactions for a single message
- Do not include the reaction tool call text in your visible reply
- Common reactions: 😀 😄 👍 👎 ❤️ 🔥 ⭐ 🎉 👏
- Example: If asked to react with thumbs up, use {reaction:"👍"} and respond normally
- IMPORTANT: If you use a reaction tool, you MUST also provide a text response - never use ONLY a reaction tool
- The reaction tool is for adding emoji reactions, not for replacing your response

**NEW MESSAGE TOOL - CRITICAL GUIDELINES:**
**WHAT IT DOES:**
- {newmessage:} splits your response into multiple Discord messages
- This simulates how real users send follow-up messages
- Use it to break up long responses or create natural conversation flow

**WHEN TO USE IT:**
- Only when you have SUBSTANTIAL content to split (multiple paragraphs, distinct thoughts)
- When your response is naturally long and would benefit from being split
- DO NOT use it for short responses or single sentences

**HOW TO USE IT CORRECTLY:**
- Place it BETWEEN meaningful parts of your response
- You MUST have content BEFORE and AFTER the tool
- CORRECT: "Here's my first point about this topic. {newmessage:} And here's my second point that continues the thought."
- CORRECT: "Let me explain this in parts. First, the background information. {newmessage:} Now, here's how it applies to your situation."

**NEVER DO THESE - THEY ARE WRONG:**
- WRONG: "{newmessage:} Here's my response" (starts with the tool)
- WRONG: "Here's my response {newmessage:}" (ends with the tool)
- WRONG: "{newmessage:}" (tool by itself with no content)
- WRONG: Using it for responses under 200 characters
- WRONG: Using it to split single sentences or short phrases

**VALIDATION CHECK:**
- Before using {newmessage:}, ask yourself: "Do I have meaningful content both before AND after this tool?"
- If the answer is NO, don't use the tool
- If your response is short, send it as one message
- The tool should feel natural and conversational, not forced

**EXAMPLES OF PROPER USAGE:**
- "I've analyzed your code and found several issues. The first is a syntax error on line 23. {newmessage:} The second issue is a logical error in your loop condition that could cause an infinite loop."
- "Let me break down the solution for you. Step 1: Understand the problem by identifying the root cause. {newmessage:} Step 2: Implement the fix by refactoring the problematic function. {newmessage:} Step 3: Test your solution thoroughly before deploying."

**IMPORTANT DISTINCTION:**
- \`{newmessage:}\` is a FORMATTING TOOL - it just splits your response into multiple messages
- \`{newmessage:}\` does NOT execute any real functionality like other tools
- You can use \`{newmessage:}\` without any other tool calls - it's just for message formatting
- Don't expect any feedback or results from \`{newmessage:}\` - it just creates a new message

**AVOIDING TOOL LOOPS:**
- If you find yourself repeatedly trying to use tools but generating no content, STOP and respond normally
- If your tool usage isn't working as expected, provide a simple text response instead
- Never let tool usage prevent you from giving a helpful response
- When in doubt, respond with plain text rather than complex tool combinations
`;

  return basePrompt + reactionInstructions;
}

import { extractToolCalls as extractSlashToolCalls } from '@/utils/commandExecutor';
import _fetch from '@/utils/dynamicFetch';
import { executeMessageToolCall, type MessageToolCall } from '@/utils/messageToolExecutor';
import type { ConversationMessage, AIResponse } from '@/commands/utilities/ai';
import pool from '@/utils/pgClient';

type ApiConfiguration = ReturnType<typeof getApiConfiguration>;
import { createMemoryManager } from '@/utils/memoryManager';

const serverConversations = createMemoryManager<string, ConversationMessage[]>({
  maxSize: 5000,
  maxAge: 2 * 60 * 60 * 1000,
  cleanupInterval: 10 * 60 * 1000,
});

const serverMessageContext = createMemoryManager<
  string,
  Array<{
    username: string;
    content: string;
    timestamp: number;
  }>
>({
  maxSize: 5000,
  maxAge: 2 * 60 * 60 * 1000,
  cleanupInterval: 10 * 60 * 1000,
});

const userConversations = createMemoryManager<string, ConversationMessage[]>({
  maxSize: 2000,
  maxAge: 2 * 60 * 60 * 1000,
  cleanupInterval: 10 * 60 * 1000,
});

function extractMessageToolCalls(content: string): {
  cleanContent: string;
  toolCalls: MessageToolCall[];
} {
  const { cleanContent, toolCalls } = extractSlashToolCalls(content);

  return { cleanContent, toolCalls };
}

function getServerConversationKey(guildId: string): string {
  return `server:${guildId}`;
}

function getUserConversationKey(userId: string): string {
  return `dm:${userId}`;
}

export default class MessageCreateEvent {
  constructor(private client: BotClient) {
    this.client = client;
    client.on('messageCreate', this.execute.bind(this));
  }

  private async execute(message: Message): Promise<void> {
    logger.debug(`Message received in channel type: ${message.channel.type}`);

    if (message.author.bot) {
      logger.debug('Ignoring message from bot');
      return;
    }

    const isDM = message.channel.type === ChannelType.DM;
    const isMentioned =
      message.mentions.users.has(this.client.user!.id) && !message.mentions.everyone;

    if (!isDM && message.guildId) {
      const contextKey = getServerConversationKey(message.guildId);
      const existingContext = serverMessageContext.get(contextKey) || [];

      const newMessage = {
        username: message.author.username,
        content: message.content,
        timestamp: Date.now(),
      };

      const updatedContext = [...existingContext, newMessage].slice(-10);
      serverMessageContext.set(contextKey, updatedContext);
    }

    if (!isDM && !isMentioned) {
      logger.debug(
        `Storing message for context but not responding - not a DM and bot not mentioned (channel type: ${message.channel.type})`,
      );
      return;
    }

    logger.info(isDM ? 'Processing DM message...' : 'Processing mention in server...');

    try {
      logger.debug(
        `${isDM ? 'DM' : 'Message'} received (${message.content.length} characters) - content hidden for privacy`,
      );

      const hasImageAttachments = message.attachments.some(
        (att) =>
          att.contentType?.startsWith('image/') ||
          att.name?.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i),
      );

      logger.debug(`hasImageAttachments: ${hasImageAttachments}`);
      const hasImages = hasImageAttachments;

      let selectedModel: string;
      let config: ApiConfiguration;
      let usingDefaultKey = true;

      if (isDM) {
        const {
          model: userCustomModel,
          apiKey: userApiKey,
          apiUrl: userApiUrl,
        } = await getUserCredentials(message.author.id);

        selectedModel = hasImages
          ? 'google/gemma-3-4b-it'
          : userCustomModel || 'moonshotai/kimi-k2';

        config = getApiConfiguration(userApiKey ?? null, selectedModel, userApiUrl ?? null);
        usingDefaultKey = config.usingDefaultKey;
      } else {
        selectedModel = hasImages ? 'google/gemma-3-4b-it' : 'moonshotai/kimi-k2';

        config = getApiConfiguration(null, selectedModel, null);
        if (config.usingDefaultKey && !config.finalApiKey) {
          await message.reply({
            content:
              '❌ AI is not configured. Please set OPENROUTER_API_KEY on the bot, or use `/ai` with your own API key.',
            allowedMentions: { parse: ['users'] as const },
          });
          return;
        }
      }

      logger.info(
        `Using model: ${selectedModel} for message with images: ${hasImages}${
          isDM && !usingDefaultKey ? ' (user custom model)' : ' (default model)'
        }`,
      );

      let replyContext = '';
      if (message.reference?.messageId) {
        try {
          const repliedTo = await message.channel.messages.fetch(message.reference.messageId);
          if (repliedTo) {
            replyContext = `[Replying to ${repliedTo.author.username}: ${repliedTo.content}]\n\n`;
          }
        } catch (error) {
          logger.debug('Error fetching replied message:', error);
        }
      }

      const systemPrompt = buildSystemPrompt(
        usingDefaultKey,
        this.client,
        selectedModel,
        message.author.username,
        undefined,
        !isDM,
        !isDM ? message.guild?.name : undefined,
      );

      const baseContent = isDM ? message.content : message.content.replace(/<@!?\d+>/g, '').trim();
      const messageWithContext = replyContext ? `${replyContext}${baseContent}` : baseContent;

      let messageContent:
        | string
        | Array<{
            type: 'text' | 'image_url';
            text?: string;
            image_url?: {
              url: string;
              detail?: 'low' | 'high' | 'auto';
            };
          }>;

      if (hasImages) {
        const imageAttachments = message.attachments.filter(
          (att) =>
            att.contentType?.startsWith('image/') ||
            att.name?.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i),
        );

        const contentArray: Array<{
          type: 'text' | 'image_url';
          text?: string;
          image_url?: {
            url: string;
            detail?: 'low' | 'high' | 'auto';
          };
        }> = [];

        if (messageWithContext.trim()) {
          contentArray.push({
            type: 'text',
            text: messageWithContext,
          });
        }

        imageAttachments.forEach((att) => {
          contentArray.push({
            type: 'image_url',
            image_url: {
              url: att.url,
              detail: 'auto',
            },
          });
        });

        messageContent = contentArray;
      } else {
        messageContent = messageWithContext;
      }

      let conversation: ConversationMessage[] = [];

      if (isDM) {
        const conversationKey = getUserConversationKey(message.author.id);
        conversation = userConversations.get(conversationKey) || [];
      } else {
        const serverKey = getServerConversationKey(message.guildId!);
        const serverConversation = serverConversations.get(serverKey) || [];
        const recentMessages = serverMessageContext.get(serverKey) || [];

        const contextMessages = recentMessages.slice(-6, -1).map((msg) => ({
          role: 'user' as const,
          content: `**${msg.username}**: ${msg.content}`,
          username: msg.username,
        }));

        const aiHistory = serverConversation.slice(-3);

        const formattedAiHistory = aiHistory.map((msg) => {
          if (msg.role === 'user' && msg.username) {
            const content = Array.isArray(msg.content)
              ? msg.content.map((c) => (c.type === 'text' ? c.text : '[Image]')).join(' ')
              : msg.content;
            return {
              ...msg,
              content: `**${msg.username}**: ${content}`,
            };
          }
          return msg;
        });

        conversation = [...contextMessages, ...formattedAiHistory];
      }

      let filteredConversation = conversation;
      if (selectedModel === 'moonshotai/kimi-k2') {
        filteredConversation = conversation.map((msg) => {
          if (Array.isArray(msg.content)) {
            const textContent = msg.content
              .filter((item) => item.type === 'text')
              .map((item) => item.text)
              .join(' ');
            return { ...msg, content: textContent || '[Image content]' };
          }
          return msg;
        });
      }

      const updatedConversation = buildConversation(
        filteredConversation,
        messageWithContext,
        systemPrompt,
      );

      const exemptUserId = process.env.AI_EXEMPT_USER_ID?.trim();
      const actorId = message.author.id;
      const isExempt = actorId === exemptUserId;

      logger.debug(
        `AI limit check - usingDefaultKey: ${config.usingDefaultKey}, exemptUserId: ${exemptUserId}, actorId: ${actorId}, isExempt: ${isExempt}, isDM: ${isDM}`,
      );

      if (config.usingDefaultKey && !isExempt) {
        if (isDM) {
          logger.debug(`Checking DM daily limit for user ${actorId}`);
          const allowed = await incrementAndCheckDailyLimit(actorId, 50);
          logger.debug(`DM daily limit check result for user ${actorId}: ${allowed}`);
          if (!allowed) {
            await message.reply(
              "❌ You've reached your daily limit of 50 AI requests. " +
                'Vote for Aethel to get more requests: https://top.gg/bot/1371031984230371369/vote\n' +
                'Or set up your own API key using the `/ai` command.',
            );
            return;
          }
        } else {
          let serverLimit = 30;
          try {
            const memberCount = message.guild?.memberCount || 0;
            if (memberCount >= 1000) {
              serverLimit = 500;
            } else if (memberCount >= 100) {
              serverLimit = 150;
            }

            const voteBonus = await pool.query(
              `SELECT COUNT(DISTINCT user_id) as voter_count 
               FROM votes 
               WHERE vote_timestamp > NOW() - INTERVAL '24 hours'
               AND user_id IN (
                 SELECT user_id FROM votes WHERE server_id IS NULL
               )`,
            );

            const voterCount = parseInt(voteBonus.rows[0]?.voter_count || '0');
            if (voterCount > 0) {
              const bonus = Math.min(voterCount * 20, 100);
              serverLimit += bonus;
              logger.debug(
                `Server ${message.guildId} vote bonus: +${bonus} (${voterCount} voters)`,
              );
            }

            const serverAllowed = await incrementAndCheckServerDailyLimit(
              message.guildId!,
              serverLimit,
            );
            if (!serverAllowed) {
              await message.reply(
                `❌ This server has reached its daily limit of ${serverLimit} AI requests. ` +
                  `Vote for Aethel to get more requests: https://top.gg/bot/1371031984230371369/vote`,
              );
              return;
            }
          } catch (error) {
            logger.error('Error checking server member count:', error);
            const serverAllowed = await incrementAndCheckServerDailyLimit(message.guildId!, 30);
            if (!serverAllowed) {
              await message.reply(
                '❌ This server has reached its daily limit of AI requests. ' +
                  'Vote for Aethel to get more requests: https://top.gg/bot/1371031984230371369/vote',
              );
              return;
            }
          }
        }
      } else if (!config.finalApiKey) {
        await message.reply('❌ Please set up your API key first using the `/ai` command.');
        return;
      }

      const conversationWithTools = [...updatedConversation];
      const executedResults: Array<{ type: string; payload: Record<string, unknown> }> = [];
      let aiResponse = await makeAIRequest(config, conversationWithTools);

      if (!aiResponse && hasImages) {
        logger.warn(`First attempt failed for ${selectedModel}, retrying once...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        aiResponse = await makeAIRequest(config, conversationWithTools);
      }

      if (!aiResponse && hasImages) {
        logger.warn(`Image model ${selectedModel} failed, falling back to text-only model`);

        let fallbackContent = messageWithContext;
        if (Array.isArray(messageContent)) {
          const textParts = messageContent
            .filter((item: { type: string; text?: string }) => item.type === 'text')
            .map((item: { type: string; text?: string }) => item.text)
            .filter((text: string | undefined) => text && text.trim());

          const imageParts = messageContent
            .filter(
              (item: { type: string; image_url?: { url: string } }) => item.type === 'image_url',
            )
            .map(
              (item: { type: string; image_url?: { url: string } }) =>
                `[Image: ${item.image_url?.url}]`,
            );

          fallbackContent =
            [...textParts, ...imageParts].join(' ') ||
            `[Message contained images that could not be processed: ${message.content}]`;
        }

        const cleanedConversation = conversation.map((msg) => {
          if (Array.isArray(msg.content)) {
            const textContent = msg.content
              .filter((item) => item.type === 'text')
              .map((item) => item.text)
              .join(' ');
            return { ...msg, content: textContent || '[Image content]' };
          }
          return msg;
        });

        const fallbackModel =
          isDM && !usingDefaultKey
            ? 'moonshotai/kimi-k2'
            : isDM
              ? 'moonshotai/kimi-k2'
              : 'google/gemini-2.5-flash-lite';

        const fallbackConversation = buildConversation(
          cleanedConversation,
          fallbackContent,
          buildSystemPrompt(
            usingDefaultKey,
            this.client,
            fallbackModel,
            message.author.username,
            undefined,
            !isDM,
            !isDM ? message.guild?.name : undefined,
          ),
        );

        const fallbackConfig = isDM ? config : getApiConfiguration(null, fallbackModel, null);
        aiResponse = await makeAIRequest(fallbackConfig, fallbackConversation);

        if (aiResponse) {
          logger.info('Successfully processed message with fallback text-only model');
        }
      }

      const maxIterations = 3;
      let iteration = 0;
      let lastToolResponse = '';
      let originalContentWithTools = aiResponse?.content || '';

      while (aiResponse && iteration < maxIterations) {
        iteration++;
        const extraction = extractMessageToolCalls(aiResponse.content || '');
        const toolCalls: MessageToolCall[] = extraction.toolCalls;

        const executableTools = toolCalls.filter((tc) => tc.name?.toLowerCase() !== 'newmessage');
        const reactionTools = executableTools.filter((tc) => tc.name?.toLowerCase() === 'reaction');
        const nonReactionTools = executableTools.filter(
          (tc) => tc.name?.toLowerCase() !== 'reaction',
        );

        if (executableTools.length > 0 && nonReactionTools.length === 0) {
          logger.debug(
            `AI used only reactions (${reactionTools.length}), breaking loop and preserving tool calls`,
          );
          originalContentWithTools = aiResponse.content || '';
          aiResponse.content = extraction.cleanContent;
          break;
        }

        if (executableTools.length === 0) {
          aiResponse.content = extraction.cleanContent;
          break;
        }

        const currentToolResponse = JSON.stringify(
          executableTools.map((tc) => ({ name: tc.name, args: tc.args })),
        );
        if (currentToolResponse === lastToolResponse) {
          logger.warn('AI stuck in tool loop, breaking out to prevent [NO CONTENT] responses');
          aiResponse.content =
            extraction.cleanContent ||
            'I apologize, but I seem to be having trouble with the tools. Let me respond normally.';
          break;
        }
        lastToolResponse = currentToolResponse;

        conversationWithTools.push({ role: 'assistant', content: aiResponse.content });

        for (const tc of nonReactionTools) {
          const name = tc.name?.toLowerCase();
          try {
            const result = await executeMessageToolCall(tc, message, this.client, {
              originalMessage: message,
              botMessage: undefined,
            });
            const payload = {
              type: name,
              success: result.success,
              handled: result.handled,
              error: result.error || null,
              ...(result.result?.metadata || {}),
            };

            executedResults.push({ type: name, payload });
            conversationWithTools.push({ role: 'user', content: JSON.stringify(payload) });

            logger.debug(`[MessageCreate] MCP tool ${name} executed:`, {
              success: result.success,
              handled: result.handled,
            });
          } catch (e) {
            conversationWithTools.push({ role: 'user', content: `[Tool ${tc.name} error]` });
            logger.error('[MessageCreate] Tool execution threw exception', {
              name: tc.name,
              error: (e as Error)?.message,
            });
          }
        }

        aiResponse = await makeAIRequest(config, conversationWithTools);
        if (!aiResponse) break;

        const hasNewMessageTool = toolCalls.some((tc) => tc.name?.toLowerCase() === 'newmessage');
        const cleanContent = extraction.cleanContent?.trim() || '';

        if (hasNewMessageTool && !cleanContent && iteration >= 2) {
          logger.warn('AI stuck in newmessage misuse loop, forcing normal response');
          aiResponse.content =
            'I apologize for the confusion. Let me respond clearly without using any tools.';
          break;
        }

        if (nonReactionTools.length === 0 && hasNewMessageTool) {
          logger.debug('Only newmessage formatting tools found, breaking iterative loop');
          aiResponse.content = extraction.cleanContent;
          break;
        }
      }

      if (!aiResponse) {
        await message.reply({
          content: 'Sorry, I encountered an error processing your message. Please try again later.',
          allowedMentions: { parse: ['users'] as const },
        });
        return;
      }

      if (!aiResponse.content || !aiResponse.content.trim()) {
        const last = executedResults[executedResults.length - 1];
        if (last) {
          if (
            (last.type === 'cat' || last.type === 'dog') &&
            typeof last.payload.url === 'string'
          ) {
            aiResponse.content = `Here you go ${last.type === 'cat' ? '🐱' : '🐶'}: ${last.payload.url}`;
          } else if (last.type === 'weather') {
            const p = last.payload as Record<string, string>;
            if (p.location && p.temperature) {
              aiResponse.content = `Weather for ${p.location}: ${p.temperature} (feels ${p.feels_like}), ${p.conditions}. Humidity ${p.humidity}, Wind ${p.wind_speed}, Pressure ${p.pressure}.`;
            } else if (p.description) {
              aiResponse.content = `Weather in ${p.location || 'the requested area'}: ${p.description}`;
            }
          } else if (last.type === 'wiki') {
            const p = last.payload as Record<string, string>;
            if (p.title || p.extract || p.url) {
              aiResponse.content =
                `${p.title || ''}\n${p.extract || ''}\n${p.url ? `<${p.url}>` : ''}`.trim();
            }
          }
        }

        if (!aiResponse.content || !aiResponse.content.trim()) {
          logger.debug('AI response has no meaningful content, not sending message');
          return;
        }
      }

      aiResponse.content = processUrls(aiResponse.content);
      aiResponse.content = aiResponse.content.replace(/@(everyone|here)/gi, '@\u200b$1');

      const originalContent = originalContentWithTools || aiResponse.content || '';
      const extraction = extractMessageToolCalls(originalContent);
      aiResponse.content = extraction.cleanContent;
      const toolCalls: MessageToolCall[] = extraction.toolCalls;
      const hasReactionTool = toolCalls.some((tc) => tc?.name?.toLowerCase() === 'reaction');
      const originalCleaned = (extraction.cleanContent || '').trim();

      logger.debug(`Final tool extraction: ${toolCalls.length} tools found`, {
        tools: toolCalls.map((tc) => tc.name),
        hasReaction: hasReactionTool,
        cleanContent: extraction.cleanContent?.substring(0, 50),
      });

      if (!originalCleaned && hasReactionTool) {
        for (const tc of toolCalls) {
          if (!tc || !tc.name) continue;
          const name = tc.name.toLowerCase();
          if (name !== 'reaction') continue;
          try {
            await executeMessageToolCall(tc, message, this.client, {
              originalMessage: message,
              botMessage: undefined,
            });
          } catch (err) {
            logger.error('Error executing reaction tool on original message:', err);
          }
        }
        return;
      }

      const { getUnallowedWordCategory } = await import('@/utils/validation');
      const category = getUnallowedWordCategory(aiResponse.content);
      if (category) {
        logger.warn(`AI response contained unallowed words in category: ${category}`);
        await message.reply({
          content:
            'Sorry, I cannot provide that response as it contains prohibited content. Please try a different prompt.',
          allowedMentions: { parse: ['users'] as const },
        });
        return;
      }

      const cleaned = (aiResponse.content || '').trim();
      const onlyReactions = !cleaned && hasReactionTool;
      if (onlyReactions) {
        const toolCallRegex = /{([^{}\s:]+):({[^{}]*}|[^{}]*)?}/g;
        const fallback = originalContent.replace(toolCallRegex, '').trim();
        if (fallback) {
          aiResponse.content = fallback;
        } else {
          const textParts: string[] = [];
          for (const tc of toolCalls) {
            if (!tc || !tc.args) continue;
            const a = tc.args as Record<string, unknown>;
            const candidates = ['text', 'query', 'content', 'body', 'message'];
            for (const k of candidates) {
              const v = a[k] as unknown;
              if (typeof v === 'string' && v.trim()) {
                textParts.push(v.trim());
                break;
              }
            }
          }
          if (textParts.length) {
            aiResponse.content = textParts.join(' ');
          } else {
            const reactionLabels: string[] = [];
            for (const tc of toolCalls) {
              if (!tc || !tc.name) continue;
              if (tc.name.toLowerCase() !== 'reaction') continue;
              const a = tc.args as Record<string, unknown>;
              const emojiCandidate =
                (a.emoji as string) || (a.query as string) || (a['emojiRaw'] as string) || '';
              if (typeof emojiCandidate === 'string' && emojiCandidate.trim()) {
                reactionLabels.push(emojiCandidate.trim());
              }
            }
            if (reactionLabels.length) {
              aiResponse.content = `Reacted with ${reactionLabels.join(', ')}`;
            } else {
              aiResponse.content = 'Reacted.';
            }
          }
        }
      }

      const sent = await this.sendResponse(message, aiResponse, executedResults);
      const sentMessage: Message | undefined = sent as Message | undefined;

      if (extraction.toolCalls.length > 0) {
        const executed: Array<{ name: string; success: boolean }> = [];
        logger.debug(
          `[MessageCreate] Final execution - processing ${extraction.toolCalls.length} tool calls:`,
          extraction.toolCalls.map((tc) => ({ name: tc.name, args: tc.args })),
        );
        for (const tc of extraction.toolCalls) {
          if (!tc || !tc.name) continue;
          const name = tc.name.toLowerCase();
          if (name === 'reaction') {
            try {
              const result = await executeMessageToolCall(tc, message, this.client, {
                originalMessage: message,
                botMessage: sentMessage,
              });
              executed.push({ name, success: !!result?.success });
            } catch (err) {
              logger.error('Error executing message tool:', { name, err });
              executed.push({ name, success: false });
            }
          } else {
            const target = sentMessage || message;
            try {
              const result = await executeMessageToolCall(tc, target, this.client, {
                originalMessage: message,
                botMessage: sentMessage,
              });

              if (name === 'cat' || name === 'dog') {
                const imageUrl = result.result?.metadata?.url as string;
                if (imageUrl && imageUrl.startsWith('http')) {
                  await target.reply({ content: '', files: [imageUrl] });
                }
              } else if (name === 'weather' || name === 'wiki') {
                const textContent = result.result?.content?.find((c) => c.type === 'text')?.text;
                if (textContent) {
                  await target.reply(textContent);
                }
              }

              executed.push({ name, success: result.success });
            } catch (err) {
              logger.error(`Error executing MCP tool ${name}:`, { err });
              executed.push({ name, success: false });
            }
          }
        }

        if (onlyReactions) {
          const anyFailed = executed.some((e) => e.name === 'reaction' && !e.success);
          if (anyFailed && sentMessage) {
            try {
              await sentMessage.edit(
                'I tried to react, but I do not have permission to add reactions here or the emoji was invalid.',
              );
            } catch (e) {
              logger.error('Failed to edit placeholder message after reaction failure:', e);
            }
          }
        }
      }

      const userMessage: ConversationMessage = {
        role: 'user',
        content: messageWithContext,
        username: message.author.username,
      };
      const assistantMessage: ConversationMessage = {
        role: 'assistant',
        content: aiResponse.content,
      };

      if (isDM) {
        const conversationKey = getUserConversationKey(message.author.id);
        const newConversation = [...filteredConversation, userMessage, assistantMessage];
        userConversations.set(conversationKey, newConversation);
      } else {
        const serverKey = getServerConversationKey(message.guildId!);
        const serverConversation = serverConversations.get(serverKey) || [];
        const newServerConversation = [...serverConversation, userMessage, assistantMessage];
        serverConversations.set(serverKey, newServerConversation);
      }

      logger.info(`${isDM ? 'DM' : 'Server'} response sent successfully`);
    } catch (error) {
      const err = error as Error;
      logger.error(`Error processing ${isDM ? 'DM' : 'server message'}:`, {
        message: err?.message,
        stack: err?.stack,
        raw: error,
      });
      try {
        await message.reply(
          'Sorry, I encountered an error processing your message. Please try again later.',
        );
      } catch (replyError) {
        logger.error('Failed to send error message:', replyError);
      }
    }
  }

  private async sendResponse(
    message: Message,
    aiResponse: AIResponse,
    executedResults?: Array<{ type: string; payload: Record<string, unknown> }>,
  ): Promise<Message | void> {
    let fullResponse = '';

    if (aiResponse.reasoning) {
      fullResponse += `> ${aiResponse.reasoning}\n\n`;
    }

    fullResponse += aiResponse.content;

    const imageFiles: string[] = [];
    if (executedResults) {
      for (const result of executedResults) {
        if (
          (result.type === 'cat' || result.type === 'dog') &&
          result.payload.url &&
          typeof result.payload.url === 'string'
        ) {
          imageFiles.push(result.payload.url);
        }
      }
    }

    if (!fullResponse || !fullResponse.trim()) {
      logger.debug('AI response has no meaningful content, not sending message');
      return;
    }

    const newMessageOnlyRegex = /^\s*\{newmessage:\}\s*$/;
    if (newMessageOnlyRegex.test(fullResponse)) {
      logger.warn('AI misused newmessage tool - sent only {newmessage:} with no content');
      return;
    }

    const newMessageRegex = /\{newmessage:\}/g;
    if (newMessageRegex.test(fullResponse)) {
      const parts = fullResponse.split(/\{newmessage:\}/);

      if (parts[0].trim() === '') {
        logger.warn('AI misused newmessage tool - started response with {newmessage:}');
        parts.shift();
        if (parts.length === 0) {
          return await message.reply({
            content: fullResponse.replace(/\{newmessage:\}/g, '').trim() || '\u200b',
            allowedMentions: { parse: ['users'] as const },
          });
        }
      }

      const first = await message.reply({
        content: parts[0].trim() || '\u200b',
        files: imageFiles.length > 0 ? imageFiles : undefined,
        allowedMentions: { parse: ['users'] as const },
      });

      for (let i = 1; i < parts.length; i++) {
        if ('send' in message.channel && parts[i].trim()) {
          const delay = Math.floor(Math.random() * 900) + 300;
          await new Promise((resolve) => setTimeout(resolve, delay));

          await message.channel.send({
            content: parts[i].trim(),
            allowedMentions: { parse: ['users'] as const },
          });
        }
      }
      return first;
    }
    const conversationChunks = this.splitIntoConversationalChunks(fullResponse);

    const first = await message.reply({
      content: conversationChunks[0],
      files: imageFiles.length > 0 ? imageFiles : undefined,
      allowedMentions: { parse: ['users'] as const },
    });

    for (let i = 1; i < conversationChunks.length; i++) {
      if ('send' in message.channel) {
        const delay = Math.floor(Math.random() * 900) + 300;
        await new Promise((resolve) => setTimeout(resolve, delay));

        await message.channel.send({
          content: conversationChunks[i],
          allowedMentions: { parse: ['users'] as const },
        });
      }
    }
    return first;
  }

  private splitIntoConversationalChunks(text: string): string[] {
    if (!text || text.length <= 200) {
      return [text];
    }

    const chunks: string[] = [];
    const paragraphs = text.split(/\n\n+/);

    for (const paragraph of paragraphs) {
      if (paragraph.length < 200) {
        chunks.push(paragraph);
      } else {
        const sentences = paragraph.split(/(?<=[.!?])\s+/);

        let currentChunk = '';
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length > 200 && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = sentence;
          } else {
            if (currentChunk && !currentChunk.endsWith('\n')) {
              currentChunk += ' ';
            }
            currentChunk += sentence;
          }

          const hasEndPunctuation = /[.!?]$/.test(sentence);
          const breakChance = hasEndPunctuation ? 0.7 : 0.3;

          if (currentChunk.length > 100 && Math.random() < breakChance) {
            chunks.push(currentChunk);
            currentChunk = '';
          }
        }

        if (currentChunk) {
          chunks.push(currentChunk);
        }
      }
    }

    const fillerMessages = ['hmm', 'let me think', 'one sec', 'actually', 'wait', 'so basically'];

    if (chunks.length > 1 && Math.random() < 0.3) {
      const position = Math.floor(Math.random() * (chunks.length - 1)) + 1;
      const filler = fillerMessages[Math.floor(Math.random() * fillerMessages.length)];
      chunks.splice(position, 0, filler);
    }

    const maxLength = 2000;
    const finalChunks: string[] = [];

    for (const chunk of chunks) {
      if (chunk.length <= maxLength) {
        finalChunks.push(chunk);
      } else {
        finalChunks.push(...splitResponseIntoChunks(chunk, maxLength));
      }
    }

    return finalChunks;
  }
}
