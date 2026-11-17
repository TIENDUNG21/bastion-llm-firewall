import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  binaryMetrics,
  confusionMatrix,
  evaluateScores,
  rocAuc,
  rocCurve,
} from '../../src/eval/metrics.js';

describe('confusionMatrix', () => {
  it('counts the four cells', () => {
    expect(confusionMatrix([1, 1, 0, 0, 1], [1, 0, 0, 1, 1])).toEqual({
      tp: 2,
      fn: 1,
      tn: 1,
      fp: 1,
    });
  });

  it('rejects arrays of different lengths', () => {
    expect(() => confusionMatrix([1, 0], [1])).toThrow(/same length/);
  });
});

describe('binaryMetrics', () => {
  it('computes precision, recall, F1, accuracy and false-positive rate', () => {
    const m = binaryMetrics({ tp: 8, fp: 2, tn: 85, fn: 5 });
    expect(m.precision).toBeCloseTo(0.8);
    expect(m.recall).toBeCloseTo(8 / 13);
    expect(m.f1).toBeCloseTo((2 * 0.8 * (8 / 13)) / (0.8 + 8 / 13));
    expect(m.accuracy).toBeCloseTo(0.93);
    expect(m.fpr).toBeCloseTo(2 / 87);
  });

  it('returns 0 instead of NaN for empty denominators', () => {
    expect(binaryMetrics({ tp: 0, fp: 0, tn: 0, fn: 0 })).toEqual({
      precision: 0,
      recall: 0,
      f1: 0,
      accuracy: 0,
      fpr: 0,
    });
  });
});

describe('rocAuc', () => {
  it('is 1 for a perfect ranking and 0 for a reversed one', () => {
    expect(rocAuc([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9])).toBe(1);
    expect(rocAuc([0, 0, 1, 1], [0.9, 0.8, 0.2, 0.1])).toBe(0);
  });

  it('counts ties as half', () => {
    expect(rocAuc([0, 1], [0.5, 0.5])).toBe(0.5);
    expect(rocAuc([0, 0, 1, 1], [0.1, 0.5, 0.5, 0.9])).toBe(0.875);
  });

  it('matches a hand-computed example', () => {
    // positive scores 0.8, 0.4; negative scores 0.6, 0.2 → 3 of 4 pairs ordered.
    expect(rocAuc([1, 0, 1, 0], [0.8, 0.6, 0.4, 0.2])).toBe(0.75);
  });

  it('is NaN when one class is missing', () => {
    expect(rocAuc([1, 1], [0.2, 0.3])).toBeNaN();
  });

  it('equals the pairwise definition (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom<0 | 1>(0, 1), fc.integer({ min: 0, max: 5 })), {
          minLength: 2,
          maxLength: 40,
        }),
        (rows) => {
          const labels = rows.map((r) => r[0]);
          const scores = rows.map((r) => r[1] / 5);
          const pos = scores.filter((_, i) => labels[i] === 1);
          const neg = scores.filter((_, i) => labels[i] === 0);
          if (pos.length === 0 || neg.length === 0) return;
          let wins = 0;
          for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
          expect(rocAuc(labels, scores)).toBeCloseTo(wins / (pos.length * neg.length), 10);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('rocCurve', () => {
  it('starts at (0,0), ends at (1,1) and is monotone', () => {
    const curve = rocCurve([0, 1, 0, 1, 1], [0.1, 0.9, 0.4, 0.4, 0.7]);
    expect(curve[0]).toMatchObject({ fpr: 0, tpr: 0 });
    expect(curve.at(-1)).toMatchObject({ fpr: 1, tpr: 1 });
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]!.fpr).toBeGreaterThanOrEqual(curve[i - 1]!.fpr);
      expect(curve[i]!.tpr).toBeGreaterThanOrEqual(curve[i - 1]!.tpr);
    }
  });
});

describe('evaluateScores', () => {
  it('thresholds scores with >= and reports everything at once', () => {
    const r = evaluateScores([1, 0, 1, 0], [0.5, 0.49, 0.9, 0.1], 0.5);
    expect(r.confusion).toEqual({ tp: 2, fp: 0, tn: 2, fn: 0 });
    expect(r.metrics.f1).toBe(1);
    expect(r.auc).toBe(1);
  });
});
