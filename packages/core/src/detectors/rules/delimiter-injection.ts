import { createPatternDetector } from '../pattern-detector.js';

/**
 * Fake conversation structure: chat-template tokens, role headers and
 * "end of prompt" markers that try to make user text look like a system turn.
 */
export const delimiterInjection = createPatternDetector({
  id: 'delimiter-injection',
  category: 'delimiter-injection',
  description: 'Fake chat-template tokens, role headers or prompt boundaries inside user text.',
  rules: [
    {
      id: 'chat-template-token',
      pattern:
        /<\|\s*(?:im_start|im_end|im_sep|endoftext|eot_id|start_header_id|end_header_id|begin_of_text|eom_id|system|user|assistant)\s*\|>/,
      weight: 0.9,
      explain: 'Contains chat-template control tokens that open a fake turn',
    },
    {
      id: 'inst-sys-tags',
      pattern: /\[\/?inst\]|<<\/?sys>>|\[\/?sys(?:tem)?\]/,
      weight: 0.8,
      explain: 'Contains instruction or system tags from chat templates',
    },
    {
      id: 'role-header',
      pattern:
        /(?:^|\n)[ \t]*(?:#{1,6} ?|\*\*|\[|<)?(?:system|developer|admin|administrator|root)(?: (?:message|prompt|instructions?|note|override|update))?(?:\*\*|\]|>)?[ \t]*:/,
      weight: 0.65,
      explain: 'Starts a line with a fake system or developer header',
    },
    {
      id: 'assistant-turn',
      pattern: /\n[ \t]*(?:#{1,6} ?)?(?:assistant|ai|chatbot)[ \t]*:/,
      weight: 0.4,
      explain: 'Inserts a fake assistant turn',
    },
    {
      id: 'xml-role-tag',
      pattern: /<\/?(?:system|system_prompt|instructions?|admin|developer|sys)[ \t]*>/,
      weight: 0.6,
      explain: 'Wraps text in system or instruction tags',
    },
    {
      id: 'prompt-boundary',
      pattern:
        /\b(?:end|begin|start) of (?:the )?(?:system |user |original )?(?:prompt|instructions|input|context|document|conversation)\b|\b(?:prompt|instructions|user input) (?:ends|ended|is over|has ended)\b/,
      weight: 0.55,
      explain: 'Declares the end of the prompt to start a new section',
    },
    {
      id: 'fenced-system',
      pattern: /```[ \t]*(?:system|instructions?|prompt)\b/,
      weight: 0.55,
      explain: 'Opens a code fence labelled as system instructions',
    },
    {
      id: 'json-system-role',
      pattern: /"role"\s*:\s*"(?:system|developer)"/,
      weight: 0.7,
      explain: 'Embeds a chat message with the system role',
    },
  ],
});
