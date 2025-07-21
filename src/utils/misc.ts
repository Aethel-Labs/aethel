export function random<T>(array: T[]): T | undefined {
  if (array.length === 0) {
    return undefined;
  }
  return array[Math.floor(Math.random() * array.length)];
}

export function iso2ToFlagEmoji(iso2: string): string {
  if (!iso2 || iso2.length !== 2) return '';
  const upper = iso2.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return '';
  const codePoints = upper.split('').map((char) => 0x1f1e6 + char.charCodeAt(0) - 65);
  if (codePoints.some((cp) => cp < 0x1f1e6 || cp > 0x1f1ff)) return '';
  return String.fromCodePoint(...codePoints);
}

export function iso2ToDiscordFlag(iso2: string): string {
  if (!iso2 || iso2.length !== 2) return '';
  return `:flag_${iso2.toLowerCase()}:`;
}
