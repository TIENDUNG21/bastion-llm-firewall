/**
 * L2-regularised logistic regression trained with AdaGrad SGD on sparse
 * vectors. Written from scratch so the same code trains in Node and the
 * trained weights load anywhere.
 */
import type { Label } from '../eval/metrics.js';
import { mulberry32, shuffle } from '../util/random.js';
import type { SparseVector } from './features.js';

export interface TrainOptions {
  dim: number;
  epochs: number;
  learningRate: number;
  /** L2 penalty, applied lazily to the features active in each example. */
  l2: number;
  seed: number;
  /** Weight classes inversely to their frequency (default true). */
  balanced?: boolean;
}

export interface TrainedLogistic {
  weights: Float64Array;
  bias: number;
  /** Mean (class-weighted) log-loss of each epoch, measured during the pass. */
  losses: number[];
}

export function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

const EPS = 1e-12;

export function logit(p: number): number {
  const q = Math.min(1 - EPS, Math.max(EPS, p));
  return Math.log(q / (1 - q));
}

export function predictLogit(weights: ArrayLike<number>, bias: number, x: SparseVector): number {
  let z = bias;
  for (let k = 0; k < x.indices.length; k++) {
    z += (weights[x.indices[k] as number] ?? 0) * (x.values[k] as number);
  }
  return z;
}

export function trainLogistic(
  xs: readonly SparseVector[],
  ys: readonly Label[],
  opts: TrainOptions,
): TrainedLogistic {
  if (xs.length !== ys.length) throw new Error('xs and ys must have the same length');
  const positives = ys.filter((y) => y === 1).length;
  const negatives = ys.length - positives;
  if (positives === 0 || negatives === 0)
    throw new Error('training data must contain both classes');

  const balanced = opts.balanced ?? true;
  const classWeight = {
    1: balanced ? ys.length / (2 * positives) : 1,
    0: balanced ? ys.length / (2 * negatives) : 1,
  };
  const weights = new Float64Array(opts.dim);
  const g2 = new Float64Array(opts.dim);
  let bias = 0;
  let biasG2 = 0;
  const losses: number[] = [];
  const random = mulberry32(opts.seed);
  const order = ys.map((_, i) => i);

  for (let epoch = 0; epoch < opts.epochs; epoch++) {
    let loss = 0;
    for (const i of shuffle(order, random)) {
      const x = xs[i] as SparseVector;
      const y = ys[i] as Label;
      const p = sigmoid(predictLogit(weights, bias, x));
      const cw = classWeight[y];
      loss -= cw * (y === 1 ? Math.log(Math.max(p, EPS)) : Math.log(Math.max(1 - p, EPS)));
      const g = cw * (p - y);
      for (let k = 0; k < x.indices.length; k++) {
        const j = x.indices[k] as number;
        const grad = g * (x.values[k] as number) + opts.l2 * (weights[j] as number);
        g2[j] = (g2[j] as number) + grad * grad;
        weights[j] =
          (weights[j] as number) - (opts.learningRate * grad) / (Math.sqrt(g2[j] as number) + 1e-8);
      }
      biasG2 += g * g;
      bias -= (opts.learningRate * g) / (Math.sqrt(biasG2) + 1e-8);
    }
    losses.push(loss / ys.length);
  }
  return { weights, bias, losses };
}
