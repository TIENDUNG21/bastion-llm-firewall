/** Leetspeak and letter-spacing tricks ("1gn0r3", "i g n o r e"). */

const LEET: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
};

const RUN = /[A-Za-z0-9@$]+/g;
const SYMBOLS = new Set(['@', '$']);

export interface RewriteResult {
  text: string;
  /** How many tokens were rewritten. */
  count: number;
}

/**
 * Decodes leetspeak inside tokens that contain at least two ASCII letters,
 * so numbers ("2024", "$45") are never touched. `@` and `$` are only mapped
 * between two alphanumerics, never at the edge of a token.
 */
export function decodeLeet(text: string): RewriteResult {
  let count = 0;
  const out = text.replace(RUN, (run) => {
    const letters = run.match(/[A-Za-z]/g)?.length ?? 0;
    if (letters < 2 || letters === run.length) return run;
    let mapped = '';
    for (let i = 0; i < run.length; i++) {
      const ch = run[i] as string;
      const to = LEET[ch];
      const edge = i === 0 || i === run.length - 1;
      mapped += to !== undefined && !(SYMBOLS.has(ch) && edge) ? to : ch;
    }
    if (mapped !== run) count++;
    return mapped;
  });
  return { text: out, count };
}

const SPACED = /(?<![\p{L}\p{N}])\p{L}(?:[ .\-_*]\p{L}){2,}(?![\p{L}\p{N}])/gu;

/** Joins three or more single letters separated by one space, dot, dash, underscore or star. */
export function collapseSpacedLetters(text: string): RewriteResult {
  let count = 0;
  const out = text.replace(SPACED, (m) => {
    count++;
    return m.replace(/[ .\-_*]/g, '');
  });
  return { text: out, count };
}
