import type { NormalizedInput, ViewSource } from '../normalize/types.js';

/** Families of prompt-injection technique. */
export type Category =
  | 'instruction-override'
  | 'role-play'
  | 'delimiter-injection'
  | 'tool-smuggling'
  | 'prompt-extraction'
  | 'obfuscation';

/** Where and why a rule matched. `index` is an offset into the view's skeleton. */
export interface Evidence {
  view: ViewSource;
  rule: string;
  match: string;
  index: number;
}

/** One detector's verdict. `score` is in [0, 1]; 0.5 is the default flag line. */
export interface Finding {
  detector: string;
  category: Category;
  score: number;
  message: string;
  evidence: Evidence[];
}

export interface InputDetector {
  id: string;
  category: Category;
  description: string;
  /** `prior` holds findings from detectors that ran earlier in the same pass. */
  detect(input: NormalizedInput, prior: readonly Finding[]): Finding | null;
}

/**
 * A single regular expression over the skeleton (lowercase, accent-free,
 * de-confused text). `weight` is the probability-like score the rule adds.
 */
export interface PatternRule {
  id: string;
  pattern: RegExp;
  weight: number;
  explain: string;
}

export interface HeuristicResult {
  score: number;
  findings: Finding[];
}
