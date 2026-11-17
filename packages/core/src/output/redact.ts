import type { Confidence, Span } from './types.js';

const RANK: Readonly<Record<Confidence, number>> = { high: 3, medium: 2, low: 1 };

/**
 * Removes overlapping spans: stronger confidence wins, then the longer span.
 * The result is ordered by position.
 */
export function resolveOverlaps(spans: readonly Span[]): Span[] {
  const ranked = [...spans].sort(
    (a, b) =>
      RANK[b.confidence] - RANK[a.confidence] ||
      b.end - b.start - (a.end - a.start) ||
      a.start - b.start,
  );
  const kept: Span[] = [];
  for (const s of ranked) {
    if (!kept.some((k) => s.start < k.end && k.start < s.end)) kept.push(s);
  }
  return kept.sort((a, b) => a.start - b.start);
}

export type RedactionStyle = 'label' | 'mask';

function label(span: Span): string {
  if (span.category === 'pii') return `[${span.kind.toUpperCase().replace(/-/g, '_')}]`;
  return `[SECRET:${span.kind.toUpperCase().replace(/-/g, '_')}]`;
}

/** Replaces every alphanumeric character except the last `keep` digits with '*'. */
function maskDigits(value: string, keep: number): string {
  let seen = 0;
  const total = (value.match(/\d/g) ?? []).length;
  return value.replace(/[A-Za-z0-9]/g, (c) => {
    if (!/\d/.test(c)) return '*';
    seen++;
    return seen > total - keep ? c : '*';
  });
}

function mask(span: Span): string {
  const v = span.value;
  switch (span.kind) {
    case 'email': {
      const at = v.indexOf('@');
      return at > 0 ? `${v[0] as string}${'*'.repeat(at - 1)}${v.slice(at)}` : '*'.repeat(v.length);
    }
    case 'card':
      return maskDigits(v, 4);
    case 'phone':
      return maskDigits(v, 3);
    case 'ipv4':
      return v.replace(/\d+$/, '***');
    default:
      return span.category === 'secret' && v.length > 8
        ? `${v.slice(0, 4)}${'*'.repeat(8)}`
        : '*'.repeat(v.length);
  }
}

/**
 * Rewrites `text` with each span replaced by a label (`[EMAIL]`,
 * `[SECRET:JWT]`) or a mask that keeps a hint of the value (last card digits).
 */
export function redact(
  text: string,
  spans: readonly Span[],
  style: RedactionStyle = 'label',
): string {
  let out = text;
  for (const span of resolveOverlaps(spans).reverse()) {
    const replacement = style === 'label' ? label(span) : mask(span);
    out = out.slice(0, span.start) + replacement + out.slice(span.end);
  }
  return out;
}
