import { createFirewall } from '@bastion/core';
import type { Firewall, FirewallOptions } from '@bastion/core';
import { CliError } from './io.js';
import type { Io } from './io.js';

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function readText(io: Io, path: string): Promise<string> {
  try {
    return await io.readFile(path);
  } catch (err) {
    throw new CliError(`cannot read ${path}: ${message(err)}`);
  }
}

/** Input text from positionals, --file or stdin (in that order). */
export async function readInput(
  io: Io,
  positionals: string[],
  file: string | undefined,
): Promise<string> {
  if (positionals.length > 0) return positionals.join(' ');
  if (file !== undefined) return readText(io, file);
  const stdin = await io.readStdin();
  if (stdin !== null && stdin.trim() !== '') return stdin;
  throw new CliError(
    'no input: pass the text as an argument, use --file <path>, or pipe it on stdin',
  );
}

export async function loadFirewall(
  io: Io,
  policyPath: string | undefined,
  options: Omit<FirewallOptions, 'policy'> = {},
): Promise<Firewall> {
  let policy: unknown = {};
  if (policyPath !== undefined) {
    const raw = await readText(io, policyPath);
    try {
      policy = JSON.parse(raw);
    } catch (err) {
      throw new CliError(`${policyPath}: invalid JSON (${message(err)})`);
    }
  }
  try {
    return createFirewall({ ...options, policy: policy as FirewallOptions['policy'] & object });
  } catch (err) {
    throw new CliError(message(err));
  }
}
