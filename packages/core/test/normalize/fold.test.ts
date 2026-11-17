import { describe, expect, it } from 'vitest';
import { foldWithMap } from '../../src/normalize/fold.js';

describe('foldWithMap', () => {
  it('strips invisible characters and remembers original offsets', () => {
    const original = 'mail: a\u200Bb@x.io';
    const { text, map } = foldWithMap(original);
    expect(text).toBe('mail: ab@x.io');
    const at = text.indexOf('b@');
    expect(original[map[at] ?? -1]).toBe('b');
  });

  it('folds fullwidth digits so phone numbers are found', () => {
    expect(foldWithMap('\uFF10\uFF19\uFF10\uFF11').text).toBe('0901');
  });

  it('maps expanded characters back to the source character', () => {
    const original = 'x\uFB01y'; // the "fi" ligature expands to two chars
    const { text, map } = foldWithMap(original);
    expect(text).toBe('xfiy');
    expect(map).toEqual([0, 1, 1, 2, 3]);
  });
});
