/**
 * The firewall facade: one object that applies the route's policy to a
 * prompt (normalize → rules + classifier → allow / flag / block) or to a
 * model response (PII, secrets, canaries, prompt leak → allow / flag /
 * redact / block).
 */
import { createClassifier } from './classifier/classifier.js';
import type { Classifier, Contribution } from './classifier/classifier.js';
import { loadDefaultModel } from './classifier/default-model.js';
import type { ClassifierModel } from './classifier/model.js';
import { DEFAULT_DETECTORS, runHeuristics } from './detectors/heuristics.js';
import type { Finding, InputDetector } from './detectors/types.js';
import { normalize } from './normalize/normalize.js';
import type { EvasionSignal, ViewSource } from './normalize/types.js';
import type { CanaryHit } from './output/canary.js';
import type { PromptLeak } from './output/leak.js';
import { redact } from './output/redact.js';
import { scanOutput } from './output/scan-output.js';
import type { Confidence, Span } from './output/types.js';
import { resolvePolicy } from './policy/resolve.js';
import type { Action, InputAction, Policy, PolicyConfig } from './policy/types.js';
import { parsePolicyConfig } from './policy/validate.js';

export interface FirewallOptions {
  /** Policy configuration; validated with parsePolicyConfig. */
  policy?: PolicyConfig;
  /** Classifier model; omit for the bundled model, `null` to run rules only. */
  model?: ClassifierModel | null;
  /** Input detectors; defaults to DEFAULT_DETECTORS. */
  detectors?: readonly InputDetector[];
}

export interface InputContext {
  route?: string;
}

export interface InputDecision {
  action: InputAction;
  /** max(heuristic score, calibrated classifier score), in [0, 1]. */
  score: number;
  heuristicScore: number;
  classifierScore: number | null;
  findings: Finding[];
  signals: EvasionSignal[];
  /** Sources of every view that was scanned (primary, base64, ...). */
  views: ViewSource[];
  /** Terms that moved the classifier most, strongest first. */
  contributions: Contribution[];
  route: string;
}

export interface OutputContext {
  route?: string;
  /** Canary tokens that were placed in this conversation's system prompt. */
  canaries?: readonly string[];
  /** The system prompt, for shingle-based leak detection. */
  systemPrompt?: string;
}

export interface OutputFinding {
  type: 'pii' | 'secret' | 'canary' | 'prompt-leak';
  action: Action;
  message: string;
  span?: Span;
  canary?: CanaryHit;
  leak?: PromptLeak;
}

export interface OutputDecision {
  action: Action;
  /** The response after redaction (unchanged unless the action is `redact`). */
  text: string;
  findings: OutputFinding[];
  route: string;
}

export interface Firewall {
  inspectInput(text: string, context?: InputContext): InputDecision;
  inspectOutput(text: string, context?: OutputContext): OutputDecision;
  policyFor(route: string): Policy;
}

const PRECEDENCE: Readonly<Record<Action, number>> = { allow: 0, flag: 1, redact: 2, block: 3 };
const CONFIDENCE: Readonly<Record<Confidence, number>> = { low: 1, medium: 2, high: 3 };

export function strongestAction(actions: readonly Action[]): Action {
  return actions.reduce<Action>((a, b) => (PRECEDENCE[b] > PRECEDENCE[a] ? b : a), 'allow');
}

export function createFirewall(options: FirewallOptions = {}): Firewall {
  const config = parsePolicyConfig(options.policy ?? {});
  const model = options.model === undefined ? loadDefaultModel() : options.model;
  const classifier: Classifier | null = model === null ? null : createClassifier(model);
  const detectors = options.detectors ?? DEFAULT_DETECTORS;

  const policyFor = (route: string): Policy => resolvePolicy(config, route);

  const inspectInput = (text: string, context: InputContext = {}): InputDecision => {
    const route = context.route ?? '/';
    const { input: policy } = policyFor(route);
    const normalized = normalize(text, { maxLength: policy.maxLength });
    const active = detectors.filter((d) => policy.detectors[d.id] !== false);
    const heuristics = runHeuristics(normalized, active);
    const ml =
      policy.classifier && classifier ? classifier.score(normalized, { explain: 8 }) : null;
    const score = Math.max(heuristics.score, ml?.calibrated ?? 0);
    const action: InputAction =
      score >= policy.blockAt ? 'block' : score >= policy.flagAt ? 'flag' : 'allow';
    return {
      action,
      score,
      heuristicScore: heuristics.score,
      classifierScore: ml ? ml.calibrated : null,
      findings: heuristics.findings,
      signals: normalized.signals,
      views: normalized.views.map((v) => v.source),
      contributions: ml?.contributions ?? [],
      route,
    };
  };

  const inspectOutput = (text: string, context: OutputContext = {}): OutputDecision => {
    const route = context.route ?? '/';
    const { output: policy } = policyFor(route);
    const scan = scanOutput(text, {
      piiKinds: policy.piiKinds,
      canaries: context.canaries ?? [],
      ...(context.systemPrompt !== undefined ? { systemPrompt: context.systemPrompt } : {}),
    });
    const confident = (s: Span) => CONFIDENCE[s.confidence] >= CONFIDENCE[policy.minConfidence];
    const findings: OutputFinding[] = [
      ...scan.pii.filter(confident).map((span) => ({
        type: 'pii' as const,
        action: policy.pii,
        message: `${span.detail} (${span.confidence} confidence)`,
        span,
      })),
      ...scan.secrets.filter(confident).map((span) => ({
        type: 'secret' as const,
        action: policy.secrets,
        message: `${span.detail} (${span.confidence} confidence)`,
        span,
      })),
      ...scan.canaries.map((canary) => ({
        type: 'canary' as const,
        action: policy.canary,
        message: `canary token from the system prompt appears in the output (${canary.variant})`,
        canary,
      })),
      ...(scan.leak?.leaked
        ? [
            {
              type: 'prompt-leak' as const,
              action: policy.promptLeak,
              message: `output repeats ${Math.round(scan.leak.coverage * 100)}% of the system prompt`,
              leak: scan.leak,
            },
          ]
        : []),
    ];
    const action = strongestAction(findings.map((f) => f.action));
    const toRedact = findings.flatMap((f): Span[] => {
      if (f.action !== 'redact') return [];
      if (f.span) return [f.span];
      if (f.canary && f.canary.start >= 0) {
        return [
          {
            kind: 'canary',
            category: 'secret',
            start: f.canary.start,
            end: f.canary.end,
            value: text.slice(f.canary.start, f.canary.end),
            confidence: 'high',
            detail: 'canary token',
          },
        ];
      }
      return [];
    });
    return {
      action,
      text: action === 'redact' ? redact(text, toRedact, policy.redaction) : text,
      findings,
      route,
    };
  };

  return { inspectInput, inspectOutput, policyFor };
}
