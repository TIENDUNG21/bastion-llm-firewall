import { DEFAULT_POLICY } from './types.js';
import type { PartialPolicy, Policy, PolicyConfig } from './types.js';

function merge(base: Policy, patch: PartialPolicy | undefined): Policy {
  if (!patch) return base;
  return {
    input: {
      ...base.input,
      ...patch.input,
      detectors: { ...base.input.detectors, ...patch.input?.detectors },
    },
    output: { ...base.output, ...patch.output },
  };
}

function normalizePath(route: string): string {
  const path = route.split(/[?#]/)[0] ?? '/';
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function globToRegExp(pattern: string): RegExp {
  const body = pattern
    .split(/(\*\*|\*)/)
    .map((part) =>
      part === '**' ? '.*' : part === '*' ? '[^/]*' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');
  return new RegExp(`^${body}$`);
}

/** How specific a pattern is: exact patterns beat any glob; longer literal text beats shorter. */
function specificity(pattern: string): number {
  if (!pattern.includes('*')) return Number.POSITIVE_INFINITY;
  return pattern.replace(/\*/g, '').length;
}

/**
 * The effective policy for a route: built-in defaults, then the config's
 * `default`, then the most specific matching route (first one on a tie).
 */
export function resolvePolicy(config: PolicyConfig, route: string): Policy {
  const path = normalizePath(route);
  let best: { score: number; policy: PartialPolicy } | null = null;
  for (const r of config.routes ?? []) {
    const pattern = normalizePath(r.match);
    if (!globToRegExp(pattern).test(path)) continue;
    const score = specificity(pattern);
    if (best === null || score > best.score) best = { score, policy: r.policy };
  }
  return merge(merge(DEFAULT_POLICY, config.default), best?.policy);
}
