import { createFirewall } from '@bastion/core';
import type {
  ClassifierModel,
  Firewall,
  InputDecision,
  OutputDecision,
  PolicyConfig,
} from '@bastion/core';
import type { Request, Response } from 'express';
import { defaultExtract } from './extract.js';

export type BastionEvent =
  | { side: 'input'; route: string; action: InputDecision['action']; decision: InputDecision }
  | { side: 'output'; route: string; action: OutputDecision['action']; decision: OutputDecision }
  | { side: 'input' | 'output'; route: string; action: 'error'; error: unknown };

export interface BastionOptions {
  /** A ready firewall. When omitted, one is created from `policy` and `model`. */
  firewall?: Firewall;
  policy?: PolicyConfig;
  model?: ClassifierModel | null;
  /** Texts to scan from the request (default: defaultExtract(req.body)). */
  extract?: (req: Request) => string[];
  /** Route used to pick the policy (default: req.baseUrl + req.path). */
  route?: (req: Request) => string;
  /** Canary tokens to look for in the response (default: res.locals.bastionCanaries). */
  canaries?: (req: Request, res: Response) => readonly string[] | undefined;
  /** System prompt for leak detection (default: res.locals.bastionSystemPrompt). */
  systemPrompt?: (req: Request, res: Response) => string | undefined;
  /** What to do when inspection itself throws: 'closed' answers 503 (default), 'open' lets traffic through. */
  failMode?: 'closed' | 'open';
  /** Called for every decision; use it for logging and metrics. */
  onDecision?: (event: BastionEvent) => void;
}

export interface ResolvedOptions {
  firewall: Firewall;
  extract: (req: Request) => string[];
  route: (req: Request) => string;
  canaries: (req: Request, res: Response) => readonly string[];
  systemPrompt: (req: Request, res: Response) => string | undefined;
  failMode: 'closed' | 'open';
  onDecision: (event: BastionEvent) => void;
}

function localsStrings(res: Response): readonly string[] {
  const v: unknown = res.locals.bastionCanaries;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function resolveOptions(options: BastionOptions): ResolvedOptions {
  const firewall =
    options.firewall ??
    createFirewall({
      ...(options.policy !== undefined ? { policy: options.policy } : {}),
      ...(options.model !== undefined ? { model: options.model } : {}),
    });
  return {
    firewall,
    extract: options.extract ?? ((req) => defaultExtract(req.body)),
    route: options.route ?? ((req) => `${req.baseUrl}${req.path}` || '/'),
    canaries: (req, res) => options.canaries?.(req, res) ?? localsStrings(res),
    systemPrompt: (req, res) => {
      const fromLocals: unknown = res.locals.bastionSystemPrompt;
      return (
        options.systemPrompt?.(req, res) ??
        (typeof fromLocals === 'string' ? fromLocals : undefined)
      );
    },
    failMode: options.failMode ?? 'closed',
    onDecision: options.onDecision ?? (() => undefined),
  };
}
