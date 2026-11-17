import { describe, expect, it } from 'vitest';
import { redact, resolveOverlaps } from '../../src/output/redact.js';
import { scanOutput } from '../../src/output/scan-output.js';
import type { Span } from '../../src/output/types.js';

const span = (
  kind: Span['kind'],
  start: number,
  end: number,
  value: string,
  confidence: Span['confidence'] = 'high',
): Span => ({
  kind,
  category: kind === 'email' || kind === 'phone' || kind === 'card' ? 'pii' : 'secret',
  start,
  end,
  value,
  confidence,
  detail: '',
});

describe('resolveOverlaps', () => {
  it('keeps the stronger of two overlapping spans and every disjoint span', () => {
    const spans = [
      span('high-entropy', 0, 30, 'x', 'low'),
      span('stripe-key', 5, 30, 'y'),
      span('email', 40, 50, 'z'),
    ];
    expect(resolveOverlaps(spans).map((s) => s.kind)).toEqual(['stripe-key', 'email']);
  });
});

describe('redact', () => {
  const text = 'Mail an.nguyen@example.com or call 0912 345 678, card 4111 1111 1111 1111.';
  const scan = scanOutput(text);
  const spans = [...scan.pii, ...scan.secrets];

  it('replaces spans with labels', () => {
    expect(redact(text, spans)).toBe('Mail [EMAIL] or call [PHONE], card [CARD].');
  });

  it('masks spans while keeping a hint of the value', () => {
    expect(redact(text, spans, 'mask')).toBe(
      'Mail a********@example.com or call **** *** 678, card **** **** **** 1111.',
    );
  });

  it('returns the text unchanged when there is nothing to redact', () => {
    expect(redact('hello', [])).toBe('hello');
  });
});

describe('scanOutput', () => {
  it('collects PII, secrets, canary hits and prompt leakage in one pass', () => {
    const token = 'bst-00112233aabbccdd';
    const system =
      'You are a cooking assistant. Only answer questions about Vietnamese recipes and nothing else.';
    const r = scanOutput(
      `Email me at chef@example.vn. ${token}. Rules: only answer questions about Vietnamese recipes and nothing else.`,
      { canaries: [token], systemPrompt: system },
    );
    expect(r.pii.map((s) => s.kind)).toEqual(['email']);
    expect(r.canaries).toHaveLength(1);
    expect(r.leak?.leaked).toBe(true);
  });

  it('only reports the requested PII kinds', () => {
    expect(scanOutput('0912345678 a@b.co', { piiKinds: ['email'] }).pii.map((s) => s.kind)).toEqual(
      ['email'],
    );
  });
});
