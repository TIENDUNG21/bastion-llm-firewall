import type { FeatureConfig } from './features.js';

/** On-disk model format (`model.json`). Weights are sparse: only non-zero buckets are stored. */
export interface ClassifierModel {
  format: 'bastion-logreg';
  version: 1;
  features: FeatureConfig;
  bias: number;
  /** Probability threshold chosen on the validation split; calibrated scores map it to 0.5. */
  threshold: number;
  weights: { indices: number[]; values: number[] };
  /** Provenance written by the training script (datasets, revisions, seed, sizes). */
  training?: Record<string, unknown>;
}

class ModelError extends Error {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'ModelError';
  }
}

type Obj = Record<string, unknown>;

function object(value: unknown, path: string): Obj {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ModelError(path, 'expected an object');
  }
  return value as Obj;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ModelError(path, 'expected a finite number');
  }
  return value;
}

function integer(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ModelError(path, `expected an integer in [${min}, ${max}]`);
  }
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new ModelError(path, 'expected a boolean');
  return value;
}

function numberArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new ModelError(path, 'expected an array');
  return value;
}

/** Validates untrusted JSON and returns a typed model; errors name the offending path. */
export function parseModel(json: unknown): ClassifierModel {
  const m = object(json, 'model');
  if (m.format !== 'bastion-logreg')
    throw new ModelError('model.format', 'expected "bastion-logreg"');
  if (m.version !== 1) throw new ModelError('model.version', 'expected 1');

  const f = object(m.features, 'model.features');
  const dim = integer(f.dim, 'model.features.dim', 2, 1 << 24);
  if ((dim & (dim - 1)) !== 0)
    throw new ModelError('model.features.dim', 'expected a power of two');
  const charMin = integer(f.charMin, 'model.features.charMin', 1, 16);
  const charMax = integer(f.charMax, 'model.features.charMax', charMin, 16);
  const features: FeatureConfig = {
    dim,
    charMin,
    charMax,
    words: bool(f.words, 'model.features.words'),
    bigrams: bool(f.bigrams, 'model.features.bigrams'),
    maxChars: integer(f.maxChars, 'model.features.maxChars', 1, 1_000_000),
  };

  const threshold = finite(m.threshold, 'model.threshold');
  if (threshold <= 0 || threshold >= 1) throw new ModelError('model.threshold', 'expected (0, 1)');

  const w = object(m.weights, 'model.weights');
  const indices = numberArray(w.indices, 'model.weights.indices');
  const values = numberArray(w.values, 'model.weights.values');
  if (indices.length !== values.length) {
    throw new ModelError('model.weights', 'indices and values must have the same length');
  }
  const model: ClassifierModel = {
    format: 'bastion-logreg',
    version: 1,
    features,
    bias: finite(m.bias, 'model.bias'),
    threshold,
    weights: {
      indices: indices.map((v, i) => integer(v, `model.weights.indices[${i}]`, 0, dim - 1)),
      values: values.map((v, i) => finite(v, `model.weights.values[${i}]`)),
    },
  };
  if (m.training !== undefined) model.training = object(m.training, 'model.training');
  return model;
}
