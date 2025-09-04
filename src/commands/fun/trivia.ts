import {
  SlashCommandBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
  ButtonInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { createCommandLogger } from '@/utils/commandLogger';
import { createErrorHandler } from '@/utils/errorHandler';
import { createMemoryManager } from '@/utils/memoryManager';
import dynamicFetch from '@/utils/dynamicFetch';

interface TriviaQuestion {
  category: string;
  type: string;
  difficulty: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

interface TriviaAPIResponse {
  response_code: number;
  results: TriviaQuestion[];
}

interface GameSession {
  channelId: string;
  gameCreator: string;
  players: Set<string>;
  questions: TriviaQuestion[];
  currentQuestionIndex: number;
  currentPlayer: string;
  scores: Map<string, number>;
  isActive: boolean;
  queueOpen: boolean;
  originalQuestionCount: number;
  currentShuffledAnswers: string[];
  messageId?: string;
}

const gameManager = createMemoryManager<string, GameSession>({
  maxSize: 100,
  maxAge: 30 * 60 * 1000,
  cleanupInterval: 5 * 60 * 1000,
});

const commandLogger = createCommandLogger('trivia');
const errorHandler = createErrorHandler('trivia');

function saveSession(session: GameSession) {
  gameManager.set(session.channelId, session);
  if (session.messageId) gameManager.set(session.messageId, session);
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function decodeHtmlEntities(text: string): string {
  text = text.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(parseInt(dec, 10));
  });

  text = text.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });

  const entities: { [key: string]: string } = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
    '&euro;': '€',
    '&pound;': '£',
    '&yen;': '¥',
    '&cent;': '¢',
    '&sect;': '§',
    '&para;': '¶',
    '&middot;': '·',
    '&laquo;': '«',
    '&raquo;': '»',
    '&iquest;': '¿',
    '&iexcl;': '¡',
    '&deg;': '°',
    '&plusmn;': '±',
    '&sup2;': '²',
    '&sup3;': '³',
    '&frac14;': '¼',
    '&frac12;': '½',
    '&frac34;': '¾',
    '&times;': '×',
    '&divide;': '÷',
    '&prime;': '′',
    '&Prime;': '″',
    '&agrave;': 'à',
    '&aacute;': 'á',
    '&acirc;': 'â',
    '&atilde;': 'ã',
    '&auml;': 'ä',
    '&aring;': 'å',
    '&aelig;': 'æ',
    '&ccedil;': 'ç',
    '&egrave;': 'è',
    '&eacute;': 'é',
    '&ecirc;': 'ê',
    '&euml;': 'ë',
    '&igrave;': 'ì',
    '&iacute;': 'í',
    '&icirc;': 'î',
    '&iuml;': 'ï',
    '&eth;': 'ð',
    '&ntilde;': 'ñ',
    '&ograve;': 'ò',
    '&oacute;': 'ó',
    '&ocirc;': 'ô',
    '&otilde;': 'õ',
    '&ouml;': 'ö',
    '&oslash;': 'ø',
    '&ugrave;': 'ù',
    '&uacute;': 'ú',
    '&ucirc;': 'û',
    '&uuml;': 'ü',
    '&yacute;': 'ý',
    '&thorn;': 'þ',
    '&yuml;': 'ÿ',
    '&Agrave;': 'À',
    '&Aacute;': 'Á',
    '&Acirc;': 'Â',
    '&Atilde;': 'Ã',
    '&Auml;': 'Ä',
    '&Aring;': 'Å',
    '&AElig;': 'Æ',
    '&Ccedil;': 'Ç',
    '&Egrave;': 'È',
    '&Eacute;': 'É',
    '&Ecirc;': 'Ê',
    '&Euml;': 'Ë',
    '&Igrave;': 'Ì',
    '&Iacute;': 'Í',
    '&Icirc;': 'Î',
    '&Iuml;': 'Ï',
    '&ETH;': 'Ð',
    '&Ntilde;': 'Ñ',
    '&Ograve;': 'Ò',
    '&Oacute;': 'Ó',
    '&Ocirc;': 'Ô',
    '&Otilde;': 'Õ',
    '&Ouml;': 'Ö',
    '&Oslash;': 'Ø',
    '&Ugrave;': 'Ù',
    '&Uacute;': 'Ú',
    '&Ucirc;': 'Û',
    '&Uuml;': 'Ü',
    '&Yacute;': 'Ý',
    '&THORN;': 'Þ',
    '&szlig;': 'ß',
  };

  return text.replace(/&[a-zA-Z][a-zA-Z0-9]*;/g, (entity) => entities[entity] || entity);
}

