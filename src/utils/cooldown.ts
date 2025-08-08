import BotClient from '@/services/Client';
import { MessageFlags, InteractionReplyOptions } from 'discord.js';

interface CooldownManager {
  cooldowns: Map<string, number>;
  cooldownTime: number;
}

const managers = new Map<string, CooldownManager>();

setInterval(
  () => {
    const now = Date.now();
    for (const manager of managers.values()) {
      for (const [userId, timestamp] of manager.cooldowns.entries()) {
        if (now - timestamp > manager.cooldownTime) {
          manager.cooldowns.delete(userId);
        }
      }
    }
  },
  5 * 60 * 1000,
);

export function createCooldownManager(commandName: string, cooldownTime: number): CooldownManager {
  const manager = {
    cooldowns: new Map<string, number>(),
    cooldownTime,
  };
  managers.set(commandName, manager);
  return manager;
}

export async function checkCooldown(
  manager: CooldownManager,
  userId: string,
  client: BotClient,
  locale: string,
): Promise<{ onCooldown: boolean; timeLeft?: number; message?: string }> {
  const now = Date.now();
  const cooldownEnd = manager.cooldowns.get(userId) || 0;

  if (now < cooldownEnd) {
    const timeLeft = Math.ceil((cooldownEnd - now) / 1000);
    const message = await client.getLocaleText('cooldown', locale, {
      cooldown: timeLeft,
    });
    return { onCooldown: true, timeLeft, message };
  }

  return { onCooldown: false };
}

export function setCooldown(manager: CooldownManager, userId: string): void {
  const now = Date.now();
  manager.cooldowns.set(userId, now + manager.cooldownTime);
  setTimeout(() => manager.cooldowns.delete(userId), manager.cooldownTime);
}

export function createCooldownResponse(message: string): InteractionReplyOptions {
  return {
    content: message,
    flags: MessageFlags.Ephemeral,
  };
}
