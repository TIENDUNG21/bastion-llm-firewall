/**
 * Canary tokens: a random marker placed in the system prompt. The model has
 * no reason to ever repeat it, so seeing it in an answer proves the system
 * prompt leaked, even when the attacker asked for it spaced out, reversed or
 * base64-encoded.
 */
import { findBase64Payloads } from '../normalize/decoders.js';
import { foldWithMap } from '../normalize/fold.js';

export type CanaryVariant = 'exact' | 'folded' | 'separated' | 'reversed' | 'base64';

export interface CanaryHit {
  token: string;
  variant: CanaryVariant;
  /** Offsets into the original output; -1 when the token was only found after decoding. */
  start: number;
  end: number;
}

interface RandomSource {
  getRandomValues(array: Uint8Array): Uint8Array;
}

function secureRandom(): RandomSource {
  const source = (globalThis as { crypto?: Partial<RandomSource> }).crypto;
  if (typeof source?.getRandomValues !== 'function') {
    throw new Error('no secure random source (globalThis.crypto.getRandomValues) available');
  }
  return source as RandomSource;
}

/** Creates `<prefix>-<16 hex chars>` from 8 cryptographically random bytes. */
export function createCanary(prefix = 'bst'): string {
  if (!/^[A-Za-z0-9_]{1,16}$/.test(prefix)) {
    throw new Error('canary prefix must be 1-16 letters, digits or underscores');
  }
  const bytes = secureRandom().getRandomValues(new Uint8Array(8));
  return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Appends the canary to a system prompt as an inert marker. */
export function embedCanary(systemPrompt: string, token: string): string {
  return `${systemPrompt}\n\n<!-- ${token} -->`;
}

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Looks for each token in the output: exact, case/Unicode-folded, separator-stripped, reversed, base64. */
export function findCanaryLeaks(output: string, tokens: readonly string[]): CanaryHit[] {
  const hits: CanaryHit[] = [];
  if (tokens.length === 0) return hits;
  const folded = foldWithMap(output);
  const lower = folded.text.toLowerCase();
  const kept: number[] = [];
  let stripped = '';
  for (let i = 0; i < lower.length; i++) {
    const c = lower[i] as string;
    if (/[a-z0-9]/.test(c)) {
      stripped += c;
      kept.push(i);
    }
  }
  const strippedReversed = [...stripped].reverse().join('');
  let decoded: string[] | null = null;

  for (const token of tokens) {
    const exact = output.indexOf(token);
    if (exact >= 0) {
      hits.push({ token, variant: 'exact', start: exact, end: exact + token.length });
      continue;
    }
    const f = lower.indexOf(token.toLowerCase());
    if (f >= 0) {
      const start = folded.map[f] as number;
      const end = folded.map[f + token.length] as number;
      hits.push({ token, variant: 'folded', start, end });
      continue;
    }
    const needle = alnum(token);
    if (needle.length === 0) continue;
    const s = stripped.indexOf(needle);
    if (s >= 0) {
      const start = folded.map[kept[s] as number] as number;
      const end = folded.map[(kept[s + needle.length - 1] as number) + 1] as number;
      hits.push({ token, variant: 'separated', start, end });
      continue;
    }
    if (strippedReversed.includes(needle)) {
      hits.push({ token, variant: 'reversed', start: -1, end: -1 });
      continue;
    }
    decoded ??= findBase64Payloads(output);
    if (decoded.some((d) => alnum(d).includes(needle))) {
      hits.push({ token, variant: 'base64', start: -1, end: -1 });
    }
  }
  return hits;
}
