import type { RedactionStyle } from '../output/redact.js';
import type { Confidence, PiiKind } from '../output/types.js';

/** What to do with a finding. Precedence: block > redact > flag > allow. */
export type Action = 'allow' | 'flag' | 'redact' | 'block';
export type InputAction = 'allow' | 'flag' | 'block';

export interface InputPolicy {
  /** Risk score at which input is flagged (allowed, but marked). */
  flagAt: number;
  /** Risk score at which input is blocked. */
  blockAt: number;
  /** Use the ML classifier in addition to the rules. */
  classifier: boolean;
  /** Per-detector switches by id; detectors not listed stay on. */
  detectors: Record<string, boolean>;
  /** Longer input is truncated before scanning (a signal is recorded). */
  maxLength: number;
}

export interface OutputPolicy {
  pii: Action;
  secrets: Action;
  canary: Action;
  promptLeak: Action;
  piiKinds: PiiKind[];
  /** Findings below this confidence are ignored. */
  minConfidence: Confidence;
  redaction: RedactionStyle;
}

export interface Policy {
  input: InputPolicy;
  output: OutputPolicy;
}

export interface PartialPolicy {
  input?: Partial<InputPolicy>;
  output?: Partial<OutputPolicy>;
}

export interface RoutePolicy {
  /** Path pattern: exact (`/api/chat`), `*` = one segment, `**` = any depth. */
  match: string;
  policy: PartialPolicy;
}

export interface PolicyConfig {
  default?: PartialPolicy;
  routes?: RoutePolicy[];
}

/** Built-in policy. Frozen: resolvePolicy always returns new objects when anything differs. */
export const DEFAULT_POLICY: Policy = deepFreeze({
  input: {
    flagAt: 0.5,
    blockAt: 0.8,
    classifier: true,
    detectors: {},
    maxLength: 100_000,
  },
  output: {
    pii: 'redact',
    secrets: 'block',
    canary: 'block',
    promptLeak: 'block',
    piiKinds: ['email', 'phone', 'card', 'vn-citizen-id'],
    minConfidence: 'medium',
    redaction: 'label',
  },
});

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}
