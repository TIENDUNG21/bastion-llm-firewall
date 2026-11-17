/**
 * Loads the downloaded datasets and produces the seeded fit / validation /
 * test split shared by train.ts and evaluate.ts. Verifies every file against
 * the SHA-256 recorded by fetch-datasets.ts.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dedupe, stratifiedSplit } from '../../packages/core/src/eval/split.js';
import type { LabeledText } from '../../packages/core/src/eval/split.js';
import { skeleton } from '../../packages/core/src/normalize/index.js';
import { SOURCES, SPLIT, cacheFolder } from './datasets.js';

export interface Manifest {
  id: string;
  url: string;
  revision: string;
  license: string;
  splits: Record<string, { rows: number; sha256: string }>;
}

export interface Splits {
  fit: LabeledText[];
  validation: LabeledText[];
  test: LabeledText[];
  manifests: Manifest[];
  stats: {
    rawRows: number;
    unlabeled: number;
    duplicates: number;
    conflicts: number;
    rows: number;
  };
}

export async function loadSplits(): Promise<Splits> {
  const all: LabeledText[] = [];
  const manifests: Manifest[] = [];
  let rawRows = 0;
  let unlabeled = 0;
  for (const src of SOURCES) {
    const folder = cacheFolder(src.id);
    let manifest: Manifest;
    try {
      manifest = JSON.parse(await readFile(`${folder}/manifest.json`, 'utf8')) as Manifest;
    } catch {
      throw new Error(`${src.id} is not downloaded yet; run "npm run fetch-data" first`);
    }
    manifests.push(manifest);
    for (const split of src.splits) {
      const body = await readFile(`${folder}/${split}.jsonl`, 'utf8');
      const sha = createHash('sha256').update(body).digest('hex');
      if (sha !== manifest.splits[split]?.sha256) {
        throw new Error(`${folder}/${split}.jsonl does not match its manifest checksum`);
      }
      for (const line of body.split('\n')) {
        if (line.trim() === '') continue;
        rawRows++;
        const row = JSON.parse(line) as Record<string, unknown>;
        const text = row[src.textField];
        const label = src.toLabel(row[src.labelField]);
        if (typeof text !== 'string' || text.trim() === '' || label === null) {
          unlabeled++;
          continue;
        }
        all.push({ text, label, source: src.id });
      }
    }
  }
  const unique = dedupe(all, skeleton);
  const { train, test } = stratifiedSplit(unique.rows, {
    seed: SPLIT.seed,
    testFraction: SPLIT.testFraction,
  });
  const { train: fit, test: validation } = stratifiedSplit(train, {
    seed: SPLIT.seed + 1,
    testFraction: SPLIT.validationFraction,
  });
  return {
    fit,
    validation,
    test,
    manifests,
    stats: {
      rawRows,
      unlabeled,
      duplicates: unique.duplicates,
      conflicts: unique.conflicts,
      rows: unique.rows.length,
    },
  };
}

export function countByLabel(rows: readonly LabeledText[]): { injection: number; benign: number } {
  const injection = rows.filter((r) => r.label === 1).length;
  return { injection, benign: rows.length - injection };
}
