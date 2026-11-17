/**
 * Personal data in model output: e-mail addresses, phone numbers (with
 * Vietnamese formats), payment cards (Luhn-checked), IPv4 addresses and
 * Vietnamese citizen ID numbers. Matching runs on an offset-preserving fold
 * of the text, so zero-width characters and fullwidth digits do not hide a
 * value, and spans always point into the original string.
 */
import { foldWithMap } from '../normalize/fold.js';
import { cardBrand, luhnValid } from './luhn.js';
import { ALL_PII_KINDS } from './types.js';
import type { Confidence, PiiKind, Span } from './types.js';

interface Candidate {
  kind: PiiKind;
  start: number;
  end: number;
  confidence: Confidence;
  detail: string;
}

type Finder = (text: string) => Candidate[];

function matches(text: string, re: RegExp): RegExpExecArray[] {
  return [...text.matchAll(re)];
}

const EMAIL =
  /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}(?![A-Za-z0-9-])/g;
const EMAIL_OBFUSCATED =
  /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64} ?[[({]at[\])}] ?[A-Za-z0-9-]{1,63} ?[[({]dot[\])}] ?[A-Za-z]{2,24}\b/gi;

const findEmails: Finder = (text) => [
  ...matches(text, EMAIL).map((m) => ({
    kind: 'email' as const,
    start: m.index,
    end: m.index + m[0].length,
    confidence: 'high' as const,
    detail: 'e-mail address',
  })),
  ...matches(text, EMAIL_OBFUSCATED).map((m) => ({
    kind: 'email' as const,
    start: m.index,
    end: m.index + m[0].length,
    confidence: 'medium' as const,
    detail: 'e-mail address written with [at] / [dot]',
  })),
];

const SEP = '[\\s.\\-]?';
const VN_PREFIX = `(?:\\(?(?:\\+|00)84\\)?${SEP}|84${SEP}|0)`;
/** Mobile: 03x, 05x, 07x, 08x, 09x + 7 digits. Landline: 02x(x) area code, 11 digits in total. */
const VN_MOBILE = new RegExp(
  `(?<![\\d+])${VN_PREFIX}(?:3[2-9]|5[25689]|7[06789]|8[1-9]|9\\d)(?:${SEP}\\d){7}(?!\\d)`,
  'g',
);
const VN_LANDLINE = new RegExp(`(?<![\\d+])${VN_PREFIX}2(?:${SEP}\\d){9}(?!\\d)`, 'g');
const INTERNATIONAL = /(?<![\w+])\+[1-9][\d\s.\-()]{6,20}\d(?!\d)/g;

const findPhones: Finder = (text) => {
  const out: Candidate[] = [];
  for (const m of matches(text, VN_MOBILE)) {
    out.push({
      kind: 'phone',
      start: m.index,
      end: m.index + m[0].length,
      confidence: 'high',
      detail: 'Vietnamese mobile number',
    });
  }
  for (const m of matches(text, VN_LANDLINE)) {
    out.push({
      kind: 'phone',
      start: m.index,
      end: m.index + m[0].length,
      confidence: 'high',
      detail: 'Vietnamese landline number',
    });
  }
  for (const m of matches(text, INTERNATIONAL)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.startsWith('84') || digits.length < 8 || digits.length > 15) continue;
    if (/[\s.\-()]{2}/.test(m[0])) continue;
    out.push({
      kind: 'phone',
      start: m.index,
      end: m.index + m[0].length,
      confidence: 'medium',
      detail: 'international phone number',
    });
  }
  return out;
};

/** 13-19 contiguous digits, or groups of four with one consistent separator, or Amex 4-6-5. */
const CARD =
  /(?<![\d-])(?:\d{13,19}|\d{4}([ -])\d{4}\1\d{4}(?:\1\d{4})?(?:\1\d{1,3})?|\d{4}([ -])\d{6}\2\d{4,5})(?!\d)/g;

const findCards: Finder = (text) =>
  matches(text, CARD).flatMap((m) => {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) return [];
    const brand = cardBrand(digits);
    return [
      {
        kind: 'card' as const,
        start: m.index,
        end: m.index + m[0].length,
        confidence: brand ? ('high' as const) : ('medium' as const),
        detail: brand ? `${brand} card number (Luhn valid)` : 'Luhn-valid card-like number',
      },
    ];
  });

const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4 = new RegExp(`(?<![\\d.])(?:${OCTET}\\.){3}${OCTET}(?![\\d.]*\\d)`, 'g');

function isPrivateIp(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number) as [number, number];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

const findIps: Finder = (text) =>
  matches(text, IPV4).map((m) => ({
    kind: 'ipv4' as const,
    start: m.index,
    end: m.index + m[0].length,
    confidence: isPrivateIp(m[0]) ? ('low' as const) : ('medium' as const),
    detail: isPrivateIp(m[0]) ? 'private IPv4 address' : 'IPv4 address',
  }));

/** Province and city codes that open a 12-digit citizen ID (CCCD), per the 63 pre-2025 provinces. */
// prettier-ignore
const VN_PROVINCES = new Set([
  '001', '002', '004', '006', '008', '010', '011', '012', '014', '015', '017', '019', '020', '022',
  '024', '025', '026', '027', '030', '031', '033', '034', '035', '036', '037', '038', '040', '042',
  '044', '045', '046', '048', '049', '051', '052', '054', '056', '058', '060', '062', '064', '066',
  '067', '068', '070', '072', '074', '075', '077', '079', '080', '082', '083', '084', '086', '087',
  '089', '091', '092', '093', '094', '095', '096',
]);
const CITIZEN_ID = /(?<!\d)0\d{11}(?!\d)/g;
const CITIZEN_CONTEXT =
  /(?:cccd|cmnd|can cuoc|căn cước|citizen id|national id|id number|dinh danh|định danh)/i;

const findCitizenIds: Finder = (text) =>
  matches(text, CITIZEN_ID).flatMap((m) => {
    if (!VN_PROVINCES.has(m[0].slice(0, 3))) return [];
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    const context = CITIZEN_CONTEXT.test(before);
    return [
      {
        kind: 'vn-citizen-id' as const,
        start: m.index,
        end: m.index + m[0].length,
        confidence: context ? ('high' as const) : ('medium' as const),
        detail: 'Vietnamese citizen ID number (format check only)',
      },
    ];
  });

const FINDERS: Readonly<Record<PiiKind, Finder>> = {
  email: findEmails,
  phone: findPhones,
  card: findCards,
  ipv4: findIps,
  'vn-citizen-id': findCitizenIds,
};

/** Finds personal data of the given kinds (all kinds by default), ordered by position. */
export function findPii(text: string, kinds: readonly PiiKind[] = ALL_PII_KINDS): Span[] {
  const { text: folded, map } = foldWithMap(text);
  const spans: Span[] = [];
  const taken: [number, number][] = [];
  for (const kind of kinds) {
    for (const c of FINDERS[kind](folded)) {
      if (taken.some(([s, e]) => c.start < e && s < c.end)) continue;
      taken.push([c.start, c.end]);
      const start = map[c.start] as number;
      const end = map[c.end] as number;
      spans.push({
        kind: c.kind,
        category: 'pii',
        start,
        end,
        value: text.slice(start, end),
        confidence: c.confidence,
        detail: c.detail,
      });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}
