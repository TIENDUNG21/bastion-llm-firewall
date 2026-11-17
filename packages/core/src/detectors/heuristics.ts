import type { NormalizedInput } from '../normalize/types.js';
import { obfuscation } from './obfuscation.js';
import { delimiterInjection } from './rules/delimiter-injection.js';
import { instructionOverride } from './rules/instruction-override.js';
import { promptExtraction } from './rules/prompt-extraction.js';
import { rolePlay } from './rules/role-play.js';
import { toolSmuggling } from './rules/tool-smuggling.js';
import { noisyOr } from './score.js';
import type { Finding, HeuristicResult, InputDetector } from './types.js';

/** Default detector set. `obfuscation` runs last because it reads earlier findings. */
export const DEFAULT_DETECTORS: readonly InputDetector[] = [
  instructionOverride,
  rolePlay,
  delimiterInjection,
  toolSmuggling,
  promptExtraction,
  obfuscation,
];

/**
 * Runs every detector over the normalized input. The overall heuristic score
 * is the noisy-OR of the detectors' scores.
 */
export function runHeuristics(
  input: NormalizedInput,
  detectors: readonly InputDetector[] = DEFAULT_DETECTORS,
): HeuristicResult {
  const findings: Finding[] = [];
  for (const detector of detectors) {
    const finding = detector.detect(input, findings);
    if (finding !== null && finding.score > 0) findings.push(finding);
  }
  return { score: noisyOr(findings.map((f) => f.score)), findings };
}
