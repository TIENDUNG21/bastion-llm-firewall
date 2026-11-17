import { findCanaryLeaks } from './canary.js';
import type { CanaryHit } from './canary.js';
import { detectPromptLeak } from './leak.js';
import type { PromptLeak } from './leak.js';
import { findPii } from './pii.js';
import { findSecrets } from './secrets.js';
import { ALL_PII_KINDS } from './types.js';
import type { PiiKind, Span } from './types.js';

export interface OutputScanOptions {
  piiKinds?: readonly PiiKind[];
  canaries?: readonly string[];
  systemPrompt?: string;
}

export interface OutputScan {
  pii: Span[];
  secrets: Span[];
  canaries: CanaryHit[];
  leak: PromptLeak | null;
}

/** Runs every output scanner on a model response. */
export function scanOutput(text: string, options: OutputScanOptions = {}): OutputScan {
  return {
    pii: findPii(text, options.piiKinds ?? ALL_PII_KINDS),
    secrets: findSecrets(text),
    canaries: findCanaryLeaks(text, options.canaries ?? []),
    leak:
      options.systemPrompt !== undefined && options.systemPrompt.trim() !== ''
        ? detectPromptLeak(text, options.systemPrompt)
        : null,
  };
}
