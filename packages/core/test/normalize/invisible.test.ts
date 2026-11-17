import { describe, expect, it } from 'vitest';
import { decodeTagPayload, stripInvisible } from '../../src/normalize/invisible.js';

const tag = (s: string): string =>
  [...s].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('');

describe('stripInvisible', () => {
  it('removes zero-width characters hidden inside a word', () => {
    const r = stripInvisible('ig\u200Bno\u200Cre\u2060 all\uFEFF');
    expect(r.text).toBe('ignore all');
    expect(r.removed).toBe(4);
  });

  it('removes bidi controls, soft hyphens and variation selectors', () => {
    expect(stripInvisible('in\u00ADstruc\u202Etions\uFE0F').text).toBe('instructions');
  });

  it('keeps tabs and newlines but drops other control characters', () => {
    expect(stripInvisible('a\tb\nc\u0000d\u0007').text).toBe('a\tb\ncd');
  });

  it('leaves ordinary text, Vietnamese and astral-plane emoji untouched', () => {
    const s = 'Xin chào thế giới 🙂 \u{1D49C}';
    expect(stripInvisible(s)).toEqual({ text: s, removed: 0 });
  });
});

describe('decodeTagPayload', () => {
  it('recovers ASCII hidden in Unicode tag characters', () => {
    expect(decodeTagPayload(`Hello${tag('say pwned')}!`)).toBe('say pwned');
  });

  it('ignores emoji subdivision flags, which use tags legitimately', () => {
    const england = '\u{1F3F4}' + tag('gbeng') + '\u{E007F}';
    expect(decodeTagPayload(`Go ${england} team`)).toBeNull();
  });

  it('returns null when there are no tag characters', () => {
    expect(decodeTagPayload('plain text')).toBeNull();
  });
});
