import {
  SlashCommandBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  ContainerBuilder,
  SectionBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} from 'discord.js';
import axios from 'axios';
import { SlashCommandProps } from '../../types/command';
import BotClient from '../../services/Client';
import { createCommandLogger } from '../../utils/commandLogger';
import { createErrorHandler } from '../../utils/errorHandler';

interface CobaltResponse {
  status: string;
  url?: string;
  filename?: string;
  text?: string;
  service?: string;
  error?: {
    code: string;
    message: string;
  };
}

const commandLogger = createCommandLogger('cobalt');
const errorHandler = createErrorHandler('cobalt');

export default {
  data: new SlashCommandBuilder()
    .setName('cobalt')
    .setNameLocalizations({
      'es-ES': 'cobalt',
      'es-419': 'cobalt',
      'en-US': 'cobalt',
    })
    .setDescription('Download a video or audio from a given URL')
    .setDescriptionLocalizations({
      'es-ES': 'Descarga un video o audio desde una URL',
      'es-419': 'Descarga un video o audio desde una URL',
      'en-US': 'Download a video or audio from a given URL',
    })
    .addStringOption((option) =>
      option
        .setName('url')
        .setNameLocalizations({
          'es-ES': 'url',
          'es-419': 'url',
          'en-US': 'url',
        })
        .setDescription('The URL of the video to download')
        .setDescriptionLocalizations({
          'es-ES': 'La URL del video a descargar',
          'es-419': 'La URL del video a descargar',
          'en-US': 'The URL of the video to download',
        })
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('video-quality')
        .setNameLocalizations({
          'es-ES': 'calidad-video',
          'es-419': 'calidad-video',
          'en-US': 'video-quality',
        })
        .setDescription('The video quality to download')
        .setDescriptionLocalizations({
          'es-ES': 'La calidad de video a descargar',
          'es-419': 'La calidad de video a descargar',
          'en-US': 'The video quality to download',
        })
        .addChoices(
          { name: '144p', value: '144' },
          { name: '240p', value: '240' },
          { name: '360p', value: '360' },
          { name: '480p', value: '480' },
          { name: '720p', value: '720' },
          { name: '1440p', value: '1440' },
          { name: '2160p (4K)', value: '2160' },
          { name: '4320p (8K)', value: '4320' },
          { name: 'Max', value: 'max' }
        )
    )
    .addBooleanOption((option) =>
      option
        .setName('audio-only')
        .setNameLocalizations({
          'es-ES': 'solo-audio',
          'es-419': 'solo-audio',
          'en-US': 'audio-only',
        })
        .setDescription('Download audio only')
        .setDescriptionLocalizations({
          'es-ES': 'Descargar solo audio',
          'es-419': 'Descargar solo audio',
          'en-US': 'Download audio only',
        })
    )
    .addBooleanOption((option) =>
      option
        .setName('mute-audio')
        .setNameLocalizations({
          'es-ES': 'silenciar-audio',
          'es-419': 'silenciar-audio',
          'en-US': 'mute-audio',
        })
        .setDescription('Mute audio')
        .setDescriptionLocalizations({
          'es-ES': 'Silenciar audio',
          'es-419': 'Silenciar audio',
          'en-US': 'Mute audio',
        })
    )
    .addBooleanOption((option) =>
      option
        .setName('twitter-gif')
        .setNameLocalizations({
          'es-ES': 'gif-twitter',
          'es-419': 'gif-twitter',
          'en-US': 'twitter-gif',
        })
        .setDescription('Download as Twitter GIF')
        .setDescriptionLocalizations({
          'es-ES': 'Descargar como GIF de Twitter',
          'es-419': 'Descargar como GIF de Twitter',
          'en-US': 'Download as Twitter GIF',
        })
    )
    .addBooleanOption((option) =>
      option
        .setName('tiktok-original-audio')
        .setNameLocalizations({
          'es-ES': 'audio-original-tiktok',
          'es-419': 'audio-original-tiktok',
          'en-US': 'tiktok-original-audio',
        })
        .setDescription('Include TikTok original audio')
        .setDescriptionLocalizations({
          'es-ES': 'Incluir audio original de TikTok',
          'es-419': 'Incluir audio original de TikTok',
          'en-US': 'Include TikTok original audio',
        })
    )
    .addStringOption((option) =>
      option
        .setName('audio-format')
        .setNameLocalizations({
          'es-ES': 'formato-audio',
          'es-419': 'formato-audio',
          'en-US': 'audio-format',
        })
        .setDescription('Format for audio (requires audio-only to be true)')
        .setDescriptionLocalizations({
          'es-ES': 'Formato para audio (requiere solo-audio activado)',
          'es-419': 'Formato para audio (requiere solo-audio activado)',
          'en-US': 'Format for audio (requires audio-only to be true)',
        })
        .addChoices(
          { name: 'MP3', value: 'mp3' },
          { name: 'OGG', value: 'ogg' },
          { name: 'WAV', value: 'wav' },
          { name: 'Best', value: 'best' }
        )
    )
    .setContexts([
      InteractionContextType.BotDM,
      InteractionContextType.Guild,
      InteractionContextType.PrivateChannel,
    ])
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall),
  category: 'utilities',
  async execute(client: BotClient, interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      commandLogger.logFromInteraction(interaction);

      const url = interaction.options.getString('url', true);
      const videoQuality = interaction.options.getString('video-quality');
      const audioOnly = interaction.options.getBoolean('audio-only');
      const muteAudio = interaction.options.getBoolean('mute-audio');
      const twitterGif = interaction.options.getBoolean('twitter-gif');
      const tiktokOriginalAudio = interaction.options.getBoolean('tiktok-original-audio');
      const audioFormat = interaction.options.getString('audio-format');

      await interaction.deferReply();

      const startTime = Date.now();

      const requestBody = {
        url: url,
        videoQuality: videoQuality || 'max',
        audioFormat: audioFormat || 'mp3',
        downloadMode: audioOnly ? 'audio' : muteAudio ? 'mute' : 'auto',
        filenameStyle: 'basic',
        tiktokFullAudio: tiktokOriginalAudio || false,
        convertGif: twitterGif || false,
      };

      const response = await axios.post('https://cobalt.aethel.xyz/', requestBody, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      const endTime = Date.now();
      const processingTime = ((endTime - startTime) / 1000).toFixed(2);

      const data: CobaltResponse = response.data;

      if (data.status === 'tunnel' || data.status === 'redirect') {
        const downloadUrl = data.url;
        if (!downloadUrl) {
          throw new Error('No download URL received');
        }

        const buttonLabel = await client.getLocaleText(
          'commands.cobalt.button_label',
          interaction.locale
        );

        const container = new ContainerBuilder()
          .setAccentColor(0xc29df1)
          .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
              new MediaGalleryItemBuilder()
                .setDescription(data.filename || 'Downloaded media')
                .setURL(downloadUrl)
            )
          )

          .addSectionComponents(
            new SectionBuilder()
              .addTextDisplayComponents((textDisplay) =>
                textDisplay.setContent(`-# Took: ${processingTime}s`)
              )
              .setButtonAccessory((button) =>
                button.setLabel(buttonLabel).setStyle(ButtonStyle.Link).setURL(downloadUrl)
              )
          );

        await interaction.editReply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
      } else if (data.status === 'error') {
        const unknownError = await client.getLocaleText(
          'commands.cobalt.unknown_error',
          interaction.locale
        );
        let errorText = unknownError;

        if (data.error) {
          errorText = data.error.message || data.error.code || unknownError;
        } else if (data.text) {
          errorText = data.text;
        }

        const errorMessage = await client.getLocaleText(
          'commands.cobalt.error',
          interaction.locale,
          {
            error: errorText,
          }
        );

        const errorContainer = new ContainerBuilder()
          .setAccentColor(0xff4757)
          .addSectionComponents(
            new SectionBuilder().addTextDisplayComponents((textDisplay) =>
              textDisplay.setContent(`❌ ${errorMessage}`)
            )
          );

        await interaction.editReply({
          components: [errorContainer],
          flags: MessageFlags.IsComponentsV2,
        });
      } else if (data.status === 'picker') {
        const multipleItemsMessage = await client.getLocaleText(
          'commands.cobalt.multiple_items',
          interaction.locale,
          { url }
        );

        const pickerContainer = new ContainerBuilder()
          .setAccentColor(0xffa502)
          .addSectionComponents(
            new SectionBuilder().addTextDisplayComponents((textDisplay) =>
              textDisplay.setContent(
                `⚠️ ${multipleItemsMessage || 'Multiple items found. Please provide a more specific URL.'}`
              )
            )
          );

        await interaction.editReply({
          components: [pickerContainer],
          flags: MessageFlags.IsComponentsV2,
        });
      } else if (data.status === 'local-processing') {
        const notSupportedMessage = await client.getLocaleText(
          'commands.cobalt.local_processing_not_supported',
          interaction.locale
        );

        const processingContainer = new ContainerBuilder()
          .setAccentColor(0xffa502)
          .addSectionComponents(
            new SectionBuilder().addTextDisplayComponents((textDisplay) =>
              textDisplay.setContent(
                `⚠️ ${notSupportedMessage || 'Local processing is not supported. Please try a different URL or option.'}`
              )
            )
          );

        await interaction.editReply({
          components: [processingContainer],
          flags: MessageFlags.IsComponentsV2,
        });
      } else {
        const unknownResponseMessage = await client.getLocaleText(
          'commands.cobalt.unknown_response',
          interaction.locale
        );

        const unknownContainer = new ContainerBuilder()
          .setAccentColor(0xff4757)
          .addSectionComponents(
            new SectionBuilder().addTextDisplayComponents((textDisplay) =>
              textDisplay.setContent(`❓ ${unknownResponseMessage}`)
            )
          );

        await interaction.editReply({
          components: [unknownContainer],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    } catch (error) {
      await errorHandler({
        interaction,
        client,
        error: error as Error,
      });
    }
  },
} as SlashCommandProps;
