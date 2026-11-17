/**
 * Downloads the training datasets through the Hugging Face datasets-server
 * JSON API into .cache/downloads/ (gitignored).
 *
 *   npm run fetch-data
 *
 * For each dataset it first reads the dataset card metadata and aborts unless
 * the declared license allows redistribution. It records the dataset revision
 * and a SHA-256 of every downloaded split in manifest.json.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { ALLOWED_LICENSES, SOURCES, cacheFolder } from './lib/datasets.js';
import type { DatasetSource } from './lib/datasets.js';

const PAGE = 100;

async function getJson(url: string): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (res.ok) return res.json();
    if (attempt >= 4 || (res.status !== 429 && res.status < 500)) {
      throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

interface CardInfo {
  sha: string;
  license: string;
}

async function readCard(id: string): Promise<CardInfo> {
  const info = (await getJson(`https://huggingface.co/api/datasets/${id}`)) as {
    sha?: string;
    cardData?: { license?: string | string[] };
    tags?: string[];
  };
  const fromCard = info.cardData?.license;
  const fromTags = info.tags?.find((t) => t.startsWith('license:'))?.slice('license:'.length);
  const license = (Array.isArray(fromCard) ? fromCard[0] : fromCard) ?? fromTags;
  if (typeof info.sha !== 'string' || typeof license !== 'string') {
    throw new Error(`${id}: dataset card has no revision or license`);
  }
  return { sha: info.sha, license: license.toLowerCase() };
}

interface RowsPage {
  rows: { row_idx: number; row: Record<string, unknown>; truncated_cells: string[] }[];
  num_rows_total: number;
}

function rowsUrl(src: DatasetSource, split: string, offset: number, length: number): string {
  const q = new URLSearchParams({
    dataset: src.id,
    config: src.config,
    split,
    offset: String(offset),
    length: String(length),
  });
  return `https://datasets-server.huggingface.co/rows?${q.toString()}`;
}

async function fetchSplit(src: DatasetSource, split: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let total = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < total; offset += PAGE) {
    const page = (await getJson(rowsUrl(src, split, offset, PAGE))) as RowsPage;
    total = page.num_rows_total;
    for (const r of page.rows) {
      if (r.truncated_cells.length === 0) {
        out.push(r.row);
        continue;
      }
      // Long cells are truncated in multi-row pages; fetch the row on its own.
      const single = (await getJson(rowsUrl(src, split, r.row_idx, 1))) as RowsPage;
      const row = single.rows[0];
      if (!row || row.truncated_cells.length > 0) {
        throw new Error(`${src.id}/${split}: row ${r.row_idx} is truncated by the API`);
      }
      out.push(row.row);
    }
  }
  if (out.length !== total)
    throw new Error(`${src.id}/${split}: got ${out.length} of ${total} rows`);
  return out;
}

async function main(): Promise<void> {
  for (const src of SOURCES) {
    const card = await readCard(src.id);
    if (!ALLOWED_LICENSES.has(card.license)) {
      throw new Error(`${src.id}: license "${card.license}" is not on the allow-list`);
    }
    const folder = cacheFolder(src.id);
    await mkdir(folder, { recursive: true });
    const splits: Record<string, { rows: number; sha256: string }> = {};
    for (const split of src.splits) {
      const rows = await fetchSplit(src, split);
      const body = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
      await writeFile(`${folder}/${split}.jsonl`, body, 'utf8');
      splits[split] = {
        rows: rows.length,
        sha256: createHash('sha256').update(body).digest('hex'),
      };
      console.log(`${src.id} ${split}: ${rows.length} rows`);
    }
    const manifest = {
      id: src.id,
      url: src.url,
      revision: card.sha,
      license: card.license,
      fetchedAt: new Date().toISOString(),
      splits,
    };
    await writeFile(`${folder}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
