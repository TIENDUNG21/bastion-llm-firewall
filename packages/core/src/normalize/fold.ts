import { foldConfusable } from './confusables.js';
import { isInvisible } from './invisible.js';

export interface FoldResult {
  /** Folded text: invisible characters removed, each code point NFKC-folded and de-confused. */
  text: string;
  /**
   * `map[i]` is the UTF-16 index in the original string of folded character `i`;
   * `map[text.length]` is the original length, so spans `[start, end)` map back
   * with `map[start]` and `map[end]`.
   */
  map: number[];
}

/**
 * Offset-preserving fold used by the output scanners: PII and secrets are
 * matched on the folded text and redacted at the original offsets, so a
 * zero-width space inside an e-mail address or fullwidth digits in a phone
 * number do not hide them.
 */
export function foldWithMap(original: string): FoldResult {
  let text = '';
  const map: number[] = [];
  let index = 0;
  for (const ch of original) {
    const cp = ch.codePointAt(0) as number;
    if (!isInvisible(cp)) {
      const nfkc = ch.normalize('NFKC');
      let folded = '';
      for (const c of nfkc) folded += foldConfusable(c) ?? c;
      for (let k = folded.length; k > 0; k--) map.push(index);
      text += folded;
    }
    index += ch.length;
  }
  map.push(original.length);
  return { text, map };
}