async function fetchTriviaQuestions(
  client: import('@/services/Client').default,
  locale: string,
  playerCount: number,
): Promise<TriviaQuestion[]> {
  try {
    const totalQuestions = Math.min(Math.max(playerCount * 2 + 1, 5), 50);

    const response = await dynamicFetch(
      `https://opentdb.com/api.php?amount=${totalQuestions}&type=multiple`,
    );
    const data: TriviaAPIResponse = await response.json();

    if (data.response_code !== 0) {
      const errorMsg = await client.getLocaleText('commands.trivia.errors.api_error', locale);
      throw new Error(errorMsg.replace('{code}', data.response_code.toString()));
    }

    return data.results.map((q) => ({
      ...q,
      question: decodeHtmlEntities(q.question),
      correct_answer: decodeHtmlEntities(q.correct_answer),
      incorrect_answers: q.incorrect_answers.map((a) => decodeHtmlEntities(a)),
    }));
  } catch (error) {
    const errorMsg = await client.getLocaleText('commands.trivia.errors.fetch_failed', locale);
    throw new Error(errorMsg.replace('{error}', String(error)));
  }
}

async function createJoinQueueButtons(client: import('@/services/Client').default, locale: string) {
  const [joinText, startText, cancelText] = await Promise.all([
    client.getLocaleText('commands.trivia.buttons.join', locale),
    client.getLocaleText('commands.trivia.buttons.start', locale),
    client.getLocaleText('commands.trivia.buttons.cancel', locale),
  ]);

  const joinButton = new ButtonBuilder()
    .setCustomId('trivia_join')
    .setLabel(joinText)
    .setStyle(ButtonStyle.Primary);

  const startButton = new ButtonBuilder()
    .setCustomId('trivia_start')
    .setLabel(startText)
    .setStyle(ButtonStyle.Success);

  const cancelButton = new ButtonBuilder()
    .setCustomId('trivia_cancel')
    .setLabel(cancelText)
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(joinButton, startButton, cancelButton);
}

function createAnswerButtons(answers: string[], questionId: string) {
  const buttons = answers.map((answer, index) => {
    const prefix = `${String.fromCharCode(65 + index)}. `;
    const maxAnswerLength = 80 - prefix.length;
    const truncatedAnswer =
      answer.length > maxAnswerLength ? answer.substring(0, maxAnswerLength - 3) + '...' : answer;

    return new ButtonBuilder()
      .setCustomId(`trivia_answer_${questionId}_${index}`)
      .setLabel(`${prefix}${truncatedAnswer}`)
      .setStyle(ButtonStyle.Secondary);
  });

  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    row.addComponents(buttons.slice(i, i + 2));
    rows.push(row);
  }

  return rows;
}

function getNextPlayer(session: GameSession): string {
  const players = Array.from(session.players);
  const currentIndex = players.indexOf(session.currentPlayer);
  return players[(currentIndex + 1) % players.length];
}

async function startTriviaGame(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  session: GameSession,
  client: import('@/services/Client').default,
) {
  try {
    session.questions = await fetchTriviaQuestions(
      client,
      interaction.locale,
      session.players.size,
    );
    session.originalQuestionCount = session.questions.length;
    session.isActive = true;
    session.queueOpen = false;
    session.currentQuestionIndex = 0;
    session.currentPlayer = Array.from(session.players)[0];
    saveSession(session);

    await askQuestion(interaction, session, client);
  } catch {
    const errorMsg = await client.getLocaleText(
      'commands.trivia.messages.failed_start',
      interaction.locale,
    );
    await interaction.editReply({
      content: errorMsg,
      components: [],
    });
  }
}

