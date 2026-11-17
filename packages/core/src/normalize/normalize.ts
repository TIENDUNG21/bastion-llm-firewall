import { toWellFormed, truncateSafe } from '../util/text.js';
import {
  findBase64Payloads,
  findEscapedPayloads,
  findHexPayloads,
  findReversedSegments,
  findRot13Segments,
} from './decoders.js';
import { decodeTagPayload, isInvisible } from './invisible.js';
import { skeleton, skeletonWithStats } from './skeleton.js';
import type {
  EvasionSignal,
  NormalizedInput,
  NormalizedView,
  NormalizeOptions,
  ViewSource,
} from './types.js';

const DEFAULTS = { maxLength: 100_000, maxDepth: 3, maxViews: 16 } as const;

const DECODERS: readonly (readonly [ViewSource, (text: string) => string[]])[] = [
  ['base64', findBase64Payloads],
  ['hex', findHexPayloads],
  ['escapes', findEscapedPayloads],
  ['rot13', findRot13Segments],
  ['reversed', findReversedSegments],
];

const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const EMOJI_JOINERS = new Set([0x200d, 0xfe0e, 0xfe0f]);

/**
 * Counts invisible characters that are not explained by legitimate use:
 * emoji joiners and presentation selectors next to a pictograph, a leading
 * byte order mark, and tag characters (reported separately) are ignored.
 */
function countSuspiciousInvisible(text: string): number {
  const chars = [...text];
  let n = 0;
  for (let i = 0; i < chars.length; i++) {
    const cp = (chars[i] as string).codePointAt(0) as number;
    if (!isInvisible(cp)) continue;
    if (cp >= 0xe0000 && cp <= 0xe007f) continue;
    if (cp === 0xfeff && i === 0) continue;
    if (EMOJI_JOINERS.has(cp)) {
      const near = (chars[i - 1] ?? '') + (chars[i + 1] ?? '');
      if (PICTOGRAPHIC.test(near)) continue;
    }
    n++;
  }
  return n;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Turns raw input into one or more readable views plus evasion signals.
 * The primary view is always first; decoded payloads follow in breadth-first
 * order, bounded by `maxDepth` and `maxViews`.
 */
export function normalize(input: string, options: NormalizeOptions = {}): NormalizedInput {
  const maxLength = options.maxLength ?? DEFAULTS.maxLength;
  const maxDepth = options.maxDepth ?? DEFAULTS.maxDepth;
  const maxViews = Math.max(1, options.maxViews ?? DEFAULTS.maxViews);
  const signals: EvasionSignal[] = [];

  let raw = toWellFormed(input);
  if (raw.length > maxLength) {
    const cut = truncateSafe(raw, maxLength);
    signals.push({
      kind: 'truncated',
      count: raw.length - cut.length,
      detail: `input truncated to ${cut.length} characters`,
    });
    raw = cut;
  }

  const invisible = countSuspiciousInvisible(raw);
  if (invisible > 0) {
    signals.push({
      kind: 'invisible-chars',
      count: invisible,
      detail: `${plural(invisible, 'invisible character')} removed`,
    });
  }

  const primaryText = [...raw]
    .filter((ch) => !isInvisible(ch.codePointAt(0) as number))
    .join('')
    .normalize('NFC');
  const primary = skeletonWithStats(primaryText);
  const { stats } = primary;
  if (stats.disguisedWords > 0) {
    signals.push({
      kind: 'confusables',
      count: stats.disguisedWords,
      detail: `${plural(stats.disguisedWords, 'word')} spelled with look-alike letters`,
    });
  }
  if (stats.mixedScriptWords > 0) {
    signals.push({
      kind: 'mixed-script',
      count: stats.mixedScriptWords,
      detail: `${plural(stats.mixedScriptWords, 'word')} mixing Latin with another script`,
    });
  }
  if (stats.leetTokens > 0) {
    signals.push({
      kind: 'leetspeak',
      count: stats.leetTokens,
      detail: `${plural(stats.leetTokens, 'token')} decoded from leetspeak`,
    });
  }
  if (stats.spacedRuns > 0) {
    signals.push({
      kind: 'spaced-letters',
      count: stats.spacedRuns,
      detail: `${plural(stats.spacedRuns, 'word')} written with spaced-out letters`,
    });
  }

  const views: NormalizedView[] = [
    { source: 'primary', text: primaryText, skeleton: primary.skeleton, depth: 0 },
  ];
  const seen = new Set<string>([primaryText]);
  const add = (source: ViewSource, text: string, depth: number): void => {
    const clean = text.normalize('NFC');
    if (views.length >= maxViews || seen.has(clean)) return;
    seen.add(clean);
    views.push({ source, text: clean, skeleton: skeleton(clean), depth });
  };

  const tags = decodeTagPayload(raw);
  if (tags !== null) {
    signals.push({
      kind: 'unicode-tags',
      count: tags.length,
      detail: `${plural(tags.length, 'character')} hidden in Unicode tag characters`,
    });
    add('unicode-tags', tags, 1);
  }

  for (let i = 0; i < views.length && views.length < maxViews; i++) {
    const view = views[i] as NormalizedView;
    if (view.depth >= maxDepth) continue;
    for (const [source, decode] of DECODERS) {
      for (const payload of decode(view.text)) add(source, payload, view.depth + 1);
    }
  }

  const decoded = views.filter((v) => v.source !== 'primary' && v.source !== 'unicode-tags');
  if (decoded.length > 0) {
    const sources = [...new Set(decoded.map((v) => v.source))].join(', ');
    signals.push({
      kind: 'encoded-payload',
      count: decoded.length,
      detail: `${plural(decoded.length, 'payload')} decoded (${sources})`,
    });
  }

  return { original: input, views, signals };
}
