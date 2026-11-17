/**
 * Decoders for payloads wrapped to slip past keyword filters: base64, hex,
 * escape sequences, rot13 and reversed text. Every decoder is conservative:
 * a decoding is kept only when the result is valid UTF-8 and looks like text.
 */
import { decodeUtf8 } from '../util/utf8.js';
import { letterCount, printableRatio } from '../util/text.js';
import { readsAsEnglishInstead } from './english.js';

const B64_VALUES: Readonly<Record<string, number>> = (() => {
  const table: Record<string, number> = {};
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < alphabet.length; i++) table[alphabet[i] as string] = i;
  table['+'] = 62;
  table['/'] = 63;
  table['-'] = 62;
  table['_'] = 63;
  return table;
})();

/** Decodes standard or URL-safe base64 (padding optional) into a UTF-8 string, or null. */
export function decodeBase64(input: string): string | null {
  const s = input.replace(/=+$/, '');
  if (s.length === 0 || s.length % 4 === 1) return null;
  const bytes = new Uint8Array(Math.floor((s.length * 3) / 4));
  let acc = 0;
  let bits = 0;
  let n = 0;
  for (const ch of s) {
    const v = B64_VALUES[ch];
    if (v === undefined) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[n++] = (acc >> bits) & 0xff;
    }
  }
  return decodeUtf8(bytes.subarray(0, n));
}

function looksLikeText(s: string, minLetters: number): boolean {
  if (s.trim().length === 0) return false;
  const letters = letterCount(s);
  return letters >= minLetters && letters / [...s].length >= 0.5 && printableRatio(s) >= 0.9;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

const B64_CANDIDATE = /[A-Za-z0-9+/_-]{16,}={0,2}/g;

/** Finds base64 blobs (16+ chars) that decode to readable text. */
export function findBase64Payloads(text: string): string[] {
  const out: string[] = [];
  for (const candidate of text.match(B64_CANDIDATE) ?? []) {
    const plausible = /[a-z]/.test(candidate) && /[A-Z0-9+/_-]/.test(candidate);
    if (!plausible) continue;
    const decoded = decodeBase64(candidate);
    if (decoded !== null && looksLikeText(decoded, 4)) out.push(decoded);
  }
  return unique(out);
}

function hexBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\\x|[ :]/g, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

const HEX_PATTERNS: readonly RegExp[] = [
  /\b(?:[0-9a-fA-F]{2}){6,}\b/g,
  /\b[0-9a-fA-F]{2}(?:[ :][0-9a-fA-F]{2}){5,}\b/g,
  /(?:\\x[0-9a-fA-F]{2}){4,}/g,
];

/** Finds contiguous, space/colon separated and \x-escaped hex that decodes to text. */
export function findHexPayloads(text: string): string[] {
  const out: string[] = [];
  for (const pattern of HEX_PATTERNS) {
    for (const m of text.match(pattern) ?? []) {
      const decoded = decodeUtf8(hexBytes(m));
      if (decoded !== null && looksLikeText(decoded, 3)) out.push(decoded);
    }
  }
  return unique(out);
}

function fromCodePointSafe(cp: number): string | null {
  if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
    return null;
  }
  return String.fromCodePoint(cp);
}

const PERCENT_RUN = /(?:%[0-9A-Fa-f]{2}){3,}/g;
const ENTITY_RUN = /(?:&#(?:[xX][0-9a-fA-F]{1,6}|[0-9]{1,7});){3,}/g;
const UNICODE_ESCAPE_RUN = /(?:\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]{1,6}\}){3,}/g;

/**
 * Decodes runs of percent-encoding, HTML numeric entities and \u escapes in
 * place (three or more in a row). Returns the rewritten text, or nothing when
 * no run decoded cleanly.
 */
export function findEscapedPayloads(text: string): string[] {
  let changed = false;
  let out = text.replace(PERCENT_RUN, (run) => {
    const decoded = decodeUtf8(hexBytes(run.replace(/%/g, '')));
    if (decoded === null) return run;
    changed = true;
    return decoded;
  });
  out = out.replace(ENTITY_RUN, (run) => {
    let decoded = '';
    for (const m of run.matchAll(/&#([xX]?)([0-9a-fA-F]+);/g)) {
      const ch = fromCodePointSafe(parseInt(m[2] as string, m[1] ? 16 : 10));
      if (ch === null) return run;
      decoded += ch;
    }
    changed = true;
    return decoded;
  });
  out = out.replace(UNICODE_ESCAPE_RUN, (run) => {
    const units: number[] = [];
    for (const m of run.matchAll(/\\u(?:\{([0-9a-fA-F]+)\}|([0-9a-fA-F]{4}))/g)) {
      units.push(parseInt((m[1] ?? m[2]) as string, 16));
    }
    const decoded = units.map((u) => String.fromCodePoint(Math.min(u, 0x10ffff))).join('');
    changed = true;
    return decoded;
  });
  return changed && looksLikeText(out, 2) ? [out] : [];
}

/** Rotates ASCII letters by 13 places. */
export function rot13(text: string): string {
  return text.replace(/[A-Za-z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

/** Reverses a string by code points (keeps astral characters intact). */
export function reverseText(text: string): string {
  return [...text].reverse().join('');
}

const SEGMENT_SPLIT = /[\n.!?:;]+/;

function transformedSegments(text: string, transform: (s: string) => string): string[] {
  const out: string[] = [];
  for (const segment of text.split(SEGMENT_SPLIT)) {
    const candidate = transform(segment).trim();
    if (readsAsEnglishInstead(segment, candidate)) out.push(candidate);
  }
  return out;
}

/** Sentences that read as English only after rot13. */
export function findRot13Segments(text: string): string[] {
  return transformedSegments(text, rot13);
}

/** Sentences that read as English only after reversing. */
export function findReversedSegments(text: string): string[] {
  return transformedSegments(text, reverseText);
}
