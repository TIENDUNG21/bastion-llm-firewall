/**
 * Validates policy configuration coming from JSON files or untyped callers.
 * Errors name the exact path (`policy.routes[1].policy.input.blockAt`), and
 * unknown keys are rejected so a typo cannot silently disable a rule.
 */
import { ALL_PII_KINDS } from '../output/types.js';
import type {
  InputPolicy,
  OutputPolicy,
  PartialPolicy,
  PolicyConfig,
  RoutePolicy,
} from './types.js';

export class PolicyError extends Error {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'PolicyError';
  }
}

type Obj = Record<string, unknown>;

const ACTIONS = ['allow', 'flag', 'redact', 'block'] as const;
const CONFIDENCES = ['high', 'medium', 'low'] as const;
const STYLES = ['label', 'mask'] as const;

function object(value: unknown, path: string, keys: readonly string[]): Obj {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PolicyError(path, 'expected an object');
  }
  for (const k of Object.keys(value)) {
    if (!keys.includes(k))
      throw new PolicyError(`${path}.${k}`, `unknown key (allowed: ${keys.join(', ')})`);
  }
  return value as Obj;
}

function unit(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new PolicyError(path, 'expected a number in [0, 1]');
  }
  return value;
}

function oneOf<T extends string>(value: unknown, path: string, options: readonly T[]): T {
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value)) {
    throw new PolicyError(path, `expected one of ${options.join(', ')}`);
  }
  return value as T;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new PolicyError(path, 'expected a boolean');
  return value;
}

function parseInput(value: unknown, path: string): Partial<InputPolicy> {
  const o = object(value, path, ['flagAt', 'blockAt', 'classifier', 'detectors', 'maxLength']);
  const out: Partial<InputPolicy> = {};
  if (o.flagAt !== undefined) out.flagAt = unit(o.flagAt, `${path}.flagAt`);
  if (o.blockAt !== undefined) out.blockAt = unit(o.blockAt, `${path}.blockAt`);
  if (out.flagAt !== undefined && out.blockAt !== undefined && out.flagAt > out.blockAt) {
    throw new PolicyError(path, 'flagAt must not exceed blockAt');
  }
  if (o.classifier !== undefined) out.classifier = bool(o.classifier, `${path}.classifier`);
  if (o.maxLength !== undefined) {
    if (typeof o.maxLength !== 'number' || !Number.isInteger(o.maxLength) || o.maxLength < 1) {
      throw new PolicyError(`${path}.maxLength`, 'expected a positive integer');
    }
    out.maxLength = o.maxLength;
  }
  if (o.detectors !== undefined) {
    if (typeof o.detectors !== 'object' || o.detectors === null || Array.isArray(o.detectors)) {
      throw new PolicyError(`${path}.detectors`, 'expected an object of detector id to boolean');
    }
    out.detectors = Object.fromEntries(
      Object.entries(o.detectors as Obj).map(([id, on]) => [
        id,
        bool(on, `${path}.detectors.${id}`),
      ]),
    );
  }
  return out;
}

function parseOutput(value: unknown, path: string): Partial<OutputPolicy> {
  const o = object(value, path, [
    'pii',
    'secrets',
    'canary',
    'promptLeak',
    'piiKinds',
    'minConfidence',
    'redaction',
  ]);
  const out: Partial<OutputPolicy> = {};
  for (const key of ['pii', 'secrets', 'canary', 'promptLeak'] as const) {
    if (o[key] !== undefined) out[key] = oneOf(o[key], `${path}.${key}`, ACTIONS);
  }
  if (o.piiKinds !== undefined) {
    if (!Array.isArray(o.piiKinds)) throw new PolicyError(`${path}.piiKinds`, 'expected an array');
    out.piiKinds = o.piiKinds.map((k, i) => oneOf(k, `${path}.piiKinds[${i}]`, ALL_PII_KINDS));
  }
  if (o.minConfidence !== undefined) {
    out.minConfidence = oneOf(o.minConfidence, `${path}.minConfidence`, CONFIDENCES);
  }
  if (o.redaction !== undefined) out.redaction = oneOf(o.redaction, `${path}.redaction`, STYLES);
  return out;
}

function parsePartial(value: unknown, path: string): PartialPolicy {
  const o = object(value, path, ['input', 'output']);
  const out: PartialPolicy = {};
  if (o.input !== undefined) out.input = parseInput(o.input, `${path}.input`);
  if (o.output !== undefined) out.output = parseOutput(o.output, `${path}.output`);
  return out;
}

/** Parses and validates a policy configuration object. */
export function parsePolicyConfig(json: unknown): PolicyConfig {
  const o = object(json, 'policy', ['default', 'routes']);
  const out: PolicyConfig = {};
  if (o.default !== undefined) out.default = parsePartial(o.default, 'policy.default');
  if (o.routes !== undefined) {
    if (!Array.isArray(o.routes)) throw new PolicyError('policy.routes', 'expected an array');
    out.routes = o.routes.map((r, i): RoutePolicy => {
      const path = `policy.routes[${i}]`;
      const route = object(r, path, ['match', 'policy']);
      if (typeof route.match !== 'string' || !route.match.startsWith('/')) {
        throw new PolicyError(`${path}.match`, 'expected a path pattern starting with /');
      }
      return { match: route.match, policy: parsePartial(route.policy, `${path}.policy`) };
    });
  }
  return out;
}
