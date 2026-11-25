// Vditor normalizes Markdown fences and HTML entities on every edit. Keep the
// sanitized HTML intact, including code examples that contain their own fence.
export function encodeWechatFence(html: string) {
  const bytes = new TextEncoder().encode(html);
  return (
    "base64:" +
    btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
  );
}
export function decodeWechatFence(value: string) {
  const text = value.trim();
  if (!text.startsWith("base64:")) return text;
  try {
    const bytes = Uint8Array.from(atob(text.slice(7)), (char) =>
      char.charCodeAt(0),
    );
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return "";
  }
}
