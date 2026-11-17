import modelJson from './model.json' with { type: 'json' };
import { parseModel } from './model.js';
import type { ClassifierModel } from './model.js';

let cached: ClassifierModel | null = null;

/**
 * The model trained by scripts/train.ts on deepset/prompt-injections and
 * jackhhao/jailbreak-classification (both Apache-2.0). Parsed and validated
 * on first use.
 */
export function loadDefaultModel(): ClassifierModel {
  cached ??= parseModel(modelJson);
  return cached;
}
