/**
 * Validates and normalises a string to a safe PNG data URL.
 * Returns the canonical "data:image/png;base64,<payload>" string if the input
 * contains only valid base-64 characters after the prefix, or an empty string
 * when the input is absent or malformed.
 */
export function toSafePngDataUrl(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  const dataPngBase64Prefix = "data:image/png;base64,";
  const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;

  if (trimmed.startsWith(dataPngBase64Prefix)) {
    const payload = trimmed.slice(dataPngBase64Prefix.length);
    return base64Pattern.test(payload) ? trimmed : "";
  }

  return base64Pattern.test(trimmed) ? `${dataPngBase64Prefix}${trimmed}` : "";
}