async function askQuestion(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  session: GameSession,
  client: import('@/services/Client').default,
) {
  if (session.currentQuestionIndex >= session.questions.length) {
    const sortedScores = Array.from(session.scores.entries()).sort(([, a], [, b]) => b - a);
    const highestScore = sortedScores[0]?.[1] || 0;
    const tiedPlayers = sortedScores.filter(([, score]) => score === highestScore);

    if (tiedPlayers.length > 1) {
      try {
        const additionalQuestions = await fetchTriviaQuestions(client, interaction.locale, 2);
        session.questions.push(...additionalQuestions);

        const tiedGameText = await client.getLocaleText(
          'commands.trivia.messages.tied_game',
          interaction.locale,
        );
        await interaction.editReply({
          content: tiedGameText || '🤝 Tied game! Keep going until someone scores!',
          components: [],
        });

        setTimeout(async () => {
          await askQuestion(interaction, session, client);
        }, 2000);
        return;
      } catch {
        await endGame(interaction, session, client);
        return;
      }
    }

    await endGame(interaction, session, client);
    return;
  }

  const question = session.questions[session.currentQuestionIndex];
  const answers = shuffleArray([question.correct_answer, ...question.incorrect_answers]);
  session.currentShuffledAnswers = answers;
  saveSession(session);
  const questionId = `${session.channelId}_${session.currentQuestionIndex}`;

  const playerMention = `<@${session.currentPlayer}>`;
  const questionNumber = session.currentQuestionIndex + 1;
  const totalQuestions = session.questions.length;

  const [headerText, yourTurnText, categoryText, difficultyText, questionText] = await Promise.all([
    client.getLocaleText('commands.trivia.question.header', interaction.locale),
    client.getLocaleText('commands.trivia.question.your_turn', interaction.locale),
    client.getLocaleText('commands.trivia.question.category', interaction.locale),
    client.getLocaleText('commands.trivia.question.difficulty', interaction.locale),
    client.getLocaleText('commands.trivia.question.question_text', interaction.locale),
  ]);

  const content =
    headerText
      .replace('{current}', questionNumber.toString())
      .replace('{total}', totalQuestions.toString()) +
    '\n\n' +
    yourTurnText.replace('{player}', playerMention) +
    '\n\n' +
    categoryText.replace('{category}', question.category) +
    '\n' +
    difficultyText.replace(
      '{difficulty}',
      question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1),
    ) +
    '\n\n' +
    questionText.replace('{question}', question.question);

  const components = createAnswerButtons(answers, questionId);

  await interaction.editReply({
    content,
    components,
  });
}

async function endGame(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  session: GameSession,
  client: import('@/services/Client').default,
) {
  const sortedScores = Array.from(session.scores.entries()).sort(([, a], [, b]) => b - a);

  const [headerText, finalScoresText, congratulationsText] = await Promise.all([
    client.getLocaleText('commands.trivia.game_end.header', interaction.locale),
    client.getLocaleText('commands.trivia.game_end.final_scores', interaction.locale),
    client.getLocaleText('commands.trivia.game_end.congratulations', interaction.locale),
  ]);

  let content = headerText + '\n\n' + finalScoresText + '\n';

  sortedScores.forEach(([userId, score], index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
    content += `${medal} <@${userId}>: ${score} points\n`;
  });

  if (sortedScores.length > 0) {
    content += '\n' + congratulationsText.replace('{winner}', `<@${sortedScores[0][0]}>`);
  }

  await interaction.editReply({
    content,
    components: [],
  });

  gameManager.delete(session.channelId);
  if (session.messageId) gameManager.delete(session.messageId);
}

