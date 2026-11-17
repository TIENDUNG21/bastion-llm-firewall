/**
 * Noisy-OR: the probability that at least one of several independent signals
 * is right. Two 0.5 signals give 0.75; any 1.0 signal gives 1.0.
 */
export function noisyOr(scores: readonly number[]): number {
  let miss = 1;
  for (const s of scores) {
    const p = Number.isNaN(s) ? 0 : Math.min(1, Math.max(0, s));
    miss *= 1 - p;
  }
  return 1 - miss;
}
