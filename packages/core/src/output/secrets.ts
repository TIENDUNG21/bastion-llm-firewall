/**
 * Credentials in model output: provider key formats, JWTs, PEM private keys,
 * credentials in URLs, secret-looking assignments and generic high-entropy
 * tokens. Format rules are precise and get high confidence; the entropy rule
 * is a safety net and gets low confidence.
 */
import { decodeBase64 } from '../normalize/decoders.js';
import { foldWithMap } from '../normalize/fold.js';
import { characterClasses, shannonEntropy } from './entropy.js';
import { resolveOverlaps } from './redact.js';
import type { Confidence, SecretKind, Span } from './types.js';

interface SecretRule {
  kind: SecretKind;
  label: string;
  /** Must carry the `g` flag; with `d` and a capture group, only group 1 is reported. */
  pattern: RegExp;
  confidence: Confidence;
  validate?: (value: string) => boolean;
}

function jwtHeaderOk(token: string): boolean {
  const header = decodeBase64(token.split('.')[0] ?? '');
  if (header === null) return false;
  try {
    const parsed: unknown = JSON.parse(header);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { alg?: unknown }).alg === 'string'
    );
  } catch {
    return false;
  }
}

const PLACEHOLDER =
  /^(?:<.*>|\$\{.*\}|\{\{.*\}\}|%.*%|x+|\*+|\.+|changeme|change_me|password\d*|secret|example\w*|your[_-].*|placeholder|redacted|null|none|undefined|true|false)$/i;

function assignedValueOk(value: string): boolean {
  if (PLACEHOLDER.test(value)) return false;
  return shannonEntropy(value) >= 3 && characterClasses(value) >= 2;
}

function highEntropyOk(value: string): boolean {
  if (/^[0-9a-f-]+$/i.test(value)) return false; // hashes and UUIDs
  if (!/\d/.test(value) || !/[A-Za-z]/.test(value)) return false;
  return shannonEntropy(value) >= 4;
}

const PEM_TYPE = '(?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?';
const NAME =
  '[A-Za-z0-9_.-]{0,30}(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret)[A-Za-z0-9_.-]{0,30}';

const RULES: readonly SecretRule[] = [
  {
    kind: 'aws-access-key',
    label: 'AWS access key ID',
    pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g,
    confidence: 'high',
  },
  {
    kind: 'github-token',
    label: 'GitHub token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{60,255})\b/g,
    confidence: 'high',
  },
  {
    kind: 'slack-token',
    label: 'Slack token',
    pattern:
      /\bxox[abposr]-[A-Za-z0-9-]{10,250}|https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]{20,}/g,
    confidence: 'high',
  },
  {
    kind: 'stripe-key',
    label: 'Stripe secret key',
    pattern: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,99}\b/g,
    confidence: 'high',
  },
  {
    kind: 'google-api-key',
    label: 'Google API key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g,
    confidence: 'high',
  },
  {
    kind: 'api-key',
    label: 'API key with an sk- prefix',
    pattern: /\bsk-(?:[a-z]{2,10}-)?[A-Za-z0-9_-]{20,}/g,
    confidence: 'medium',
    validate: (v) => shannonEntropy(v) >= 3.5,
  },
  {
    kind: 'jwt',
    label: 'JSON Web Token',
    pattern: /\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{8,}/g,
    confidence: 'high',
    validate: jwtHeaderOk,
  },
  {
    kind: 'private-key',
    label: 'PEM private key',
    pattern: new RegExp(
      `-----BEGIN ${PEM_TYPE}-----[\\s\\S]{0,10000}?-----END ${PEM_TYPE}-----`,
      'g',
    ),
    confidence: 'high',
  },
  {
    kind: 'private-key',
    label: 'PEM private key header (block cut off)',
    pattern: new RegExp(`-----BEGIN ${PEM_TYPE}-----`, 'g'),
    confidence: 'medium',
  },
  {
    kind: 'url-credentials',
    label: 'password embedded in a URL',
    pattern: /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s:/@]{1,64}:[^\s@/]{3,128}@[^\s/]+/gi,
    confidence: 'high',
  },
  {
    kind: 'assigned-secret',
    label: 'value assigned to a secret-looking name',
    pattern: new RegExp(`(?<![A-Za-z0-9])${NAME}["']?\\s*[:=]\\s*["']?([^\\s"',;]{8,128})`, 'gid'),
    confidence: 'medium',
    validate: assignedValueOk,
  },
  {
    kind: 'high-entropy',
    label: 'high-entropy token',
    pattern: /(?<![A-Za-z0-9+/_=-])[A-Za-z0-9+/_=-]{32,512}(?![A-Za-z0-9+/_=-])/g,
    confidence: 'low',
    validate: highEntropyOk,
  },
];

/** Finds credentials, one span per secret (overlapping matches keep the most specific rule). */
export function findSecrets(text: string): Span[] {
  const { text: folded, map } = foldWithMap(text);
  const spans: Span[] = [];
  for (const rule of RULES) {
    for (const m of folded.matchAll(rule.pattern)) {
      const group = m.indices?.[1];
      const [s, e] = group ?? [m.index, m.index + m[0].length];
      const raw = folded.slice(s, e);
      if (rule.validate && !rule.validate(raw)) continue;
      const start = map[s] as number;
      const end = map[e] as number;
      spans.push({
        kind: rule.kind,
        category: 'secret',
        start,
        end,
        value: text.slice(start, end),
        confidence: rule.confidence,
        detail: rule.label,
      });
    }
  }
  return resolveOverlaps(spans);
}
