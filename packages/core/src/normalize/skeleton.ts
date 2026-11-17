import { toWellFormed } from '../util/text.js';
import { countMixedScriptWords, mapConfusables } from './confusables.js';
import { stripInvisible } from './invisible.js';
import { collapseSpacedLetters, decodeLeet } from './leet.js';

export interface SkeletonStats {
  invisible: number;
  disguisedWords: number;
  mixedScriptWords: number;
  leetTokens: number;
  spacedRuns: number;
}

export interface SkeletonResult {
  skeleton: string;
  stats: SkeletonStats;
}

/** Collapses runs of horizontal whitespace to one space and blank lines to one newline. */
export function collapseWhitespace(text: string): string {
  return text
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n[\s]*/g, '\n')
    .trim();
}

/**
 * Builds the matching skeleton:
 * NFKC → strip invisible → confusables → lowercase → NFD and drop marks →
 * leetspeak → spaced letters → whitespace.
 *
 * NFKC comes first, so canonically equivalent inputs (NFC vs NFD) always give
 * the same skeleton.
 */
export function skeletonWithStats(input: string): SkeletonResult {
  let t = toWellFormed(input).normalize('NFKC');
  const invisible = stripInvisible(t);
  t = invisible.text;
  const mixedScriptWords = countMixedScriptWords(t);
  const confusables = mapConfusables(t);
  t = confusables.text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const leet = decodeLeet(t);
  const spaced = collapseSpacedLetters(leet.text);
  return {
    skeleton: collapseWhitespace(spaced.text),
    stats: {
      invisible: invisible.removed,
      disguisedWords: confusables.disguisedWords,
      mixedScriptWords,
      leetTokens: leet.count,
      spacedRuns: spaced.count,
    },
  };
}

export function skeleton(input: string): string {
  return skeletonWithStats(input).skeleton;
}
