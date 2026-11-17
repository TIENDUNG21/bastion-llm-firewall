/**
 * A tiny English-likeness score used to decide whether a rot13-decoded or
 * reversed segment is real text. It counts very common English words; no
 * dictionary is shipped.
 */
// prettier-ignore
const COMMON = new Set([
  'a', 'about', 'above', 'after', 'again', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'as',
  'ask', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'but', 'by', 'can', 'could',
  'did', 'do', 'does', 'doing', 'done', 'down', 'each', 'every', 'everything', 'few', 'for',
  'forget', 'from', 'give', 'go', 'good', 'had', 'has', 'have', 'he', 'hello', 'her', 'here',
  'him', 'his', 'how', 'i', 'if', 'ignore', 'in', 'instead', 'instructions', 'into', 'is', 'it',
  'its', 'just', 'know', 'like', 'make', 'me', 'more', 'most', 'must', 'my', 'new', 'no', 'not',
  'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'out', 'over', 'password',
  'please', 'previous', 'print', 'prompt', 'reveal', 'rules', 'say', 'secret', 'she', 'should',
  'show', 'so', 'some', 'such', 'system', 'take', 'tell', 'than', 'that', 'the', 'their', 'them',
  'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until',
  'up', 'us', 'use', 'very', 'want', 'was', 'way', 'we', 'well', 'were', 'what', 'when', 'where',
  'which', 'while', 'who', 'why', 'will', 'with', 'would', 'write', 'you', 'your',
]);

export interface EnglishScore {
  words: number;
  hits: number;
  ratio: number;
}

export function englishScore(text: string): EnglishScore {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  let hits = 0;
  for (const w of words) if (COMMON.has(w)) hits++;
  return { words: words.length, hits, ratio: words.length === 0 ? 0 : hits / words.length };
}

/**
 * True when `candidate` reads as English and clearly more so than `original`:
 * at least 3 common words, at least half of its words common, and a ratio at
 * least 0.3 higher than the original's.
 */
export function readsAsEnglishInstead(original: string, candidate: string): boolean {
  const a = englishScore(original);
  const b = englishScore(candidate);
  return b.hits >= 3 && b.ratio >= 0.5 && b.ratio - a.ratio >= 0.3;
}
