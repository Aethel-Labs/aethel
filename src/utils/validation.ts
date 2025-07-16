import validator from 'validator';
import { ChatInputCommandInteraction } from 'discord.js';
import { UNALLOWED_WORDS } from '../constants/unallowedWords';

interface ValidationResult {
  isValid: boolean;
  message?: string;
}

function validateCommandOptions(
  interaction: ChatInputCommandInteraction,
  requiredOptions: string[] = []
): ValidationResult {
  for (const option of requiredOptions) {
    const value = interaction.options.getString(option);
    if (!value || value.trim() === '') {
      return {
        isValid: false,
        message: `Missing required option: ${option}`,
      };
    }
  }
  return { isValid: true };
}

function sanitizeInput(input?: string | null): string {
  if (!input) return '';
  return input.replace(/[<>"']/g, '').substring(0, 1000);
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function validateTimeString(timeStr: string): boolean {
  if (typeof timeStr !== 'string') return false;

  const timeRegex = /^(\d+h)?(\d+m)?$|^(\d+m)?(\d+h)?$/i;
  return timeRegex.test(timeStr);
}

function parseTimeString(timeStr: string): number | null {
  if (!validateTimeString(timeStr)) return null;

  let minutes = 0;
  const hoursMatch = timeStr.match(/(\d+)h/i);
  const minsMatch = timeStr.match(/(\d+)m/i);

  if (hoursMatch) minutes += parseInt(hoursMatch[1], 10) * 60;
  if (minsMatch) minutes += parseInt(minsMatch[1], 10);

  return minutes > 0 ? minutes : null;
}

function formatTimeString(minutes: number): string {
  if (!minutes || minutes < 0) return '0m';

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0 || hours === 0) parts.push(`${mins}m`);

  return parts.join(' ');
}

function isValidDomain(domain: string): boolean {
  if (typeof domain !== 'string') return false;
  return validator.isFQDN(domain, { require_tld: true });
}

function normalizeInput(text: string): string {
  let normalized = text.toLowerCase();
  normalized = normalized.replace(/([a-z])\1{2,}/g, '$1');
  normalized = normalized.replace(/[@4]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't');
  return normalized;
}

export function getUnallowedWordCategory(text: string): string | null {
  const normalized = normalizeInput(text);
  for (const [category, words] of Object.entries(UNALLOWED_WORDS)) {
    for (const word of words as string[]) {
      if (category === 'slurs') {
        if (normalized.includes(word)) {
          return category;
        }
      } else {
        const pattern = new RegExp(`(?:^|\\W)${word}[a-z]{0,2}(?:\\W|$)`, 'i');
        if (pattern.test(normalized)) {
          return category;
        }
      }
    }
  }
  return null;
}

export {
  validateCommandOptions,
  sanitizeInput,
  validateTimeString,
  parseTimeString,
  formatTimeString,
  isValidUrl,
  isValidDomain,
};
