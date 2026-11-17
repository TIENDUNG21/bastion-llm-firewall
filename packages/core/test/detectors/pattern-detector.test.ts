import { describe, expect, it } from 'vitest';
import { createPatternDetector } from '../../src/detectors/pattern-detector.js';
import { noisyOr } from '../../src/detectors/score.js';
import { normalize } from '../../src/normalize/index.js';

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64');

describe('noisyOr', () => {
  it('combines independent probabilities', () => {
    expect(noisyOr([])).toBe(0);
    expect(noisyOr([0.5, 0.5])).toBeCloseTo(0.75);
    expect(noisyOr([1, 0.2])).toBe(1);
  });

  it('clamps out-of-range inputs', () => {
    expect(noisyOr([-1, 2])).toBe(1);
    expect(noisyOr([Number.NaN])).toBe(0);
  });
});

describe('createPatternDetector', () => {
  it('rejects global or sticky patterns, which would make exec stateful', () => {
    expect(() =>
      createPatternDetector({
        id: 'x',
        category: 'role-play',
        description: 'x',
        rules: [{ id: 'g', pattern: /a/g, weight: 0.5, explain: 'x' }],
      }),
    ).toThrow(/global or sticky/);
  });

  it('counts each rule once even when it matches in several views', () => {
    const detector = createPatternDetector({
      id: 'demo',
      category: 'role-play',
      description: 'demo',
      rules: [{ id: 'word', pattern: /\bbanana\b/, weight: 0.5, explain: 'banana' }],
    });
    const finding = detector.detect(normalize(`banana ${b64('banana split for two')}`), []);
    expect(finding?.score).toBe(0.5);
    expect(finding?.evidence).toHaveLength(1);
  });
});
