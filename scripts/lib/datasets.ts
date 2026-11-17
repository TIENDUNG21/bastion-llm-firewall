/**
 * Public datasets used to train and evaluate the classifier. Both are
 * published on the Hugging Face Hub under licenses that allow redistribution;
 * the fetch script re-checks the license on the dataset card before
 * downloading. Raw rows stay in .cache/ and are never committed.
 */
import type { Label } from '../../packages/core/src/eval/metrics.js';

export interface DatasetSource {
  id: string;
  config: string;
  splits: string[];
  textField: string;
  labelField: string;
  toLabel(value: unknown): Label | null;
  url: string;
}

export const SOURCES: readonly DatasetSource[] = [
  {
    id: 'deepset/prompt-injections',
    config: 'default',
    splits: ['train', 'test'],
    textField: 'text',
    labelField: 'label',
    toLabel: (v) => (v === 1 ? 1 : v === 0 ? 0 : null),
    url: 'https://huggingface.co/datasets/deepset/prompt-injections',
  },
  {
    id: 'jackhhao/jailbreak-classification',
    config: 'default',
    splits: ['train', 'test'],
    textField: 'prompt',
    labelField: 'type',
    toLabel: (v) => (v === 'jailbreak' ? 1 : v === 'benign' ? 0 : null),
    url: 'https://huggingface.co/datasets/jackhhao/jailbreak-classification',
  },
];

/** Licenses that allow redistribution of derived artifacts with attribution. */
export const ALLOWED_LICENSES: ReadonlySet<string> = new Set([
  'apache-2.0',
  'mit',
  'cc-by-4.0',
  'cc0-1.0',
]);

export const CACHE_DIR = '.cache/downloads';

/** Seeded split shared by the training and evaluation scripts. */
export const SPLIT = {
  seed: 1337,
  testFraction: 0.2,
  /** Share of the training part held out for threshold selection. */
  validationFraction: 0.15,
} as const;

export function cacheFolder(id: string): string {
  return `${CACHE_DIR}/${id.replace('/', '__')}`;
}
