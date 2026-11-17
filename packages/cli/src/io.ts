import { readFile } from 'node:fs/promises';

/** Everything the CLI touches outside itself, so commands can be tested in memory. */
export interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
  readFile(path: string): Promise<string>;
  /** Whole stdin, or null when stdin is an interactive terminal. */
  readStdin(): Promise<string | null>;
  color: boolean;
}

/** A user-facing error: printed without a stack trace, exit code 3. */
export class CliError extends Error {
  override name = 'CliError';
}

export function nodeIo(): Io {
  return {
    stdout: (t) => process.stdout.write(t),
    stderr: (t) => process.stderr.write(t),
    readFile: (path) => readFile(path, 'utf8'),
    readStdin: async () => {
      if (process.stdin.isTTY) return null;
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks).toString('utf8');
    },
    color: Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined,
  };
}
