/** Binary-classification metrics. Label 1 = injection (positive class). */

export type Label = 0 | 1;

export interface Confusion {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

export interface BinaryMetrics {
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  /** False-positive rate: share of benign inputs that were flagged. */
  fpr: number;
}

export interface RocPoint {
  fpr: number;
  tpr: number;
  threshold: number;
}

export interface ScoreEvaluation {
  threshold: number;
  confusion: Confusion;
  metrics: BinaryMetrics;
  auc: number;
}

function sameLength(a: readonly unknown[], b: readonly unknown[]): void {
  if (a.length !== b.length) throw new Error('labels and predictions must have the same length');
}

export function confusionMatrix(
  labels: readonly Label[],
  predictions: readonly Label[],
): Confusion {
  sameLength(labels, predictions);
  const c: Confusion = { tp: 0, fp: 0, tn: 0, fn: 0 };
  labels.forEach((y, i) => {
    const p = predictions[i];
    if (y === 1) {
      if (p === 1) c.tp++;
      else c.fn++;
    } else if (p === 1) c.fp++;
    else c.tn++;
  });
  return c;
}

const ratio = (a: number, b: number): number => (b === 0 ? 0 : a / b);

export function binaryMetrics(c: Confusion): BinaryMetrics {
  const precision = ratio(c.tp, c.tp + c.fp);
  const recall = ratio(c.tp, c.tp + c.fn);
  return {
    precision,
    recall,
    f1: ratio(2 * precision * recall, precision + recall),
    accuracy: ratio(c.tp + c.tn, c.tp + c.tn + c.fp + c.fn),
    fpr: ratio(c.fp, c.fp + c.tn),
  };
}

/**
 * Area under the ROC curve via the Mann-Whitney U statistic: the probability
 * that a random positive scores above a random negative, ties counting half.
 * Returns NaN when either class is absent.
 */
export function rocAuc(labels: readonly Label[], scores: readonly number[]): number {
  sameLength(labels, scores);
  const order = scores.map((s, i) => ({ s, y: labels[i] as Label })).sort((a, b) => a.s - b.s);
  const sorted = order.map((o) => o.s);
  let rankSumPos = 0;
  let pos = 0;
  let i = 0;
  while (i < order.length) {
    // [i, j] is a run of tied scores; each member gets the run's average rank.
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[i]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (const o of order.slice(i, j + 1)) {
      if (o.y === 1) {
        rankSumPos += avgRank;
        pos++;
      }
    }
    i = j + 1;
  }
  const neg = order.length - pos;
  if (pos === 0 || neg === 0) return Number.NaN;
  return (rankSumPos - (pos * (pos + 1)) / 2) / (pos * neg);
}

/** ROC curve points from the highest threshold to the lowest, one point per distinct score. */
export function rocCurve(labels: readonly Label[], scores: readonly number[]): RocPoint[] {
  sameLength(labels, scores);
  const order = scores.map((s, i) => ({ s, y: labels[i] as Label })).sort((a, b) => b.s - a.s);
  const P = order.filter((o) => o.y === 1).length;
  const N = order.length - P;
  const points: RocPoint[] = [{ fpr: 0, tpr: 0, threshold: Number.POSITIVE_INFINITY }];
  let tp = 0;
  let fp = 0;
  for (let i = 0; i < order.length; i++) {
    const o = order[i] as { s: number; y: Label };
    if (o.y === 1) tp++;
    else fp++;
    const next = order[i + 1];
    if (next === undefined || next.s !== o.s) {
      points.push({ fpr: ratio(fp, N), tpr: ratio(tp, P), threshold: o.s });
    }
  }
  return points;
}

/** Thresholds scores (score >= threshold → positive) and computes every metric. */
export function evaluateScores(
  labels: readonly Label[],
  scores: readonly number[],
  threshold: number,
): ScoreEvaluation {
  const predictions = scores.map((s): Label => (s >= threshold ? 1 : 0));
  const confusion = confusionMatrix(labels, predictions);
  return { threshold, confusion, metrics: binaryMetrics(confusion), auc: rocAuc(labels, scores) };
}
