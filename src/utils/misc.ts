export function random<T>(array: T[]): T | undefined {
  if (array.length === 0) {
    return undefined;
  }
  return array[Math.floor(Math.random() * array.length)];
}

export function iso2ToDiscordFlag(iso2: string): string {
  if (!iso2 || iso2.length !== 2) return '';
  return `:flag_${iso2.toLowerCase()}:`;
}
