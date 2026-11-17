/** Pulls the user-controlled text out of common chat-request bodies. */

const PROMPT_FIELDS = ['prompt', 'input', 'query', 'question'] as const;
/** Turns whose text comes from outside the application: the user and tool results. */
const SCANNED_ROLES = new Set(['user', 'tool', 'function']);

type Obj = Record<string, unknown>;

const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonEmpty = (s: unknown): s is string => typeof s === 'string' && s.trim() !== '';

function contentText(content: unknown): string[] {
  if (nonEmpty(content)) return [content];
  if (!Array.isArray(content)) return [];
  return content.flatMap((part) =>
    isObject(part) && part.type === 'text' && nonEmpty(part.text) ? [part.text] : [],
  );
}

/**
 * Default extractor: a plain-text body; the `prompt`, `input`, `query` and
 * `question` fields; and the `user` / `tool` turns of a `messages` array
 * (string content or `{ type: 'text', text }` parts). System and assistant
 * turns are written by the application and are not scanned.
 */
export function defaultExtract(body: unknown): string[] {
  if (nonEmpty(body)) return [body];
  if (!isObject(body)) return [];
  const out: string[] = [];
  for (const field of PROMPT_FIELDS) {
    const v = body[field];
    if (nonEmpty(v)) out.push(v);
  }
  if (Array.isArray(body.messages)) {
    for (const m of body.messages) {
      if (isObject(m) && typeof m.role === 'string' && SCANNED_ROLES.has(m.role)) {
        out.push(...contentText(m.content));
      }
    }
  }
  return out;
}
