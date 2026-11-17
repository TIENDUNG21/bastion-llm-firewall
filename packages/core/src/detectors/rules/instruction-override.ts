import { createPatternDetector } from '../pattern-detector.js';

/**
 * "Ignore all previous instructions" and its relatives: the user text tries to
 * cancel the application's instructions and install its own.
 * Patterns run on the skeleton, so they are lowercase ASCII and already see
 * through accents, look-alike letters, leetspeak and invisible characters.
 */
const VERB =
  '(?:ignore|disregard|forget|skip|override|bypass|neglect|overlook|abandon|discard|erase|delete|clear|drop)';
const SCOPE =
  '(?:previous|prior|preceding|above|earlier|former|initial|original|old|existing|all|any|every|your|the|these|those|system|developer)';
const STRONG_OBJECT =
  '(?:instructions?|prompts?|rules|directives?|directions|guidelines|commands|orders|constraints|restrictions|guardrails|programming|policies|training|system prompt)';
const WEAK_OBJECT = '(?:tasks?|assignments?|context|conversation)';

export const instructionOverride = createPatternDetector({
  id: 'instruction-override',
  category: 'instruction-override',
  description: 'Text that tries to cancel the application instructions and replace them.',
  rules: [
    {
      id: 'ignore-previous-instructions',
      pattern: new RegExp(
        `\\b${VERB}\\b[^.\\n]{0,40}?\\b${SCOPE}\\b[^.\\n]{0,25}?\\b${STRONG_OBJECT}\\b`,
      ),
      weight: 0.9,
      explain: 'Asks the model to ignore or discard its existing instructions',
    },
    {
      id: 'ignore-previous-task',
      pattern: new RegExp(
        `\\b${VERB}\\b[^.\\n]{0,30}?\\b${SCOPE}\\b[^.\\n]{0,15}?\\b${WEAK_OBJECT}\\b`,
      ),
      weight: 0.55,
      explain: 'Asks the model to drop its current task or context',
    },
    {
      id: 'forget-everything',
      pattern:
        /\b(?:forget|ignore|disregard|erase)\b (?:about )?(?:everything|all)\b(?: (?:that|what))? ?(?:you (?:were|have been|got) (?:told|given|instructed)|(?:i|we) (?:said|told you|discussed)|(?:written |said |mentioned )?(?:above|before|previously|so far|until now|up to now))/,
      weight: 0.85,
      explain: 'Tells the model to forget everything it was told so far',
    },
    {
      id: 'forget-everything-short',
      pattern: /\b(?:forget|disregard|erase)\b (?:about )?everything\b/,
      weight: 0.6,
      explain: 'Tells the model to forget everything',
    },
    {
      id: 'new-instructions',
      pattern:
        /\b(?:new|updated|real|actual|true|revised|secret|hidden|override|admin|developer)\s+(?:instructions?|directives?|rules|system prompt|orders|mission)\s*(?::|are\b|is\b|follow\b)/,
      weight: 0.75,
      explain: 'Announces replacement instructions',
    },
    {
      id: 'your-new-task',
      pattern:
        /\byour (?:new|real|actual|true|only|next) (?:task|goal|purpose|job|mission|instructions?|role|objective) (?:is|are|will be|now)\b/,
      weight: 0.7,
      explain: 'Assigns the model a new task or purpose',
    },
    {
      id: 'from-now-on',
      pattern:
        /\b(?:from now on|from this (?:point|moment) (?:on|forward)|for the rest of (?:this|the) conversation|henceforth)\b[^.\n]{0,40}?\byou (?:will|must|are|shall|should|have to|can|may)\b/,
      weight: 0.55,
      explain: 'Redefines how the model must behave from now on',
    },
    {
      id: 'do-not-follow',
      pattern:
        /\b(?:do not|don't|dont|never|stop|no longer) (?:follow|obey|adhere to|comply with|listen to|respect|apply)(?:ing)? (?:your|the|any|those|these|previous|prior|original|system)\b[^.\n]{0,20}?\b(?:instructions?|rules|guidelines|policies|policy|restrictions|programming|constraints)\b/,
      weight: 0.8,
      explain: 'Tells the model not to follow its rules',
    },
    {
      id: 'instead-say',
      pattern:
        /\b(?:instead|rather)\b[^.\n]{0,15}?\b(?:say|print|output|respond with|reply with|answer with)\b/,
      weight: 0.3,
      explain: 'Redirects the answer to attacker-chosen output',
    },
    {
      id: 'override-de',
      pattern:
        /\b(?:ignorier\w*|vergiss|vergessen sie|missachte\w*)\b[^.\n]{0,40}?\b(?:anweisungen|instruktionen|befehle|regeln|vorgaben|aufgaben?|alles)\b/,
      weight: 0.85,
      explain: 'Asks (in German) to ignore previous instructions',
    },
    {
      id: 'override-fr',
      pattern:
        /\b(?:ignore[zr]?|oublie[zr]?)\b[^.\n]{0,30}?\b(?:consignes?|regles|directives|instructions? precedentes)\b/,
      weight: 0.85,
      explain: 'Asks (in French) to ignore previous instructions',
    },
    {
      id: 'override-es',
      pattern:
        /\b(?:ignora|olvida|olvide)\b[^.\n]{0,30}?\b(?:instrucciones|reglas|indicaciones|directrices)\b/,
      weight: 0.85,
      explain: 'Asks (in Spanish) to ignore previous instructions',
    },
    {
      id: 'override-vi',
      pattern:
        /\b(?:bo qua|phot lo|quen di|quen|lo di)\b[^.\n]{0,30}?\b(?:huong dan|chi dan|chi thi|lenh|quy tac|yeu cau)\b/,
      weight: 0.85,
      explain: 'Asks (in Vietnamese) to ignore previous instructions',
    },
  ],
});
