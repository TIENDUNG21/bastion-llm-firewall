import { ALL_PII_KINDS, findPii, findSecrets, redact } from '@bastion/core';
import type { PiiKind } from '@bastion/core';
import { parse } from '../args.js';
import { readInput } from '../common.js';
import { CliError } from '../io.js';
import type { Io } from '../io.js';

export const REDACT_HELP = `Usage: bastion redact [text] [options]

Prints the text with personal data and secrets replaced.

Options:
  --file <path>       read the text from a file
  --style <style>     label (default, e.g. [EMAIL]) or mask (keeps a hint, e.g. last card digits)
  --kinds <list>      comma-separated PII kinds: ${ALL_PII_KINDS.join(', ')}
  --no-secrets        leave secrets alone
`;

export async function redactCommand(argv: string[], io: Io): Promise<number> {
  const { values, positionals } = parse(argv, {
    file: { type: 'string' },
    style: { type: 'string' },
    kinds: { type: 'string' },
    'no-secrets': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  });
  if (values.help) {
    io.stdout(REDACT_HELP);
    return 0;
  }
  const style = values.style ?? 'label';
  if (style !== 'label' && style !== 'mask') throw new CliError('--style must be label or mask');
  const kinds = (values.kinds?.split(',').map((k) => k.trim()) ?? [...ALL_PII_KINDS]) as PiiKind[];
  for (const k of kinds) {
    if (!ALL_PII_KINDS.includes(k))
      throw new CliError(`unknown PII kind "${k}" (known: ${ALL_PII_KINDS.join(', ')})`);
  }
  const text = await readInput(io, positionals, values.file);
  const spans = [...findPii(text, kinds), ...(values['no-secrets'] ? [] : findSecrets(text))];
  const out = redact(text, spans, style);
  io.stdout(out.endsWith('\n') ? out : `${out}\n`);
  return 0;
}
