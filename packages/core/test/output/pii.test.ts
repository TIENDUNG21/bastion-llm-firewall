import { describe, expect, it } from 'vitest';
import { cardBrand, luhnValid } from '../../src/output/luhn.js';
import { findPii } from '../../src/output/pii.js';

const kinds = (text: string) => findPii(text).map((s) => [s.kind, s.value]);

describe('luhnValid', () => {
  it('accepts valid test card numbers and rejects a changed digit', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(luhnValid('5555555555554444')).toBe(true);
    expect(luhnValid('378282246310005')).toBe(true);
    expect(luhnValid('4111111111111112')).toBe(false);
  });

  it('rejects non-digits and empty input', () => {
    expect(luhnValid('')).toBe(false);
    expect(luhnValid('4111-1111')).toBe(false);
  });
});

describe('cardBrand', () => {
  it('recognises major networks and the Vietnamese NAPAS range', () => {
    expect(cardBrand('4111111111111111')).toBe('Visa');
    expect(cardBrand('5555555555554444')).toBe('Mastercard');
    expect(cardBrand('378282246310005')).toBe('American Express');
    expect(cardBrand('9704000000000018')).toBe('NAPAS');
    expect(cardBrand('1234567812345670')).toBeNull();
  });
});

describe('findPii: e-mail', () => {
  it('finds plain and bracket-obfuscated addresses', () => {
    expect(kinds('mail dung.nguyen+test@example.com.vn now')).toEqual([
      ['email', 'dung.nguyen+test@example.com.vn'],
    ]);
    expect(kinds('write to alice [at] example [dot] org')).toEqual([
      ['email', 'alice [at] example [dot] org'],
    ]);
  });

  it('finds an address split by a zero-width space and reports original offsets', () => {
    const text = 'contact: bob\u200B@mail.example.com';
    const [span] = findPii(text);
    expect(span?.kind).toBe('email');
    expect(text.slice(span?.start, span?.end)).toBe('bob\u200B@mail.example.com');
  });
});

describe('findPii: Vietnamese phone numbers', () => {
  it.each([
    '0912345678',
    '0912 345 678',
    '091.234.5678',
    '+84 912 345 678',
    '+84912345678',
    '(+84) 386-123-456',
    '0084 912 345 678',
    '84912345678',
    '028 3822 1234',
    '0236.3822.123',
  ])('finds %s', (number) => {
    expect(kinds(`goi ${number} nhe`)).toEqual([['phone', number]]);
  });

  it.each(['0112345678', '091234567', '09123456789', '0412345678'])(
    'rejects %s (bad prefix or length)',
    (number) => {
      expect(findPii(`ma ${number}`).filter((s) => s.kind === 'phone')).toEqual([]);
    },
  );

  it('finds fullwidth digits', () => {
    expect(findPii('\uFF10\uFF19\uFF11\uFF12\uFF13\uFF14\uFF15\uFF16\uFF17\uFF18')[0]?.kind).toBe(
      'phone',
    );
  });
});

describe('findPii: international phone numbers', () => {
  it('finds E.164-style numbers with a + prefix', () => {
    expect(kinds('call +1 415 555 2671')).toEqual([['phone', '+1 415 555 2671']]);
    expect(kinds('call +44 20 7946 0958')).toEqual([['phone', '+44 20 7946 0958']]);
  });

  it('ignores plain numbers without a + prefix', () => {
    expect(kinds('order 4155552671 shipped')).toEqual([]);
  });
});

describe('findPii: cards', () => {
  it('finds Luhn-valid card numbers with spaces or dashes', () => {
    expect(kinds('card 4111 1111 1111 1111 exp 12/29')).toEqual([['card', '4111 1111 1111 1111']]);
    expect(kinds('card 5555-5555-5555-4444')).toEqual([['card', '5555-5555-5555-4444']]);
    expect(findPii('napas 9704 0000 0000 0018')[0]?.detail).toMatch(/NAPAS/);
  });

  it('ignores numbers that fail the Luhn check', () => {
    expect(kinds('card 4111 1111 1111 1112')).toEqual([]);
  });
});

describe('findPii: other kinds', () => {
  it('finds IPv4 addresses and marks private ranges as low confidence', () => {
    const spans = findPii('from 203.0.113.9 via 192.168.1.10', ['ipv4']);
    expect(spans.map((s) => [s.value, s.confidence])).toEqual([
      ['203.0.113.9', 'medium'],
      ['192.168.1.10', 'low'],
    ]);
  });

  it('finds Vietnamese citizen ID numbers with a valid province code', () => {
    const spans = findPii('So CCCD: 001099012345', ['vn-citizen-id']);
    expect(spans[0]).toMatchObject({ kind: 'vn-citizen-id', confidence: 'high' });
    expect(findPii('ref 003099012345', ['vn-citizen-id'])).toEqual([]);
  });

  it('limits results to the requested kinds', () => {
    const text = 'a@b.co 0912345678';
    expect(findPii(text, ['phone']).map((s) => s.kind)).toEqual(['phone']);
  });

  it('returns nothing for empty or ordinary text', () => {
    expect(findPii('')).toEqual([]);
    expect(findPii('Version 2.0 shipped in 2024 with 15 fixes.')).toEqual([]);
  });

  it('stays fast on long digit runs', () => {
    const t0 = performance.now();
    findPii('1'.repeat(50_000) + ' ' + '1 '.repeat(20_000));
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
