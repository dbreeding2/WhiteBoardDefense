/**
 * Validates and normalises a string to a safe PNG data URL.
 * Returns a canonical "data:image/png;base64,<payload>" string only when:
 * - payload is valid base64,
 * - payload starts with a PNG signature, and
 * - payload is within a safe size limit.
 * Otherwise returns an empty string.
 */
export function toSafePngDataUrl(input: string): string {
  if (typeof input !== "string" || input.length === 0) return "";

  const dataPngBase64Prefix = "data:image/png;base64,";
  const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  const pngBase64Signature = "iVBORw0KGgo";
  // 8 MiB binary ~= 10.7 MiB base64 payload
  const maxBase64Length = 11_200_000;

  // Collapse whitespace so multi-line/base64-wrapped values can be normalized.
  const normalized = input.replace(/[\t\n\r\f ]+/g, "").trim();
  if (!normalized) return "";

  let payload = "";
  if (normalized.toLowerCase().startsWith(dataPngBase64Prefix)) {
    payload = normalized.slice(dataPngBase64Prefix.length);
  } else {
    payload = normalized;
  }

  if (!payload || payload.length > maxBase64Length) return "";
  if (!base64Pattern.test(payload)) return "";
  if (!payload.startsWith(pngBase64Signature)) return "";

  return `${dataPngBase64Prefix}${payload}`;
}
