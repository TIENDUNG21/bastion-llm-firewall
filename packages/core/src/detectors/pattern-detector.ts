import { noisyOr } from './score.js';
import type { Category, Evidence, InputDetector, PatternRule } from './types.js';

export interface PatternDetectorDefinition {
  id: string;
  category: Category;
  description: string;
  rules: readonly PatternRule[];
}

const MAX_MATCH_LENGTH = 120;

function clip(s: string): string {
  return s.length <= MAX_MATCH_LENGTH ? s : `${s.slice(0, MAX_MATCH_LENGTH - 3)}...`;
}

/**
 * Builds a detector from regular-expression rules. Every rule is tried on
 * every view's skeleton; a rule counts once however many views it matches,
 * and the detector's score is the noisy-OR of the matched rules' weights.
 */
export function createPatternDetector(def: PatternDetectorDefinition): InputDetector {
  for (const rule of def.rules) {
    if (rule.pattern.global || rule.pattern.sticky) {
      throw new Error(`rule ${def.id}/${rule.id}: pattern must not be global or sticky`);
    }
  }
  return {
    id: def.id,
    category: def.category,
    description: def.description,
    detect(input) {
      const hits = new Map<string, Evidence>();
      for (const view of input.views) {
        for (const rule of def.rules) {
          if (hits.has(rule.id)) continue;
          const m = rule.pattern.exec(view.skeleton);
          if (m) {
            hits.set(rule.id, {
              view: view.source,
              rule: rule.id,
              match: clip(m[0]),
              index: m.index,
            });
          }
        }
      }
      if (hits.size === 0) return null;
      const matched = def.rules.filter((r) => hits.has(r.id));
      const top = matched.reduce((a, b) => (b.weight > a.weight ? b : a));
      const evidence = [...hits.values()].filter(
        (e, i, all) =>
          all.findIndex((o) => o.view === e.view && o.index === e.index && o.match === e.match) ===
          i,
      );
      const hiddenIn = [...new Set(evidence.map((e) => e.view).filter((v) => v !== 'primary'))];
      const where = hiddenIn.length > 0 ? ` (found in ${hiddenIn.join(', ')}-decoded text)` : '';
      return {
        detector: def.id,
        category: def.category,
        score: noisyOr(matched.map((r) => r.weight)),
        message: `${top.explain}${where}`,
        evidence,
      };
    },
  };
}
