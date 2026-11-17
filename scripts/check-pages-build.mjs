// Checks the built playground before it is published to GitHub Pages:
//  1. every local asset in index.html is served from /bastion-llm-firewall/
//  2. the Content-Security-Policy forbids network connections (connect-src 'none')
//  3. no bundled script calls a network API
// Run after `npm run build`. Exits non-zero on failure.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = '/bastion-llm-firewall/';
const DIST = 'apps/playground/dist';
const NETWORK_APIS =
  /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|sendBeacon|EventSource|importScripts/;

const failures = [];
const html = await readFile(join(DIST, 'index.html'), 'utf8');

for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (/^(https?:|mailto:|#|\.\/?$)/.test(url)) continue;
  if (!url.startsWith(BASE)) failures.push(`index.html references ${url} outside ${BASE}`);
}
if (!/http-equiv="Content-Security-Policy"[^>]*connect-src 'none'/.test(html)) {
  failures.push("index.html has no Content-Security-Policy with connect-src 'none'");
}

const assets = await readdir(join(DIST, 'assets'));
const scripts = assets.filter((f) => f.endsWith('.js'));
if (scripts.length === 0) failures.push('no JavaScript bundle found');
for (const file of scripts) {
  const code = await readFile(join(DIST, 'assets', file), 'utf8');
  const hit = code.match(NETWORK_APIS);
  if (hit) failures.push(`${file} uses a network API: ${hit[0]}`);
}

if (failures.length > 0) {
  console.error(failures.map((f) => `FAIL ${f}`).join('\n'));
  process.exit(1);
}
console.log(
  `ok: ${scripts.length} script(s), base ${BASE}, CSP connect-src 'none', no network APIs`,
);
