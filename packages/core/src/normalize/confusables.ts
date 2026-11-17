/**
 * Look-alike letters that NFKC does not fold. The table is a hand-picked
 * subset of the Unicode confusables data (UTS #39) covering the scripts most
 * often used to disguise English trigger words: Cyrillic, Greek, Armenian,
 * Latin small capitals and a few Latin variants.
 */
// prettier-ignore
const PAIRS: readonly string[] = [
  // Cyrillic lowercase
  'а a', 'е e', 'ё e', 'і i', 'ї i', 'ј j', 'к k', 'о o', 'р p', 'с c', 'ѕ s', 'у y', 'х x',
  'һ h', 'ԁ d', 'ԛ q', 'ԝ w', 'ӏ l', 'ь b', 'ո n', 'ɡ g',
  // Cyrillic uppercase
  'А A', 'В B', 'Е E', 'Ё E', 'К K', 'М M', 'Н H', 'О O', 'Р P', 'С C', 'Т T', 'Х X', 'У Y',
  'Ѕ S', 'І I', 'Ї I', 'Ј J', 'Ԛ Q', 'Ԝ W', 'Ү Y', 'Ӏ I',
  // Greek
  'Α A', 'Β B', 'Ε E', 'Ζ Z', 'Η H', 'Ι I', 'Κ K', 'Μ M', 'Ν N', 'Ο O', 'Ρ P', 'Τ T', 'Υ Y',
  'Χ X', 'α a', 'ι i', 'κ k', 'ν v', 'ο o', 'ρ p', 'υ u', 'χ x', 'ϲ c', 'ϳ j',
  // Armenian
  'օ o', 'ս u', 'հ h', 'ց g',
  // Latin small capitals and variants
  'ᴀ a', 'ʙ b', 'ᴄ c', 'ᴅ d', 'ᴇ e', 'ɢ g', 'ʜ h', 'ɪ i', 'ᴊ j', 'ᴋ k', 'ʟ l', 'ᴍ m', 'ɴ n',
  'ᴏ o', 'ᴘ p', 'ʀ r', 'ꜱ s', 'ᴛ t', 'ᴜ u', 'ᴠ v', 'ᴡ w', 'ʏ y', 'ᴢ z', 'ı i', 'ȷ j', 'ɑ a',
  'ɩ i', 'đ d', 'Đ D', 'ł l', 'Ł L', 'ø o', 'Ø O', 'ß ss',
];

const TABLE: ReadonlyMap<string, string> = new Map(
  PAIRS.map((p) => {
    const [from, to] = p.split(' ') as [string, string];
    return [from, to];
  }),
);

const REGIONAL_A = 0x1f1e6;
const REGIONAL_Z = 0x1f1ff;

/** Latin replacement for a single look-alike character, if any. */
export function foldConfusable(ch: string): string | undefined {
  const direct = TABLE.get(ch);
  if (direct !== undefined) return direct;
  const cp = ch.codePointAt(0) as number;
  if (cp >= REGIONAL_A && cp <= REGIONAL_Z) return String.fromCharCode(0x61 + cp - REGIONAL_A);
  return undefined;
}

export interface ConfusableResult {
  text: string;
  /** Words that were not plain Latin before mapping but are plain ASCII letters after it. */
  disguisedWords: number;
}

const WORD = /[\p{L}\p{M}\u{1F1E6}-\u{1F1FF}]+/gu;
const ASCII_WORD = /^[A-Za-z]+$/;

/** Replaces look-alike letters with their Latin counterparts. */
export function mapConfusables(text: string): ConfusableResult {
  let disguisedWords = 0;
  const out = text.replace(WORD, (word) => {
    let mapped = '';
    let changed = false;
    for (const ch of word) {
      const m = foldConfusable(ch);
      if (m === undefined) mapped += ch;
      else {
        mapped += m;
        changed = true;
      }
    }
    if (changed && ASCII_WORD.test(mapped) && !/[đĐłŁøØß]/u.test(word)) disguisedWords++;
    return mapped;
  });
  return { text: out, disguisedWords };
}

const LATIN = /\p{Script=Latin}/u;
const LOOKALIKE_SCRIPT =
  /[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Armenian}\p{Script=Cherokee}]/u;

/** Counts words that mix Latin letters with Cyrillic, Greek, Armenian or Cherokee ones. */
export function countMixedScriptWords(text: string): number {
  let n = 0;
  for (const word of text.match(/\p{L}+/gu) ?? []) {
    if (LATIN.test(word) && LOOKALIKE_SCRIPT.test(word)) n++;
  }
  return n;
}