const triviaCommand = {
  data: new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('Start a multiplayer trivia game')
    .setDescriptionLocalizations({
      'es-ES': 'Inicia un juego de trivia multijugador',
      'es-419': 'Inicia un juego de trivia multijugador',
      'en-US': 'Start a multiplayer trivia game',
    })
    .setContexts([
      InteractionContextType.BotDM,
      InteractionContextType.Guild,
      InteractionContextType.PrivateChannel,
    ])
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall),

  execute: async (
    client: import('@/services/Client').default,
    interaction: ChatInputCommandInteraction,
  ) => {
    try {
      const channelId = interaction.channelId;

      if (gameManager.has(channelId)) {
        const errorMsg = await client.getLocaleText(
          'commands.trivia.messages.game_exists',
          interaction.locale,
        );
        return interaction.reply({
          content: errorMsg,
          flags: MessageFlags.Ephemeral,
        });
      }

      const session: GameSession = {
        channelId,
        gameCreator: interaction.user.id,
        players: new Set([interaction.user.id]),
        questions: [],
        currentQuestionIndex: 0,
        currentPlayer: '',
        scores: new Map([[interaction.user.id, 0]]),
        isActive: false,
        queueOpen: true,
        originalQuestionCount: 0,
        currentShuffledAnswers: [],
      };

      gameManager.set(channelId, session);

      commandLogger.logFromInteraction(interaction, 'Started trivia game');

      const [components, gameStartingMsg] = await Promise.all([
        createJoinQueueButtons(client, interaction.locale),
        client.getLocaleText('commands.trivia.messages.game_starting', interaction.locale),
      ]);
      const playersList = `• <@${interaction.user.id}>`;

      await interaction.reply({
        content: gameStartingMsg
          .replace('{count}', session.players.size.toString())
          .replace('{players}', playersList),
        components: [components],
      });
    } catch (error) {
      await errorHandler({
        interaction,
        client,
        error: error as Error,
        userId: interaction.user.id,
        username: interaction.user.tag,
      });
    }
  },

  handleButton: async (
    client: import('@/services/Client').default,
    interaction: ButtonInteraction,
  ) => {
    try {
      const channelId = interaction.channelId;
      const clickMessageId = interaction.message?.id;
      let session =
        (clickMessageId && gameManager.get(clickMessageId)) || gameManager.get(channelId);
      const customId = interaction.customId;

      if (!session && clickMessageId) {
        for (const [, s] of gameManager.entries()) {
          if (s.messageId === clickMessageId) {
            session = s;
            break;
          }
        }
      }

      if (customId.startsWith('trivia_answer_')) {
        const parts = customId.split('_');
        if (parts.length >= 5) {
          const embeddedChannelId = parts[2];
          if (embeddedChannelId && (!session || session.channelId !== embeddedChannelId)) {
            const byEmbedded = gameManager.get(embeddedChannelId);
            if (byEmbedded) {
              session = byEmbedded;
            }
          }
        }
      }

      if (!session) {
        const errorMsg = await client.getLocaleText(
          'commands.trivia.messages.no_active_game',
          interaction.locale,
        );
        return interaction.reply({
          content: errorMsg,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!session) {
        const parts = customId.split('_');
        const embeddedChannelId = parts.length >= 5 ? parts[2] : 'n/a';
        const errorMsg = await client.getLocaleText(
          'commands.trivia.messages.no_active_game',
          interaction.locale,
        );
        const diag = `\n[diag] ch:${channelId} emb:${embeddedChannelId} msg:${clickMessageId ?? 'n/a'}`;
        return interaction.reply({ content: errorMsg + diag, flags: MessageFlags.Ephemeral });
      }

      if (customId === 'trivia_join') {
        if (!session.queueOpen) {
          const errorMsg = await client.getLocaleText(
            'commands.trivia.messages.game_started',
            interaction.locale,
          );
          return interaction.reply({
            content: '❌ ' + errorMsg,
            flags: MessageFlags.Ephemeral,
          });
        }

        if (session.players.has(interaction.user.id)) {
          const errorMsg = await client.getLocaleText(
            'commands.trivia.messages.already_joined',
            interaction.locale,
          );
          return interaction.reply({
            content: '❌ ' + errorMsg,
            flags: MessageFlags.Ephemeral,
          });
        }

        session.players.add(interaction.user.id);
        session.scores.set(interaction.user.id, 0);
        saveSession(session);

        const playersList = Array.from(session.players)
          .map((id) => `• <@${id}>`)
          .join('\n');

        const [gameStartingMsg, components] = await Promise.all([
          client.getLocaleText('commands.trivia.messages.game_starting', interaction.locale),
          createJoinQueueButtons(client, interaction.locale),
        ]);

        await interaction.update({
          content: gameStartingMsg
            .replace('{count}', session.players.size.toString())
            .replace('{players}', playersList),
          components: [components],
        });
      } else if (customId === 'trivia_start') {
        if (interaction.user.id !== session.gameCreator) {
          const errorMsg = await client.getLocaleText(
            'commands.trivia.messages.only_creator_start',
            interaction.locale,
          );
          return interaction.reply({
            content: '❌ ' + errorMsg,
            flags: MessageFlags.Ephemeral,
          });
        }

        if (session.players.size < 1) {
          const errorMsg = await client.getLocaleText(
            'commands.trivia.messages.need_players',
            interaction.locale,
          );
          return interaction.reply({
            content: '❌ ' + errorMsg,
            flags: MessageFlags.Ephemeral,
          });
        }

        const startingMsg = await client.getLocaleText(
          'commands.trivia.messages.starting_game',
          interaction.locale,
        );
        await interaction.update({
          content: startingMsg,
          components: [],
        });

        await startTriviaGame(interaction, session, client);
      } else if (customId === 'trivia_cancel') {
        if (interaction.user.id !== session.gameCreator) {
          const errorMsg = await client.getLocaleText(
            'commands.trivia.messages.only_creator_cancel',
            interaction.locale,
          );
          return interaction.reply({
            content: '❌ ' + errorMsg,
            flags: MessageFlags.Ephemeral,
          });
        }

        gameManager.delete(channelId);
        if (session.messageId) gameManager.delete(session.messageId);

        const cancelMsg = await client.getLocaleText(
          'commands.trivia.messages.game_cancelled',
          interaction.locale,
        );
        await interaction.update({
          content: cancelMsg,
          components: [],
        });
      } else if (customId.startsWith('trivia_answer_')) {
        const parts = customId.split('_');
        if (!session.isActive) {
          const errorMsg = await client.getLocaleText(
            'commands.trivia.messages.no_active_question',
            interaction.locale,
          );
          return interaction.reply({
            content: errorMsg,
            flags: MessageFlags.Ephemeral,
          });
        }

        if (interaction.user.id !== session.currentPlayer) {
          const errorMsg = await client.getLocaleText(
            'commands.trivia.messages.not_your_turn',
            interaction.locale,
          );
          return interaction.reply({
            content: '❌ ' + errorMsg,
            flags: MessageFlags.Ephemeral,
          });
        }

        const answerIndex = parseInt(parts[parts.length - 1]);

        const question = session.questions[session.currentQuestionIndex];
        const selectedAnswer = session.currentShuffledAnswers[answerIndex];
        const isCorrect = selectedAnswer === question.correct_answer;

        if (isCorrect) {
          const currentScore = session.scores.get(session.currentPlayer) || 0;
          session.scores.set(session.currentPlayer, currentScore + 1);
        }
        saveSession(session);

        const [correctText, incorrectText, resultFormatText, preparingText] = await Promise.all([
          client.getLocaleText('commands.trivia.answer.correct', interaction.locale),
          client.getLocaleText('commands.trivia.answer.incorrect', interaction.locale),
          client.getLocaleText('commands.trivia.answer.result_format', interaction.locale),
          client.getLocaleText('commands.trivia.messages.preparing_next', interaction.locale),
        ]);

        const resultText = isCorrect ? correctText : incorrectText;

        await interaction.update({
          content: resultFormatText
            .replace('{result}', resultText)
            .replace('{question}', question.question)
            .replace('{answer}', selectedAnswer)
            .replace('{correct}', question.correct_answer)
            .replace('{preparing}', preparingText),
          components: [],
        });

        setTimeout(async () => {
          session.currentQuestionIndex++;
          session.currentPlayer = getNextPlayer(session);
          saveSession(session);

          await askQuestion(interaction, session, client);
        }, 3000);
      }
    } catch (error) {
      await errorHandler({
        interaction,
        client,
        error: error as Error,
        userId: interaction.user.id,
        username: interaction.user.tag,
      });
    }
  },
};

export default triviaCommand;
