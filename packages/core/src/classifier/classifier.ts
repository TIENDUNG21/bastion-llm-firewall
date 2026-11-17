import type { NormalizedInput, ViewSource } from '../normalize/types.js';
import { featureTerms, hashTerm, vectorize } from './features.js';
import { logit, predictLogit, sigmoid } from './logistic.js';
import type { ClassifierModel } from './model.js';

/** How much one term pushed the logit (positive = towards "injection"). */
export interface Contribution {
  term: string;
  weight: number;
}

export interface ClassifierScore {
  /** Raw model probability. */
  probability: number;
  /** Probability shifted so that the model's chosen threshold sits at 0.5. */
  calibrated: number;
  /** View with the highest score. */
  view: ViewSource;
  contributions: Contribution[];
}

export interface Classifier {
  readonly model: ClassifierModel;
  /** Raw probability for one skeleton. */
  probability(skel: string): number;
  /** Scores every view and keeps the most suspicious one. */
  score(input: NormalizedInput, options?: { explain?: number }): ClassifierScore;
}

function displayTerm(term: string): string {
  const body = term.slice(2);
  return term.startsWith('c:') ? `"${body}"` : body;
}

export function createClassifier(model: ClassifierModel): Classifier {
  const { features } = model;
  const weights = new Float32Array(features.dim);
  model.weights.indices.forEach((index, k) => {
    weights[index] = model.weights.values[k] as number;
  });
  const shift = logit(model.threshold);

  const z = (skel: string): number => predictLogit(weights, model.bias, vectorize(skel, features));

  const explain = (skel: string, limit: number): Contribution[] => {
    const terms = featureTerms(skel, features);
    const bucket = new Map<number, number>();
    const hashed = [...terms].map(([term, count]) => {
      const h = hashTerm(term, features.dim);
      const value = h.sign * Math.log1p(count);
      bucket.set(h.index, (bucket.get(h.index) ?? 0) + value);
      return { term, index: h.index, value };
    });
    let norm = 0;
    for (const v of bucket.values()) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    return hashed
      .map((t) => ({
        term: displayTerm(t.term),
        weight: ((weights[t.index] ?? 0) * t.value) / norm,
      }))
      .filter((c) => c.weight !== 0)
      .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
      .slice(0, limit);
  };

  return {
    model,
    probability: (skel) => sigmoid(z(skel)),
    score(input, options = {}) {
      let best = { z: Number.NEGATIVE_INFINITY, view: 'primary' as ViewSource, skel: '' };
      for (const view of input.views) {
        const value = z(view.skeleton);
        if (value > best.z) best = { z: value, view: view.source, skel: view.skeleton };
      }
      return {
        probability: sigmoid(best.z),
        calibrated: sigmoid(best.z - shift),
        view: best.view,
        contributions: options.explain ? explain(best.skel, options.explain) : [],
      };
    },
  };
}
