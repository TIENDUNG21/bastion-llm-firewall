/** Small text helpers shared by the normalizer and the scanners. */

const PRINTABLE = /[\p{L}\p{N}\p{P}\p{S}\p{Zs}\t\n\r]/u;

/** Share of code points that are letters, digits, punctuation, symbols or spaces. */
export function printableRatio(text: string): number {
  let total = 0;
  let ok = 0;
  for (const ch of text) {
    total++;
    if (PRINTABLE.test(ch)) ok++;
  }
  return total === 0 ? 0 : ok / total;
}

/** Number of letters (any script) in the text. */
export function letterCount(text: string): number {
  const m = text.match(/\p{L}/gu);
  return m ? m.length : 0;
}

/**
 * Cuts a string to at most `max` UTF-16 code units without splitting a
 * surrogate pair.
 */
export function truncateSafe(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = max;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end--;
  return text.slice(0, end);
}

/** Replaces lone surrogates with U+FFFD so later normalization never throws. */
export function toWellFormed(text: string): string {
  return text.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    '\uFFFD',
  );
}
