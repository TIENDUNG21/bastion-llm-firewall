import { mulberry32, shuffle } from '../util/random.js';
import type { Label } from './metrics.js';

export interface LabeledText {
  text: string;
  label: Label;
  /** Dataset the row came from; splits are stratified per source and label. */
  source: string;
}

export interface DedupeResult<T> {
  rows: T[];
  /** Rows dropped because an identical row (same key and label) came earlier. */
  duplicates: number;
  /** Rows dropped because rows with the same key carry different labels. */
  conflicts: number;
}

/**
 * Removes duplicates by `key` (keeping the first) and drops every row whose
 * key appears with both labels, so the same text can never sit in train and
 * test, or teach both classes.
 */
export function dedupe<T extends LabeledText>(
  rows: readonly T[],
  key: (text: string) => string,
): DedupeResult<T> {
  const labels = new Map<string, Set<Label>>();
  for (const r of rows) {
    const k = key(r.text);
    const set = labels.get(k) ?? new Set<Label>();
    set.add(r.label);
    labels.set(k, set);
  }
  const seen = new Set<string>();
  const out: T[] = [];
  let duplicates = 0;
  let conflicts = 0;
  for (const r of rows) {
    const k = key(r.text);
    if ((labels.get(k)?.size ?? 0) > 1) {
      conflicts++;
      continue;
    }
    if (seen.has(k)) {
      duplicates++;
      continue;
    }
    seen.add(k);
    out.push(r);
  }
  return { rows: out, duplicates, conflicts };
}

export interface SplitOptions {
  seed: number;
  /** Share of each (source, label) group placed in the test part, in (0, 1). */
  testFraction: number;
}

/** Seeded split that keeps each (source, label) group's share in both parts. */
export function stratifiedSplit<T extends LabeledText>(
  rows: readonly T[],
  options: SplitOptions,
): { train: T[]; test: T[] } {
  const { seed, testFraction } = options;
  if (!(testFraction > 0 && testFraction < 1)) {
    throw new Error(`testFraction must be in (0, 1), got ${testFraction}`);
  }
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const k = `${r.source}\u0000${r.label}`;
    const g = groups.get(k) ?? [];
    g.push(r);
    groups.set(k, g);
  }
  const random = mulberry32(seed);
  const train: T[] = [];
  const test: T[] = [];
  for (const k of [...groups.keys()].sort()) {
    const shuffled = shuffle(groups.get(k) as T[], random);
    const nTest = Math.round(shuffled.length * testFraction);
    test.push(...shuffled.slice(0, nTest));
    train.push(...shuffled.slice(nTest));
  }
  return { train, test };
}
