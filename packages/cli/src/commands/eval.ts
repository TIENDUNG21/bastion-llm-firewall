import { evaluateScores } from '@bastion/core';
import type { ScoreEvaluation } from '@bastion/core';
import { parse } from '../args.js';
import { loadFirewall, readText } from '../common.js';
import { parseLabeledData } from '../data.js';
import { CliError } from '../io.js';
import type { Io } from '../io.js';

export const EVAL_HELP = `Usage: bastion eval <data.jsonl|data.csv> [options]

Measures the firewall on your own labelled prompts. Each row needs a text and
a label (1/0, true/false, injection/benign or jailbreak/benign).

Options:
  --text-field <name>    text column or key (default text)
  --label-field <name>   label column or key (default label)
  --threshold <n>        decision threshold in [0, 1] (default 0.5)
  --policy <file.json>   policy configuration (route /)
  --json                 print the results as JSON
`;

const MODES = ['heuristics', 'classifier', 'combined'] as const;

function summary(e: ScoreEvaluation) {
  const r = (v: number) => Number(v.toFixed(4));
  return {
    precision: r(e.metrics.precision),
    recall: r(e.metrics.recall),
    f1: r(e.metrics.f1),
    accuracy: r(e.metrics.accuracy),
    fpr: r(e.metrics.fpr),
    rocAuc: Number.isNaN(e.auc) ? null : r(e.auc),
    confusion: e.confusion,
  };
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`.padStart(7);

export async function evalCommand(argv: string[], io: Io): Promise<number> {
  const { values, positionals } = parse(argv, {
    'text-field': { type: 'string' },
    'label-field': { type: 'string' },
    threshold: { type: 'string' },
    policy: { type: 'string' },
    json: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  });
  if (values.help) {
    io.stdout(EVAL_HELP);
    return 0;
  }
  const file = positionals[0];
  if (file === undefined) throw new CliError('eval needs a data file (JSONL or CSV)');
  const threshold = values.threshold === undefined ? 0.5 : Number(values.threshold);
  if (!(threshold >= 0 && threshold <= 1))
    throw new CliError('--threshold must be a number in [0, 1]');

  const rows = parseLabeledData(await readText(io, file), file, {
    ...(values['text-field'] !== undefined ? { textField: values['text-field'] } : {}),
    ...(values['label-field'] !== undefined ? { labelField: values['label-field'] } : {}),
  });
  const firewall = await loadFirewall(io, values.policy);
  const scores = {
    heuristics: [] as number[],
    classifier: [] as number[],
    combined: [] as number[],
  };
  for (const row of rows) {
    const d = firewall.inspectInput(row.text);
    scores.heuristics.push(d.heuristicScore);
    scores.classifier.push(d.classifierScore ?? 0);
    scores.combined.push(d.score);
  }
  const labels = rows.map((r) => r.label);
  const results = Object.fromEntries(
    MODES.map((m) => [m, summary(evaluateScores(labels, scores[m], threshold))]),
  ) as Record<(typeof MODES)[number], ReturnType<typeof summary>>;
  const injection = labels.filter((l) => l === 1).length;

  if (values.json) {
    io.stdout(
      `${JSON.stringify({ file, rows: rows.length, injection, benign: rows.length - injection, threshold, results }, null, 2)}\n`,
    );
    return 0;
  }
  const lines = [
    `${file}: ${rows.length} rows (${injection} injection, ${rows.length - injection} benign), threshold ${threshold}`,
    '',
    `${'mode'.padEnd(12)}${'precision'.padStart(10)}${'recall'.padStart(8)}${'F1'.padStart(8)}${'FPR'.padStart(8)}${'ROC-AUC'.padStart(9)}   TP  FP  TN  FN`,
  ];
  for (const m of MODES) {
    const r = results[m];
    const c = r.confusion;
    lines.push(
      `${m.padEnd(12)}${pct(r.precision).padStart(10)}${pct(r.recall).padStart(8)}${pct(r.f1).padStart(8)}${pct(r.fpr).padStart(8)}${(r.rocAuc === null ? 'n/a' : r.rocAuc.toFixed(3)).padStart(9)}  ${[c.tp, c.fp, c.tn, c.fn].map((n) => String(n).padStart(3)).join(' ')}`,
    );
  }
  io.stdout(`${lines.join('\n')}\n`);
  return 0;
}
