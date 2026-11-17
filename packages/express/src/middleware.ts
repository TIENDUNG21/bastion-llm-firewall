import { strongestAction } from '@bastion/core';
import type { Action, InputDecision, OutputDecision, OutputFinding } from '@bastion/core';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { resolveOptions } from './options.js';
import type { BastionOptions, ResolvedOptions } from './options.js';

const MAX_DEPTH = 32;

function unavailable(res: Response, side: 'input' | 'output'): void {
  res.status(503).json({
    error: {
      type: 'bastion_unavailable',
      side,
      message: 'The prompt firewall could not inspect this message.',
    },
  });
}

/** Input side: scans the request's user text and blocks prompt injection with 403. */
function inputHandler(opts: ResolvedOptions): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const route = opts.route(req);
    let decision: InputDecision | null = null;
    try {
      for (const text of opts.extract(req)) {
        const d = opts.firewall.inspectInput(text, { route });
        if (decision === null || d.score > decision.score) decision = d;
      }
    } catch (error) {
      opts.onDecision({ side: 'input', route, action: 'error', error });
      if (opts.failMode === 'closed') {
        unavailable(res, 'input');
        return;
      }
      next();
      return;
    }
    if (decision === null) {
      next();
      return;
    }
    res.locals.bastionInput = decision;
    res.setHeader('X-Bastion-Input', decision.action);
    res.setHeader('X-Bastion-Score', decision.score.toFixed(3));
    opts.onDecision({ side: 'input', route, action: decision.action, decision });
    if (decision.action === 'block') {
      res.status(403).json({
        error: {
          type: 'bastion_blocked',
          side: 'input',
          message: 'The request was blocked by the prompt firewall.',
          score: Number(decision.score.toFixed(3)),
          findings: decision.findings.map((f) => ({
            detector: f.detector,
            category: f.category,
            score: Number(f.score.toFixed(3)),
            message: f.message,
          })),
        },
      });
      return;
    }
    next();
  };
}

interface Inspection {
  action: Action;
  findings: OutputFinding[];
  body: unknown;
}

/** Inspects every string leaf of a JSON value and rebuilds it with redactions applied. */
function inspectValue(
  value: unknown,
  inspect: (s: string) => OutputDecision,
  depth = 0,
): Inspection {
  if (typeof value === 'string') {
    const d = inspect(value);
    return { action: d.action, findings: d.findings, body: d.text };
  }
  if (depth >= MAX_DEPTH || typeof value !== 'object' || value === null) {
    return { action: 'allow', findings: [], body: value };
  }
  const entries = Array.isArray(value)
    ? value.map((v, i) => [i, v] as const)
    : Object.entries(value);
  const parts = entries.map(([k, v]) => [k, inspectValue(v, inspect, depth + 1)] as const);
  const body = Array.isArray(value)
    ? parts.map(([, p]) => p.body)
    : Object.fromEntries(parts.map(([k, p]) => [k, p.body]));
  return {
    action: strongestAction(parts.map(([, p]) => p.action)),
    findings: parts.flatMap(([, p]) => p.findings),
    body,
  };
}

/**
 * Output side: wraps res.json and res.send. Personal data is redacted in
 * place; secrets, canary tokens and prompt leaks replace the response with 502.
 */
function outputHandler(opts: ResolvedOptions): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const route = opts.route(req);
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    let busy = false;

    const inspectAndSend = (body: unknown, send: (b: unknown) => Response): Response => {
      if (busy) return send(body);
      busy = true;
      try {
        let result: Inspection;
        try {
          const context = {
            route,
            canaries: opts.canaries(req, res),
            ...(opts.systemPrompt(req, res) !== undefined
              ? { systemPrompt: opts.systemPrompt(req, res) as string }
              : {}),
          };
          result = inspectValue(body, (s) => opts.firewall.inspectOutput(s, context));
        } catch (error) {
          opts.onDecision({ side: 'output', route, action: 'error', error });
          if (opts.failMode === 'open') return send(body);
          res.status(503);
          return originalJson({
            error: {
              type: 'bastion_unavailable',
              side: 'output',
              message: 'The prompt firewall could not inspect this response.',
            },
          });
        }
        const decision: OutputDecision = {
          action: result.action,
          text: '',
          findings: result.findings,
          route,
        };
        res.locals.bastionOutput = decision;
        opts.onDecision({ side: 'output', route, action: result.action, decision });
        if (!res.headersSent) res.setHeader('X-Bastion-Output', result.action);
        if (result.action === 'block') {
          res.status(502);
          return originalJson({
            error: {
              type: 'bastion_blocked',
              side: 'output',
              message: 'The response was withheld by the prompt firewall.',
              findings: result.findings.map((f) => ({
                type: f.type,
                action: f.action,
                message: f.message,
              })),
            },
          });
        }
        return send(result.action === 'redact' ? result.body : body);
      } finally {
        busy = false;
      }
    };

    res.json = (body: unknown) => inspectAndSend(body, originalJson);
    res.send = (body?: unknown) =>
      typeof body === 'string' ? inspectAndSend(body, originalSend) : originalSend(body);
    next();
  };
}

export function bastionInput(options: BastionOptions = {}): RequestHandler {
  return inputHandler(resolveOptions(options));
}

export function bastionOutput(options: BastionOptions = {}): RequestHandler {
  return outputHandler(resolveOptions(options));
}

/** Both sides: inspects the prompt on the way in and the response on the way out. */
export function bastion(options: BastionOptions = {}): RequestHandler {
  const opts = resolveOptions(options);
  const input = inputHandler(opts);
  const output = outputHandler(opts);
  return (req, res, next) => {
    output(req, res, (err?: unknown) => {
      if (err !== undefined) {
        next(err);
        return;
      }
      input(req, res, next);
    });
  };
}
