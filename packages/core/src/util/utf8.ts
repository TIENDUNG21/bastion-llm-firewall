/**
 * Strict UTF-8 codec. Written by hand so that `@bastion/core` needs no
 * platform globals (TextDecoder/Buffer) and behaves identically in Node and
 * the browser.
 */

/** Decodes UTF-8 bytes. Returns null on any malformed, overlong or surrogate sequence. */
export function decodeUtf8(bytes: Uint8Array): string | null {
  const parts: string[] = [];
  let chunk: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i] as number;
    let cp: number;
    let need: number;
    let min: number;
    if (b0 < 0x80) {
      cp = b0;
      need = 0;
      min = 0;
    } else if (b0 >= 0xc2 && b0 <= 0xdf) {
      cp = b0 & 0x1f;
      need = 1;
      min = 0x80;
    } else if (b0 >= 0xe0 && b0 <= 0xef) {
      cp = b0 & 0x0f;
      need = 2;
      min = 0x800;
    } else if (b0 >= 0xf0 && b0 <= 0xf4) {
      cp = b0 & 0x07;
      need = 3;
      min = 0x10000;
    } else {
      return null;
    }
    for (let k = 1; k <= need; k++) {
      const b = bytes[i + k];
      if (b === undefined || (b & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (b & 0x3f);
    }
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
    chunk.push(cp);
    if (chunk.length >= 4096) {
      parts.push(String.fromCodePoint(...chunk));
      chunk = [];
    }
    i += need + 1;
  }
  parts.push(String.fromCodePoint(...chunk));
  return parts.join('');
}

/** Encodes a string as UTF-8. Lone surrogates are encoded as U+FFFD. */
export function encodeUtf8(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    let cp = ch.codePointAt(0) as number;
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000)
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
  }
  return Uint8Array.from(out);
}
