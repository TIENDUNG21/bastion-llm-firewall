export type PiiKind = 'email' | 'phone' | 'card' | 'ipv4' | 'vn-citizen-id';

export type SecretKind =
  | 'aws-access-key'
  | 'github-token'
  | 'slack-token'
  | 'stripe-key'
  | 'google-api-key'
  | 'api-key'
  | 'jwt'
  | 'private-key'
  | 'url-credentials'
  | 'assigned-secret'
  | 'high-entropy';

export type Confidence = 'high' | 'medium' | 'low';

/** A sensitive value found in text. Offsets are UTF-16 indices into the original string. */
export interface Span {
  kind: PiiKind | SecretKind;
  category: 'pii' | 'secret';
  start: number;
  end: number;
  value: string;
  confidence: Confidence;
  detail: string;
}

export const ALL_PII_KINDS: readonly PiiKind[] = [
  'email',
  'phone',
  'card',
  'ipv4',
  'vn-citizen-id',
];
