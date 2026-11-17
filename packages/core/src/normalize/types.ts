/** Where a view's text came from. */
export type ViewSource =
  'primary' | 'unicode-tags' | 'base64' | 'hex' | 'escapes' | 'rot13' | 'reversed';

/** One readable version of the input. Detectors run on every view. */
export interface NormalizedView {
  source: ViewSource;
  /** NFC text with invisible characters removed (case and accents kept). */
  text: string;
  /** Lowercase, accent-free, de-confused, de-leeted text used for matching. */
  skeleton: string;
  /** 0 for the primary view; n for a payload decoded from a depth n-1 view. */
  depth: number;
}

export type EvasionKind =
  | 'invisible-chars'
  | 'unicode-tags'
  | 'confusables'
  | 'mixed-script'
  | 'leetspeak'
  | 'spaced-letters'
  | 'encoded-payload'
  | 'truncated';

/** Evidence that the input tried to hide something from a keyword filter. */
export interface EvasionSignal {
  kind: EvasionKind;
  count: number;
  detail: string;
}

export interface NormalizedInput {
  original: string;
  views: NormalizedView[];
  signals: EvasionSignal[];
}

export interface NormalizeOptions {
  /** Inputs longer than this many UTF-16 units are truncated (default 100 000). */
  maxLength?: number;
  /** Maximum decoding depth for nested payloads (default 3). */
  maxDepth?: number;
  /** Maximum number of views, primary included (default 16). */
  maxViews?: number;
}
