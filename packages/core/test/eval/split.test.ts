import { describe, expect, it } from 'vitest';
import { dedupe, stratifiedSplit } from '../../src/eval/split.js';
import { mulberry32, shuffle } from '../../src/util/random.js';

const rows = Array.from({ length: 200 }, (_, i) => ({
  text: `row ${i}`,
  label: (i % 4 === 0 ? 1 : 0) as 0 | 1,
  source: i < 120 ? 'a' : 'b',
}));

describe('mulberry32 and shuffle', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(c()).not.toBe(xs[0]);
    for (const x of xs) expect(x).toBeGreaterThanOrEqual(0);
    for (const x of xs) expect(x).toBeLessThan(1);
  });

  it('shuffles a copy and keeps every element', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(input, mulberry32(1));
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort()).toEqual(input);
  });
});

describe('stratifiedSplit', () => {
  it('is deterministic for a seed', () => {
    const a = stratifiedSplit(rows, { seed: 7, testFraction: 0.2 });
    const b = stratifiedSplit(rows, { seed: 7, testFraction: 0.2 });
    expect(a.test.map((r) => r.text)).toEqual(b.test.map((r) => r.text));
  });

  it('produces disjoint parts that cover every row', () => {
    const { train, test } = stratifiedSplit(rows, { seed: 7, testFraction: 0.2 });
    const ids = new Set([...train, ...test].map((r) => r.text));
    expect(ids.size).toBe(rows.length);
    expect(train.length + test.length).toBe(rows.length);
  });

  it('keeps the share of each (source, label) group', () => {
    const { test } = stratifiedSplit(rows, { seed: 7, testFraction: 0.2 });
    const count = (src: string, label: number) =>
      test.filter((r) => r.source === src && r.label === label).length;
    expect(count('a', 1)).toBe(6); // 30 rows in group
    expect(count('a', 0)).toBe(18); // 90 rows
    expect(count('b', 1)).toBe(4); // 20 rows
    expect(count('b', 0)).toBe(12); // 60 rows
  });

  it('rejects a fraction outside (0, 1)', () => {
    expect(() => stratifiedSplit(rows, { seed: 1, testFraction: 1 })).toThrow(/testFraction/);
  });
});

describe('dedupe', () => {
  it('drops exact duplicates by key and rows whose duplicates disagree on the label', () => {
    const input = [
      { text: 'Hello', label: 0 as const, source: 'a' },
      { text: 'hello ', label: 0 as const, source: 'b' },
      { text: 'Ignore it', label: 1 as const, source: 'a' },
      { text: 'ignore it', label: 0 as const, source: 'a' },
      { text: 'other', label: 1 as const, source: 'a' },
    ];
    const r = dedupe(input, (t) => t.trim().toLowerCase());
    expect(r.rows.map((x) => x.text)).toEqual(['Hello', 'other']);
    expect(r.duplicates).toBe(1);
    expect(r.conflicts).toBe(2);
  });
});
