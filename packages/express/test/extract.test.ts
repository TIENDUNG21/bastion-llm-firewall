import { describe, expect, it } from 'vitest';
import { defaultExtract } from '../src/extract.js';

describe('defaultExtract', () => {
  it('reads the common single-prompt fields', () => {
    expect(
      defaultExtract({
        prompt: 'a',
        message: 'b',
        input: 'c',
        query: 'd',
        question: 'e',
        text: 'f',
        other: 'x',
      }),
    ).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('ignores a message field that is not a string', () => {
    expect(defaultExtract({ message: { role: 'user', content: 'hi' } })).toEqual([]);
  });

  it('reads user and tool messages, including content parts, and skips system and assistant turns', () => {
    const body = {
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'first question' },
        { role: 'assistant', content: 'an answer' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'part one' },
            { type: 'image_url', image_url: {} },
          ],
        },
        { role: 'tool', content: 'search result text' },
      ],
    };
    expect(defaultExtract(body)).toEqual(['first question', 'part one', 'search result text']);
  });

  it('returns nothing for bodies it does not understand', () => {
    for (const body of [undefined, null, 42, [], { messages: 'nope' }, { messages: [null, 3] }]) {
      expect(defaultExtract(body)).toEqual([]);
    }
  });

  it('treats a plain-text body as the prompt', () => {
    expect(defaultExtract('just text')).toEqual(['just text']);
  });

  it('skips empty strings', () => {
    expect(defaultExtract({ prompt: '   ' })).toEqual([]);
    expect(defaultExtract('')).toEqual([]);
  });
});
