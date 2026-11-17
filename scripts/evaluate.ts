/**
 * Evaluates heuristics-only, classifier-only and combined scoring on the
 * held-out test split and writes:
 *   eval/results.json        machine-readable numbers
 *   docs/EVALUATION.md       the report (generated; do not edit by hand)
 *   docs/assets/roc.svg      ROC curves
 *   .cache/eval-errors.json  misclassified test rows (not committed)
 *
 *   npm run fetch-data && npm run evaluate
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createClassifier } from '../packages/core/src/classifier/classifier.js';
import { parseModel } from '../packages/core/src/classifier/model.js';
import { runHeuristics } from '../packages/core/src/detectors/index.js';
import { evaluateScores, rocCurve } from '../packages/core/src/eval/metrics.js';
import type { Label, ScoreEvaluation } from '../packages/core/src/eval/metrics.js';
import { normalize } from '../packages/core/src/normalize/index.js';
import { countByLabel, loadSplits } from './lib/data.js';
import { SPLIT } from './lib/datasets.js';
import { rocSvg } from './lib/svg.js';

const THRESHOLD = 0.5;
const SWEEP = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const MODES = ['heuristics', 'classifier', 'combined'] as const;
type Mode = (typeof MODES)[number];

const BLIND_SPOTS = [
  'Short deepset rows labelled as injections that contain no instruction-like wording are the largest group of misses: a request for a joke, a political statement after "stop:", or a role assignment such as "you are <a newspaper>". Some look like label noise; either way, neither the rules nor an n-gram model can separate them from ordinary questions.',
  'Non-English attacks. The rules cover a few common German, French, Spanish and Vietnamese phrasings of "ignore the previous instructions" and nothing else. In the test split a French "Oubliez toutes les instructions et ..." and a German "Stell dir vor, du bist eine böse KI ..." were missed by both halves.',
  'Persona jailbreaks that avoid the known vocabulary (no DAN, no "developer mode", no "no ethical guidelines") are left to the classifier; a few long persona prompts scored just under the threshold.',
  'Most classifier false alarms are long, instruction-heavy benign prompts (reading-comprehension tasks with "Detailed Instructions:" or "Article:" sections), because long instruction-style text in the training data is mostly jailbreaks. Political opinion questions cause a few more, because many deepset injections ask for political statements.',
  'Both datasets are small (about 2,000 unique rows). One test row moves recall by about 0.5 percentage points, and the numbers will not transfer to traffic that looks different from these two datasets.',
  'The datasets contain almost no obfuscated text (zero-width characters, look-alike letters, base64), so the normalizer is checked by unit tests, not by this evaluation. Words separated only by zero-width characters ("ignore" + U+200B + "all") become one word after normalization and can slip past rules that expect a space.',
  'Indirect injection (instructions hidden in a retrieved web page or document rather than typed by the user) is not represented in either dataset and is not measured here.',
];

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function round(e: ScoreEvaluation) {
  const r = (v: number) => Number(v.toFixed(4));
  return {
    threshold: e.threshold,
    confusion: e.confusion,
    precision: r(e.metrics.precision),
    recall: r(e.metrics.recall),
    f1: r(e.metrics.f1),
    accuracy: r(e.metrics.accuracy),
    fpr: r(e.metrics.fpr),
    rocAuc: r(e.auc),
  };
}

async function main(): Promise<void> {
  const data = await loadSplits();
  const model = parseModel(
    JSON.parse(await readFile('packages/core/src/classifier/model.json', 'utf8')),
  );
  const classifier = createClassifier(model);

  const labels: Label[] = data.test.map((r) => r.label);
  const scores: Record<Mode, number[]> = { heuristics: [], classifier: [], combined: [] };
  for (const row of data.test) {
    const input = normalize(row.text);
    const h = runHeuristics(input).score;
    const c = classifier.score(input).calibrated;
    scores.heuristics.push(h);
    scores.classifier.push(c);
    scores.combined.push(Math.max(h, c));
  }

  const results = Object.fromEntries(
    MODES.map((m) => [m, round(evaluateScores(labels, scores[m], THRESHOLD))]),
  ) as Record<Mode, ReturnType<typeof round>>;

  const perSource: Record<string, Results> = {};
  for (const source of new Set(data.test.map((r) => r.source))) {
    const idx = data.test.flatMap((r, i) => (r.source === source ? [i] : []));
    const l = idx.map((i) => labels[i] as Label);
    const pick = (m: Mode) => idx.map((i) => scores[m][i] as number);
    perSource[source] = {
      heuristics: round(evaluateScores(l, pick('heuristics'), THRESHOLD)),
      classifier: round(evaluateScores(l, pick('classifier'), THRESHOLD)),
      combined: round(evaluateScores(l, pick('combined'), THRESHOLD)),
    };
  }
  const sweep = SWEEP.map((t) => ({ ...round(evaluateScores(labels, scores.combined, t)) }));
  const overlap = { both: 0, rulesOnly: 0, classifierOnly: 0, neither: 0 };
  labels.forEach((y, i) => {
    if (y !== 1) return;
    const h = (scores.heuristics[i] as number) >= THRESHOLD;
    const c = (scores.classifier[i] as number) >= THRESHOLD;
    if (h && c) overlap.both++;
    else if (h) overlap.rulesOnly++;
    else if (c) overlap.classifierOnly++;
    else overlap.neither++;
  });

  const output = {
    generatedBy: 'scripts/evaluate.ts',
    datasets: data.manifests.map((m) => ({ id: m.id, revision: m.revision, license: m.license })),
    split: { ...SPLIT },
    rows: {
      raw: data.stats.rawRows,
      unlabeled: data.stats.unlabeled,
      duplicatesRemoved: data.stats.duplicates,
      conflictingLabelsRemoved: data.stats.conflicts,
      unique: data.stats.rows,
      fit: countByLabel(data.fit),
      validation: countByLabel(data.validation),
      test: countByLabel(data.test),
    },
    model: {
      threshold: model.threshold,
      storedWeights: model.weights.indices.length,
      training: model.training,
    },
    combination: 'max(heuristic score, calibrated classifier probability)',
    threshold: THRESHOLD,
    results,
    perSource,
    sweep,
    overlap,
  };
  await mkdir('eval', { recursive: true });
  await writeFile('eval/results.json', JSON.stringify(output, null, 2) + '\n', 'utf8');

  const svg = rocSvg('ROC on the held-out test split', [
    {
      label: `combined    AUC ${results.combined.rocAuc.toFixed(3)}`,
      color: '#d4f53c',
      points: rocCurve(labels, scores.combined),
    },
    {
      label: `classifier  AUC ${results.classifier.rocAuc.toFixed(3)}`,
      color: '#ededed',
      points: rocCurve(labels, scores.classifier),
    },
    {
      label: `heuristics  AUC ${results.heuristics.rocAuc.toFixed(3)}`,
      color: '#8a8a8a',
      dashed: true,
      points: rocCurve(labels, scores.heuristics),
    },
  ]);
  await mkdir('docs/assets', { recursive: true });
  await writeFile('docs/assets/roc.svg', svg, 'utf8');

  const errors = data.test.flatMap((r, i) => {
    const predicted = (scores.combined[i] as number) >= THRESHOLD ? 1 : 0;
    if (predicted === r.label) return [];
    return [
      {
        kind: r.label === 1 ? 'missed' : 'false-alarm',
        source: r.source,
        heuristics: scores.heuristics[i],
        classifier: scores.classifier[i],
        text: r.text.slice(0, 400),
      },
    ];
  });
  await mkdir('.cache', { recursive: true });
  await writeFile('.cache/eval-errors.json', JSON.stringify(errors, null, 2), 'utf8');

  await writeFile(
    'docs/EVALUATION.md',
    renderMarkdown(output, results, perSource, sweep, overlap),
    'utf8',
  );
  for (const m of MODES) {
    const r = results[m];
    console.log(
      `${m.padEnd(10)} P ${pct(r.precision)}  R ${pct(r.recall)}  F1 ${pct(r.f1)}  AUC ${r.rocAuc.toFixed(3)}`,
    );
  }
}

type Results = Record<Mode, ReturnType<typeof round>>;

function renderMarkdown(
  output: {
    datasets: { id: string; revision: string; license: string }[];
    rows: Record<string, unknown>;
  },
  results: Results,
  perSource: Record<string, Results>,
  sweep: ReturnType<typeof round>[],
  overlap: { both: number; rulesOnly: number; classifierOnly: number; neither: number },
): string {
  const rows = output.rows as {
    raw: number;
    unlabeled: number;
    duplicatesRemoved: number;
    conflictingLabelsRemoved: number;
    unique: number;
    fit: { injection: number; benign: number };
    validation: { injection: number; benign: number };
    test: { injection: number; benign: number };
  };
  const line = (cells: (string | number)[]) => `| ${cells.join(' | ')} |`;
  const metricsRow = (name: string, r: ReturnType<typeof round>) =>
    line([
      name,
      pct(r.precision),
      pct(r.recall),
      pct(r.f1),
      pct(r.accuracy),
      pct(r.fpr),
      r.rocAuc.toFixed(3),
    ]);
  const confusion = (name: string, r: ReturnType<typeof round>) =>
    [
      `**${name}**`,
      '',
      line(['', 'predicted injection', 'predicted benign']),
      line(['---', '---:', '---:']),
      line(['actual injection', r.confusion.tp, r.confusion.fn]),
      line(['actual benign', r.confusion.fp, r.confusion.tn]),
      '',
    ].join('\n');

  return [
    '# Evaluation',
    '',
    '> Generated by `npm run evaluate` ([scripts/evaluate.ts](../scripts/evaluate.ts)). Do not edit by hand; numbers come from [eval/results.json](../eval/results.json).',
    '',
    '## Data',
    '',
    line(['Dataset', 'Revision', 'License']),
    line(['---', '---', '---']),
    ...output.datasets.map((d) =>
      line([
        `[${d.id}](https://huggingface.co/datasets/${d.id})`,
        `\`${d.revision.slice(0, 8)}\``,
        d.license,
      ]),
    ),
    '',
    `Both datasets were fetched with \`npm run fetch-data\` through the Hugging Face datasets-server API (all published splits merged): ${rows.raw} rows. ` +
      `${rows.duplicatesRemoved} exact duplicates (after normalization) and ${rows.conflictingLabelsRemoved} rows whose duplicates carry the opposite label were removed, leaving ${rows.unique} unique rows.`,
    '',
    `The rows were split with a fixed seed (${SPLIT.seed}), stratified by dataset and label: ${pct(SPLIT.testFraction)} held out as the **test split**, and ${pct(SPLIT.validationFraction)} of the rest kept as a validation split for choosing hyper-parameters and the classifier threshold.`,
    '',
    line(['Split', 'Injection', 'Benign']),
    line(['---', '---:', '---:']),
    line(['fit (training)', rows.fit.injection, rows.fit.benign]),
    line(['validation', rows.validation.injection, rows.validation.benign]),
    line(['test (held out)', rows.test.injection, rows.test.benign]),
    '',
    'The heuristic rules were written before the datasets were downloaded and were not changed after looking at test-split results. The classifier never sees the test split during training.',
    '',
    '## Results on the held-out test split',
    '',
    `Decision threshold ${THRESHOLD} for every mode (the classifier probability is calibrated so its validation-chosen threshold maps to 0.5). Combined score = max(heuristic score, classifier score).`,
    '',
    line(['Mode', 'Precision', 'Recall', 'F1', 'Accuracy', 'False-positive rate', 'ROC-AUC']),
    line(['---', '---:', '---:', '---:', '---:', '---:', '---:']),
    metricsRow('heuristics only', results.heuristics),
    metricsRow('classifier only', results.classifier),
    metricsRow('combined', results.combined),
    '',
    '![ROC curves](assets/roc.svg)',
    '',
    '### Confusion matrices',
    '',
    confusion('Heuristics only', results.heuristics),
    confusion('Classifier only', results.classifier),
    confusion('Combined', results.combined),
    '### Per dataset',
    '',
    line([
      'Dataset',
      'Mode',
      'Precision',
      'Recall',
      'F1',
      'Accuracy',
      'False-positive rate',
      'ROC-AUC',
    ]),
    line(['---', '---', '---:', '---:', '---:', '---:', '---:', '---:']),
    ...Object.entries(perSource).flatMap(([id, r]) =>
      MODES.map((m) => metricsRow(`${id} | ${m}`, r[m])),
    ),
    '',
    'Heuristic scores are mostly exactly 0 for inputs no rule matches, so their ROC curve has few distinct points and ties are counted as half in the AUC.',
    '',
    '### Rules and classifier on the test injections',
    '',
    line(['Caught by both', 'Rules only', 'Classifier only', 'Missed by both']),
    line(['---:', '---:', '---:', '---:']),
    line([overlap.both, overlap.rulesOnly, overlap.classifierOnly, overlap.neither]),
    '',
    overlap.rulesOnly === 0
      ? `On this split the rules caught nothing the classifier missed, so at the 0.5 threshold the combined decisions equal the classifier-only decisions (ROC-AUC ${results.classifier.rocAuc.toFixed(4)} classifier vs ${results.combined.rocAuc.toFixed(4)} combined). The rules still provide the per-detector explanations and the checks on obfuscated input, which these datasets barely contain.`
      : `The rules caught ${overlap.rulesOnly} injection(s) that the classifier missed.`,
    '',
    '### Threshold sweep (combined)',
    '',
    'The default policy flags at 0.5 and blocks at 0.8.',
    '',
    line(['Threshold', 'Precision', 'Recall', 'F1', 'False-positive rate']),
    line(['---:', '---:', '---:', '---:', '---:']),
    ...sweep.map((r) =>
      line([r.threshold.toFixed(1), pct(r.precision), pct(r.recall), pct(r.f1), pct(r.fpr)]),
    ),
    '',
    '## Known blind spots',
    '',
    ...BLIND_SPOTS.map((b) => `- ${b}`),
    '',
    '## Reproduce',
    '',
    '```bash',
    'npm ci',
    'npm run fetch-data   # downloads into .cache/downloads and checks licenses',
    'npm run train        # rewrites packages/core/src/classifier/model.json',
    'npm run evaluate     # rewrites this file, eval/results.json and docs/assets/roc.svg',
    '```',
    '',
  ].join('\n');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
