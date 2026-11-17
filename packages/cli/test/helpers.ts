import { main } from '../src/main.js';
import type { Io } from '../src/io.js';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs the CLI in-process with an in-memory file system and stdin. */
export async function run(
  argv: string[],
  options: { files?: Record<string, string>; stdin?: string | null } = {},
): Promise<RunResult> {
  let stdout = '';
  let stderr = '';
  const io: Io = {
    stdout: (t) => {
      stdout += t;
    },
    stderr: (t) => {
      stderr += t;
    },
    readFile: async (path) => {
      const content = options.files?.[path];
      if (content === undefined)
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      return content;
    },
    readStdin: async () => options.stdin ?? null,
    color: false,
  };
  const code = await main(argv, io);
  return { code, stdout, stderr };
}
