import type { Action, InputDecision, OutputDecision } from '@bastion/core';

const CODES = { red: 31, yellow: 33, green: 32, dim: 2, bold: 1 } as const;
type Style = keyof typeof CODES;

export type Paint = (text: string, style: Style) => string;

export function painter(color: boolean): Paint {
  return (text, style) => (color ? `\u001b[${CODES[style]}m${text}\u001b[0m` : text);
}

const ACTION_STYLE: Readonly<Record<Action, Style>> = {
  allow: 'green',
  flag: 'yellow',
  redact: 'yellow',
  block: 'red',
};

function badge(action: Action, paint: Paint): string {
  return paint(action.toUpperCase(), ACTION_STYLE[action]);
}

const pad = (s: string, n: number) => s.padEnd(n);

export function formatInput(d: InputDecision, paint: Paint): string {
  const ml = d.classifierScore === null ? 'off' : d.classifierScore.toFixed(2);
  const lines = [
    `${paint('INPUT', 'bold')}  ${badge(d.action, paint)}  score ${d.score.toFixed(2)}  (rules ${d.heuristicScore.toFixed(2)}, classifier ${ml})  route ${d.route}`,
  ];
  for (const f of d.findings) {
    lines.push(`  ${pad(f.detector, 22)}${f.score.toFixed(2)}  ${f.message}`);
    for (const e of f.evidence.slice(0, 3)) {
      lines.push(paint(`  ${' '.repeat(22)}      matched "${e.match}" (${e.view})`, 'dim'));
    }
  }
  if (d.signals.length > 0) {
    lines.push(
      paint(`  evasion: ${d.signals.map((s) => `${s.kind} (${s.count})`).join(', ')}`, 'dim'),
    );
  }
  if (d.contributions.length > 0) {
    const terms = d.contributions
      .slice(0, 6)
      .map((c) => `${c.weight >= 0 ? '+' : '-'}${c.term}`)
      .join(' ');
    lines.push(paint(`  classifier terms: ${terms}`, 'dim'));
  }
  return `${lines.join('\n')}\n`;
}

export function formatOutput(d: OutputDecision, paint: Paint): string {
  const lines = [`${paint('OUTPUT', 'bold')}  ${badge(d.action, paint)}  route ${d.route}`];
  for (const f of d.findings) {
    const value = f.span ? `  "${f.span.value}"` : '';
    lines.push(`  ${pad(f.type, 12)}${pad(f.action, 8)}${f.message}${value}`);
  }
  if (d.action === 'redact') lines.push('', paint('redacted:', 'dim'), d.text);
  return `${lines.join('\n')}\n`;
}
