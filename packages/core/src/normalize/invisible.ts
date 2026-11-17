/**
 * Invisible and formatting code points that render as nothing but still reach
 * the model's tokenizer. Attackers use them to split trigger words
 * ("ig\u200Bnore") or, with Unicode tag characters, to hide whole sentences.
 */

/** Inclusive code point ranges treated as invisible. */
const INVISIBLE_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x0008], // C0 controls (tab, LF, VT, FF and CR are kept)
  [0x000e, 0x001f],
  [0x007f, 0x009f], // DEL and C1 controls
  [0x00ad, 0x00ad], // soft hyphen
  [0x034f, 0x034f], // combining grapheme joiner
  [0x061c, 0x061c], // Arabic letter mark
  [0x115f, 0x1160], // Hangul fillers
  [0x17b4, 0x17b5], // Khmer inherent vowels
  [0x180b, 0x180f], // Mongolian variation selectors and vowel separator
  [0x200b, 0x200f], // zero-width space, (non-)joiner, LRM, RLM
  [0x202a, 0x202e], // bidi embeddings and overrides
  [0x2060, 0x2064], // word joiner, invisible operators
  [0x2066, 0x206f], // bidi isolates, deprecated format characters
  [0x3164, 0x3164], // Hangul filler
  [0xfe00, 0xfe0f], // variation selectors
  [0xfeff, 0xfeff], // byte order mark / zero-width no-break space
  [0xffa0, 0xffa0], // halfwidth Hangul filler
  [0x1bca0, 0x1bca3], // shorthand format controls
  [0x1d173, 0x1d17a], // musical symbol format controls
  [0xe0000, 0xe007f], // tag characters
  [0xe0100, 0xe01ef], // variation selectors supplement
];

export function isInvisible(cp: number): boolean {
  for (const [lo, hi] of INVISIBLE_RANGES) {
    if (cp < lo) return false;
    if (cp <= hi) return true;
  }
  return false;
}

export interface StripResult {
  text: string;
  removed: number;
}

/** Removes every invisible code point. */
export function stripInvisible(text: string): StripResult {
  let out = '';
  let removed = 0;
  for (const ch of text) {
    if (isInvisible(ch.codePointAt(0) as number)) removed++;
    else out += ch;
  }
  return { text: out, removed };
}

const WAVING_BLACK_FLAG = 0x1f3f4;
const TAG_FIRST = 0xe0020;
const TAG_LAST = 0xe007e;
const CANCEL_TAG = 0xe007f;

/**
 * Recovers ASCII text smuggled as Unicode tag characters (U+E0020..U+E007E).
 * Emoji subdivision flags (U+1F3F4 followed by tags) are legitimate and skipped.
 * Returns null when there is no hidden text.
 */
export function decodeTagPayload(text: string): string | null {
  let hidden = '';
  let inFlag = false;
  let prev = -1;
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (cp >= TAG_FIRST && cp <= TAG_LAST) {
      if (prev === WAVING_BLACK_FLAG) inFlag = true;
      if (!inFlag) hidden += String.fromCharCode(cp - 0xe0000);
    } else if (cp === CANCEL_TAG) {
      inFlag = false;
    } else {
      inFlag = false;
    }
    prev = cp;
  }
  return hidden.length > 0 ? hidden : null;
}
