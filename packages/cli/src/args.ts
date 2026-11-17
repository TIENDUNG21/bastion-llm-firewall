import { parseArgs } from 'node:util';
import type { ParseArgsConfig } from 'node:util';
import { CliError } from './io.js';

type Options = NonNullable<ParseArgsConfig['options']>;

/** Strict option parsing; unknown or malformed options become a CliError. */
export function parse<T extends Options>(argv: string[], options: T) {
  try {
    return parseArgs({ args: argv, options, allowPositionals: true, strict: true });
  } catch (err) {
    throw new CliError(err instanceof Error ? err.message : String(err));
  }
}
