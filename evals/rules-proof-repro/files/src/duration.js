const units = { h: 3600, m: 60, s: 1 };

export function parseDuration(text) {
  const match = /^(\d+)([hms])/.exec(text);
  if (!match) throw new Error(`bad duration: ${text}`);
  return Number(match[1]) * units[match[2]];
}
