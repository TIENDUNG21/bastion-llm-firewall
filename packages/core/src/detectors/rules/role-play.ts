import { createPatternDetector } from '../pattern-detector.js';

/** Persona and "mode" jailbreaks that ask the model to become an unrestricted character. */
export const rolePlay = createPatternDetector({
  id: 'role-play',
  category: 'role-play',
  description: 'Persona or mode jailbreaks that ask the model to drop its safety rules.',
  rules: [
    {
      id: 'do-anything-now',
      pattern: /\bdo anything now\b/,
      weight: 0.9,
      explain: 'Uses the "Do Anything Now" (DAN) jailbreak persona',
    },
    {
      id: 'named-persona',
      pattern:
        /\b(?:dan|stan|dude|aim|betterdan|antigpt|devmode)\b[^.\n]{0,60}?\b(?:stands? for|no (?:limits|restrictions|filters|rules)|jailbr\w*|unfiltered|persona)\b/,
      weight: 0.75,
      explain: 'Introduces a known jailbreak persona',
    },
    {
      id: 'jailbreak-mode',
      pattern:
        /\b(?:jailbreak|jailbroken|god|unrestricted|unfiltered|uncensored|evil|chaos|opposite|unlocked|dan) mode\b|\bdeveloper mode (?:enabled|activated|output|response)/,
      weight: 0.75,
      explain: 'Switches the model into an unrestricted "mode"',
    },
    {
      id: 'jailbreak-word',
      pattern: /\bjailbr(?:eak|oken|eaking)\b/,
      weight: 0.4,
      explain: 'Mentions jailbreaking',
    },
    {
      id: 'no-ethical-guidelines',
      pattern:
        /\b(?:no|without|free (?:of|from)|not bound by|bypass\w*|ignor\w*|disregard\w*) (?:any |all |the |your )?(?:ethical|moral|content|safety|usage|community)(?: (?:and|or) (?:ethical|moral|content|safety|legal))? (?:guidelines|restrictions|filters?|policies|policy|rules|constraints|limitations|principles|standards|boundaries)\b/,
      weight: 0.75,
      explain: 'Asks the model to operate without ethical or safety rules',
    },
    {
      id: 'unrestricted-ai',
      pattern:
        /\b(?:unfiltered|uncensored|unrestricted|amoral|unethical|unbound|unshackled|unaligned|immoral)\b[^.\n]{0,20}?\b(?:ai|assistant|chatbot|model|version|persona|character|responses?|answers?|bot|llm)\b/,
      weight: 0.7,
      explain: 'Asks for an unfiltered or amoral AI persona',
    },
    {
      id: 'freed-from-limits',
      pattern:
        /\byou (?:have been|are|were) (?:now )?(?:freed|released|liberated|unlocked|unchained|reprogrammed)\b|\byou are (?:no longer|not) (?:an? )?(?:ai|assistant|chatbot|language model|bound|restricted|limited)\b/,
      weight: 0.75,
      explain: 'Claims the model has been freed from its limitations',
    },
    {
      id: 'pretend-unrestricted',
      pattern:
        /\b(?:pretend|imagine|act|behave|roleplay|role-play|role play|simulate)\b[^.\n]{0,30}?\b(?:you are|you're|to be|as|like)\b[^.\n]{0,40}?\b(?:ai|assistant|chatbot|model|hacker|villain|criminal)\b/,
      weight: 0.4,
      explain: 'Sets up a role-play as an AI, hacker or villain',
    },
    {
      id: 'stay-in-character',
      pattern: /\b(?:stay|remain|keep) in (?:character|role)\b|\bbreak(?:ing)? character\b/,
      weight: 0.5,
      explain: 'Forbids the model from leaving the role-play',
    },
    {
      id: 'dual-response',
      pattern:
        /\b(?:two|2|both|dual|separate) (?:different )?(?:responses|answers|replies|paragraphs|outputs)\b[^.\n]{0,80}?\b(?:jailbr\w*|dan|unfiltered|uncensored|developer mode)\b/,
      weight: 0.7,
      explain: 'Asks for a normal answer plus an unrestricted one',
    },
    {
      id: 'fiction-without-rules',
      pattern:
        /\b(?:hypothetical(?:ly)?|fictional|in a (?:story|novel|movie|game|world)|for (?:a|my) (?:story|novel|research))\b[^.\n]{0,60}?\b(?:no (?:rules|restrictions|limits|laws|ethics)|without (?:rules|restrictions|limits|ethics|consequences)|anything goes)\b/,
      weight: 0.45,
      explain: 'Uses fiction to frame a world without rules',
    },
  ],
});
