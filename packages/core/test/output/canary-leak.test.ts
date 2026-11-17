import { describe, expect, it } from 'vitest';
import { createCanary, embedCanary, findCanaryLeaks } from '../../src/output/canary.js';
import { detectPromptLeak } from '../../src/output/leak.js';

describe('createCanary', () => {
  it('creates unique prefixed tokens with 64 bits of randomness', () => {
    const a = createCanary();
    const b = createCanary();
    expect(a).toMatch(/^bst-[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
    expect(createCanary('acme')).toMatch(/^acme-[0-9a-f]{16}$/);
  });

  it('rejects prefixes that would make the token hard to match', () => {
    expect(() => createCanary('has space')).toThrow(/prefix/);
  });
});

describe('embedCanary', () => {
  it('appends the token to the system prompt', () => {
    const prompt = embedCanary('You are a helpful bot.', 'bst-0123456789abcdef');
    expect(prompt.startsWith('You are a helpful bot.')).toBe(true);
    expect(prompt).toContain('bst-0123456789abcdef');
  });
});

describe('findCanaryLeaks', () => {
  const token = 'bst-0123456789abcdef';

  it('finds the exact token with its offsets', () => {
    const out = `My instructions say ${token}.`;
    const [hit] = findCanaryLeaks(out, [token]);
    expect(hit).toMatchObject({ token, variant: 'exact' });
    expect(out.slice(hit?.start, hit?.end)).toBe(token);
  });

  it('finds the token when its letters are spaced out or split by zero-width characters', () => {
    expect(findCanaryLeaks('b s t - 0 1 2 3 4 5 6 7 8 9 a b c d e f', [token])[0]?.variant).toBe(
      'separated',
    );
    expect(findCanaryLeaks('bst-0123\u200B456789ABCDEF', [token])[0]?.variant).toBe('folded');
  });

  it('finds the token inside base64 and reversed', () => {
    const b64 = Buffer.from(`secret marker ${token} end`, 'utf8').toString('base64');
    expect(findCanaryLeaks(`here: ${b64}`, [token])[0]?.variant).toBe('base64');
    expect(findCanaryLeaks([...token].reverse().join(''), [token])[0]?.variant).toBe('reversed');
  });

  it('returns nothing when the token is absent or the list is empty', () => {
    expect(findCanaryLeaks('nothing to see', [token])).toEqual([]);
    expect(findCanaryLeaks(token, [])).toEqual([]);
  });
});

describe('detectPromptLeak', () => {
  const system =
    'You are the support assistant for Hanoi Rail. Never discuss ticket refunds before checking the booking code. Always answer in Vietnamese unless the user writes in English.';

  it('detects verbatim reproduction of the system prompt', () => {
    const leak = detectPromptLeak(
      `Sure! My instructions: never discuss ticket refunds before checking the booking code. Always answer in Vietnamese unless the user writes in English.`,
      system,
    );
    expect(leak.leaked).toBe(true);
    expect(leak.coverage).toBeGreaterThan(0.4);
    expect(leak.sample.length).toBeGreaterThan(0);
  });

  it('ignores an answer that only shares a few words', () => {
    const leak = detectPromptLeak('The booking code is on your ticket.', system);
    expect(leak.leaked).toBe(false);
    expect(leak.coverage).toBe(0);
  });

  it('handles a very short system prompt', () => {
    expect(detectPromptLeak('you are a pirate captain', 'You are a pirate captain').leaked).toBe(
      true,
    );
    expect(detectPromptLeak('hello', '').leaked).toBe(false);
  });
});
