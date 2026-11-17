import type { Action } from '@bastion/core';
import { parse } from '../args.js';
import { loadFirewall, readInput, readText } from '../common.js';
import { formatInput, formatOutput, painter } from '../format.js';
import type { Io } from '../io.js';

export const SCAN_HELP = `Usage: bastion scan [text] [options]

Scans a prompt (default) or a model response (--output) and prints the decision.
Text comes from the argument, --file, or stdin.

Options:
  --file <path>                 read the text from a file
  --output                      treat the text as model output (PII, secrets, canaries, leaks)
  --route <path>                route whose policy applies (default /)
  --policy <file.json>          policy configuration
  --canary <token>              canary token to look for in output (repeatable)
  --system-prompt-file <path>   system prompt for leak detection in output
  --no-classifier               rules only
  --json                        print the decision as JSON

Exit codes: 0 allow, 1 flag or redact, 2 block, 3 usage or input error.
`;

export function exitCodeFor(action: Action): number {
  return action === 'block' ? 2 : action === 'allow' ? 0 : 1;
}

export async function scanCommand(argv: string[], io: Io): Promise<number> {
  const { values, positionals } = parse(argv, {
    file: { type: 'string' },
    output: { type: 'boolean' },
    route: { type: 'string' },
    policy: { type: 'string' },
    canary: { type: 'string', multiple: true },
    'system-prompt-file': { type: 'string' },
    'no-classifier': { type: 'boolean' },
    json: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  });
  if (values.help) {
    io.stdout(SCAN_HELP);
    return 0;
  }
  const firewall = await loadFirewall(
    io,
    values.policy,
    values['no-classifier'] ? { model: null } : {},
  );
  const text = await readInput(io, positionals, values.file);
  const route = values.route ?? '/';
  const paint = painter(io.color);

  if (values.output) {
    const systemPrompt =
      values['system-prompt-file'] !== undefined
        ? await readText(io, values['system-prompt-file'])
        : undefined;
    const decision = firewall.inspectOutput(text, {
      route,
      canaries: values.canary ?? [],
      ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    });
    io.stdout(
      values.json ? `${JSON.stringify(decision, null, 2)}\n` : formatOutput(decision, paint),
    );
    return exitCodeFor(decision.action);
  }

  const decision = firewall.inspectInput(text, { route });
  io.stdout(values.json ? `${JSON.stringify(decision, null, 2)}\n` : formatInput(decision, paint));
  return exitCodeFor(decision.action);
}
