import { createPatternDetector } from '../pattern-detector.js';

const VERB =
  '(?:reveal|show|print|display|output|repeat|recite|tell me|give me|share|dump|leak|expose|disclose|write out|spell out|list|return|provide|paste|copy|type out|what is|what are|whats)';
const SECRET_PROMPT =
  '(?:system (?:prompt|message|instructions)|(?:initial|original|hidden|secret|developer|internal|first) (?:prompt|instructions|message)|pre-?prompt)';

/** Requests to disclose the hidden system prompt or the text that came before the user turn. */
export const promptExtraction = createPatternDetector({
  id: 'prompt-extraction',
  category: 'prompt-extraction',
  description: 'Attempts to make the model reveal its system prompt or hidden context.',
  rules: [
    {
      id: 'reveal-system-prompt',
      pattern: new RegExp(`\\b${VERB}\\b[^.\\n]{0,30}?\\b${SECRET_PROMPT}\\b`),
      weight: 0.85,
      explain: 'Asks the model to reveal its system prompt',
    },
    {
      id: 'reveal-your-instructions',
      pattern: new RegExp(
        `\\b${VERB}\\b[^.\\n]{0,15}?\\byour\\b[^.\\n]{0,10}?\\b(?:prompt|instructions|guidelines|configuration|directives)\\b`,
      ),
      weight: 0.6,
      explain: 'Asks the model to show its own instructions',
    },
    {
      id: 'repeat-text-above',
      pattern:
        /\b(?:repeat|print|output|copy|echo|recite|write|say|summari[sz]e)\b[^.\n]{0,20}?\b(?:everything|all|the (?:text|words|content|instructions|prompt|messages?))(?: (?:written|said|that (?:was|is) written))? (?:above|before this|so far|preceding)\b/,
      weight: 0.75,
      explain: 'Asks the model to repeat the hidden text above the user message',
    },
    {
      id: 'what-were-you-told',
      pattern:
        /\bwhat (?:were|are|was|have) you (?:been )?(?:told|instructed|programmed)\b|\b(?:what|which) (?:instructions|rules|guidelines) (?:were you|have you been|did you get|are you) (?:given|told|programmed|following)\b/,
      weight: 0.6,
      explain: 'Asks what the model was instructed to do',
    },
    {
      id: 'reveal-secret',
      pattern:
        /\b(?:reveal|tell me|give me|spell|print|show|leak)\b[^.\n]{0,20}?\b(?:the|your)\b[^.\n]{0,10}?\b(?:secret|password|passphrase|api key|secret key|access key|credentials)\b/,
      weight: 0.45,
      explain: 'Asks the model to reveal a secret or password it holds',
    },
  ],
});
