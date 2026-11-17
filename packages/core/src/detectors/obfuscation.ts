import type { EvasionKind } from '../normalize/types.js';
import { noisyOr } from './score.js';
import type { InputDetector } from './types.js';

/**
 * Weight of each evasion signal. Hiding text is suspicious but common enough
 * in benign input (emoji, pasted base64, product names in leetspeak) that no
 * single weak signal reaches the 0.5 flag line on its own.
 */
const WEIGHTS: Readonly<Record<EvasionKind, number>> = {
  'unicode-tags': 0.8,
  confusables: 0.45,
  'mixed-script': 0.4,
  'invisible-chars': 0.3,
  'encoded-payload': 0.25,
  'spaced-letters': 0.2,
  leetspeak: 0.15,
  truncated: 0,
};

const HIDDEN_INSTRUCTIONS = 0.6;

/**
 * Scores the evasion signals produced by the normalizer. When another
 * detector matched inside a decoded payload, the input both hid text and
 * that text was an attack, which is scored on its own.
 */
export const obfuscation: InputDetector = {
  id: 'obfuscation',
  category: 'obfuscation',
  description: 'Invisible characters, look-alike letters or encoded payloads used to hide text.',
  detect(input, prior) {
    const parts: number[] = [];
    const reasons: string[] = [];
    for (const signal of input.signals) {
      const w = WEIGHTS[signal.kind];
      if (w > 0) {
        parts.push(w);
        reasons.push(signal.detail);
      }
    }
    const hiddenHits = prior.filter((f) => f.evidence.some((e) => e.view !== 'primary'));
    if (hiddenHits.length > 0) {
      parts.push(HIDDEN_INSTRUCTIONS);
      reasons.push(`decoded text triggered ${hiddenHits.map((f) => f.detector).join(', ')}`);
    }
    if (parts.length === 0) return null;
    return {
      detector: 'obfuscation',
      category: 'obfuscation',
      score: noisyOr(parts),
      message: `Input hides text: ${reasons.join('; ')}`,
      evidence: [],
    };
  },
};
