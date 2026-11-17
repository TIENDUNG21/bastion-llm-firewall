/**
 * Text features for the classifier: character n-grams (robust to spelling
 * tricks and word boundaries) plus word unigrams and bigrams (phrases).
 * Terms are mapped into a fixed-size vector with the signed hashing trick,
 * so the model needs no vocabulary file.
 */

export interface FeatureConfig {
  /** Vector size; must be a power of two. */
  dim: number;
  charMin: number;
  charMax: number;
  words: boolean;
  bigrams: boolean;
  /** Only the first `maxChars` code points of the skeleton are used. */
  maxChars: number;
}

export const DEFAULT_FEATURES: FeatureConfig = {
  dim: 1 << 16,
  charMin: 3,
  charMax: 5,
  words: true,
  bigrams: true,
  maxChars: 4000,
};

export interface SparseVector {
  /** Strictly increasing feature indices. */
  indices: Int32Array;
  values: Float32Array;
}

/** 32-bit FNV-1a over UTF-16 code units (equal to the byte version for ASCII). */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Bucket and sign of a term: low bits pick the bucket, the top bit picks the sign. */
export function hashTerm(term: string, dim: number): { index: number; sign: 1 | -1 } {
  const h = fnv1a(term);
  return { index: h & (dim - 1), sign: h >>> 31 === 1 ? -1 : 1 };
}

const WORD = /[\p{L}\p{N}]+/gu;

/** Term counts for a skeleton. Prefixes: `c:` char n-gram, `w:` word, `b:` bigram. */
export function featureTerms(skel: string, cfg: FeatureConfig): Map<string, number> {
  const chars = Array.from(skel).slice(0, cfg.maxChars);
  const text = chars.join('');
  const terms = new Map<string, number>();
  const add = (t: string): void => {
    terms.set(t, (terms.get(t) ?? 0) + 1);
  };
  const padded = [' ', ...chars, ' '];
  for (let n = cfg.charMin; n <= cfg.charMax; n++) {
    for (let i = 0; i + n <= padded.length; i++) add(`c:${padded.slice(i, i + n).join('')}`);
  }
  const words = text.match(WORD) ?? [];
  if (cfg.words) for (const w of words) add(`w:${w}`);
  if (cfg.bigrams) for (let i = 1; i < words.length; i++) add(`b:${words[i - 1]} ${words[i]}`);
  return terms;
}

/** Hashed, log-scaled (log1p of counts), L2-normalised feature vector. */
export function vectorize(skel: string, cfg: FeatureConfig): SparseVector {
  const acc = new Map<number, number>();
  for (const [term, count] of featureTerms(skel, cfg)) {
    const { index, sign } = hashTerm(term, cfg.dim);
    acc.set(index, (acc.get(index) ?? 0) + sign * Math.log1p(count));
  }
  const indices = [...acc.keys()].filter((i) => acc.get(i) !== 0).sort((a, b) => a - b);
  let norm = 0;
  for (const i of indices) norm += (acc.get(i) as number) ** 2;
  norm = Math.sqrt(norm) || 1;
  return {
    indices: Int32Array.from(indices),
    values: Float32Array.from(indices.map((i) => (acc.get(i) as number) / norm)),
  };
}
