import { VERSION } from '@bastion/core';
import { evalCommand } from './commands/eval.js';
import { redactCommand } from './commands/redact.js';
import { scanCommand } from './commands/scan.js';
import { CliError } from './io.js';
import type { Io } from './io.js';

export const HELP = `Usage: bastion <command> [options]

Commands:
  scan [text]        check a prompt (or, with --output, a model response)
  redact [text]      replace personal data and secrets in text
  eval <file>        measure precision, recall, F1 and ROC-AUC on labelled data

Run "bastion <command> --help" for the options of a command.
Global: --help, --version
`;

type Command = (argv: string[], io: Io) => Promise<number>;

const COMMANDS: Readonly<Record<string, Command>> = {
  scan: scanCommand,
  redact: redactCommand,
  eval: evalCommand,
};

/** Runs the CLI and returns the exit code. */
export async function main(argv: string[], io: Io): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined || command === '--help' || command === '-h' || command === 'help') {
    io.stdout(HELP);
    return 0;
  }
  if (command === '--version' || command === '-v') {
    io.stdout(`${VERSION}\n`);
    return 0;
  }
  try {
    const handler = COMMANDS[command];
    if (handler === undefined)
      throw new CliError(`unknown command "${command}" (try bastion --help)`);
    return await handler(rest, io);
  } catch (err) {
    io.stderr(`bastion: ${err instanceof Error ? err.message : String(err)}\n`);
    return 3;
  }
}
