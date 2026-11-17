/**
 * Trains the prompt-injection classifier and writes
 * packages/core/src/classifier/model.json.
 *
 *   npm run fetch-data && npm run train
 *
 * Hyper-parameters and the decision threshold are chosen on the validation
 * split (a seeded slice of the training part). The test split is not read
 * here; only scripts/evaluate.ts touches it.
 */
import { writeFile } from 'node:fs/promises';
import { DEFAULT_FEATURES, vectorize } from '../packages/core/src/classifier/features.js';
import type { SparseVector } from '../packages/core/src/classifier/features.js';
import { predictLogit, sigmoid, trainLogistic } from '../packages/core/src/classifier/logistic.js';
import type { TrainedLogistic } from '../packages/core/src/classifier/logistic.js';
import type { ClassifierModel } from '../packages/core/src/classifier/model.js';
import { evaluateScores, rocAuc } from '../packages/core/src/eval/metrics.js';
import type { Label } from '../packages/core/src/eval/metrics.js';
import { skeleton } from '../packages/core/src/normalize/index.js';
import { countByLabel, loadSplits } from './lib/data.js';
import { SPLIT } from './lib/datasets.js';

const MODEL_PATH = 'packages/core/src/classifier/model.json';
const TRAIN_SEED = 7;
const MAX_WEIGHTS = 24_000;
const GRID = {
  learningRate: [0.05, 0.2],
  l2: [1e-6, 1e-5, 1e-4],
  epochs: [10, 25],
};

function scoresFor(
  model: { weights: ArrayLike<number>; bias: number },
  xs: SparseVector[],
): number[] {
  return xs.map((x) => sigmoid(predictLogit(model.weights, model.bias, x)));
}

/** Threshold with the best F1 on the given scores (ties: the higher threshold). */
function bestThreshold(labels: Label[], scores: number[]): { threshold: number; f1: number } {
  const candidates = [...new Set(scores)].sort((a, b) => a - b);
  let best = { threshold: 0.5, f1: -1 };
  for (const t of candidates) {
    const f1 = evaluateScores(labels, scores, t).metrics.f1;
    if (f1 >= best.f1) best = { threshold: t, f1 };
  }
  return best;
}

/** Keeps the largest weights and rounds them to 4 decimals. */
function prune(weights: Float64Array): { indices: number[]; values: number[] } {
  const order = [...weights.keys()]
    .filter((i) => Math.abs(weights[i] as number) >= 5e-5)
    .sort((a, b) => Math.abs(weights[b] as number) - Math.abs(weights[a] as number))
    .slice(0, MAX_WEIGHTS)
    .sort((a, b) => a - b);
  return {
    indices: order,
    values: order.map((i) => Math.round((weights[i] as number) * 1e4) / 1e4),
  };
}

async function main(): Promise<void> {
  const t0 = performance.now();
  const data = await loadSplits();
  const cfg = DEFAULT_FEATURES;
  const featurize = (rows: { text: string }[]) => rows.map((r) => vectorize(skeleton(r.text), cfg));
  const fitX = featurize(data.fit);
  const fitY = data.fit.map((r) => r.label);
  const valX = featurize(data.validation);
  const valY = data.validation.map((r) => r.label);
  console.log(
    `rows: fit ${data.fit.length}, validation ${data.validation.length} (test ${data.test.length} held out)`,
  );

  let best: {
    auc: number;
    params: { learningRate: number; l2: number; epochs: number };
    model: TrainedLogistic;
  } | null = null;
  for (const learningRate of GRID.learningRate) {
    for (const l2 of GRID.l2) {
      for (const epochs of GRID.epochs) {
        const model = trainLogistic(fitX, fitY, {
          dim: cfg.dim,
          epochs,
          learningRate,
          l2,
          seed: TRAIN_SEED,
        });
        const auc = rocAuc(valY, scoresFor(model, valX));
        console.log(
          `lr=${learningRate} l2=${l2} epochs=${epochs} validation AUC=${auc.toFixed(4)}`,
        );
        if (best === null || auc > best.auc)
          best = { auc, params: { learningRate, l2, epochs }, model };
      }
    }
  }
  if (best === null) throw new Error('empty grid');

  const weights = prune(best.model.weights);
  const bias = Math.round(best.model.bias * 1e4) / 1e4;
  const dense = new Float64Array(cfg.dim);
  weights.indices.forEach((i, k) => (dense[i] = weights.values[k] as number));
  const valScores = scoresFor({ weights: dense, bias }, valX);
  const { threshold, f1 } = bestThreshold(valY, valScores);
  const roundedThreshold = Math.round(threshold * 1e4) / 1e4;

  const model: ClassifierModel = {
    format: 'bastion-logreg',
    version: 1,
    features: cfg,
    bias,
    threshold: roundedThreshold,
    weights,
    training: {
      script: 'scripts/train.ts',
      datasets: data.manifests.map((m) => ({ id: m.id, revision: m.revision, license: m.license })),
      split: { ...SPLIT },
      rows: {
        fit: countByLabel(data.fit),
        validation: countByLabel(data.validation),
        test: countByLabel(data.test),
      },
      seed: TRAIN_SEED,
      hyperparameters: { ...best.params, optimizer: 'adagrad', classWeight: 'balanced' },
      validation: { auc: Number(rocAuc(valY, valScores).toFixed(4)), f1: Number(f1.toFixed(4)) },
      storedWeights: weights.indices.length,
    },
  };
  await writeFile(MODEL_PATH, JSON.stringify(model) + '\n', 'utf8');
  console.log(
    `best ${JSON.stringify(best.params)}; threshold ${roundedThreshold}; validation F1 ${f1.toFixed(4)}; ` +
      `${weights.indices.length} weights; ${((performance.now() - t0) / 1000).toFixed(1)} s`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
