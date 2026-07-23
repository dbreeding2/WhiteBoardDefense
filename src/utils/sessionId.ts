const SESSION_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const DEFAULT_SESSION_ID_LENGTH = 6;
const MAX_UNBIASED_BYTE = 252;
const SESSION_ID_PATTERN = /^[A-Z0-9]{6}$/;

export function generateSessionId(length = DEFAULT_SESSION_ID_LENGTH): string {
  const chars: string[] = [];

  while (chars.length < length) {
    const bytes = new Uint8Array((length - chars.length) * 2);
    globalThis.crypto.getRandomValues(bytes);

    for (const byte of bytes) {
      if (byte >= MAX_UNBIASED_BYTE) continue;

      chars.push(SESSION_ID_ALPHABET[byte % SESSION_ID_ALPHABET.length]);
      if (chars.length === length) {
        return chars.join("");
      }
    }
  }

  return chars.join("");
}

export function normalizeSessionId(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidSessionId(value: string): boolean {
  return SESSION_ID_PATTERN.test(value);
}
