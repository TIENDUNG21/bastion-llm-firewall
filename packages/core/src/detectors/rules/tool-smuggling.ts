import { createPatternDetector } from '../pattern-detector.js';

/**
 * Attempts to make the model call tools or leak data on the attacker's behalf:
 * hand-written function-call JSON, tool tags, markdown-image exfiltration and
 * instructions to send data to a URL.
 */
export const toolSmuggling = createPatternDetector({
  id: 'tool-smuggling',
  category: 'tool-smuggling',
  description: 'Smuggled tool calls, data exfiltration links and shell commands.',
  rules: [
    {
      id: 'function-call-json',
      pattern:
        /\{\s*"(?:name|function|tool|tool_name|action|function_call|tool_calls?)"\s*:\s*["{[][^\n]{0,200}?"(?:arguments|parameters|args|input|action_input|params)"\s*:/,
      weight: 0.7,
      explain: 'Contains a hand-written function-call object',
    },
    {
      id: 'tool-tags',
      pattern:
        /<\/?(?:tool_call|tool_calls|tool_use|function_call|function_calls|invoke|tool_result|function_results?)\b/,
      weight: 0.75,
      explain: 'Contains tool-call markup',
    },
    {
      id: 'markdown-image-exfil',
      pattern:
        /!\[[^\]\n]{0,100}\]\(\s*https?:\/\/[^)\s]{1,300}[?&][^)\s]{0,100}(?:\{|%7b|\$\(|data=|q=|secret|history|conversation|password|token|prompt)/,
      weight: 0.85,
      explain: 'Markdown image whose URL would carry data to a third-party server',
    },
    {
      id: 'send-data-to-url',
      pattern:
        /\b(?:send|post|forward|upload|exfiltrate|leak|transmit|submit)\b[^.\n]{0,60}?\b(?:to|into|at|via)\b\s+(?:https?:\/\/|www\.|ftp:\/\/)/,
      weight: 0.6,
      explain: 'Asks to send data to an external URL',
    },
    {
      id: 'send-sensitive-data',
      pattern:
        /\b(?:send|post|forward|upload|exfiltrate|leak|transmit|email)\b[^.\n]{0,40}?\b(?:conversation|chat history|history|password|credentials|secrets?|api keys?|tokens?|system prompt|previous messages|user data|personal data)\b[^.\n]{0,40}?\b(?:to|at|via)\b/,
      weight: 0.7,
      explain: 'Asks to send conversation data or credentials somewhere',
    },
    {
      id: 'pipe-to-shell',
      pattern: /\b(?:curl|wget)\b[^|\n]{0,200}\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/,
      weight: 0.6,
      explain: 'Downloads a script and pipes it to a shell',
    },
    {
      id: 'destructive-shell',
      pattern: /\brm\s+-rf\s+(?:\/|~|\*)|\bnc\s+-e\b|\bmkfifo\b[^\n]{0,60}\bnc\b/,
      weight: 0.6,
      explain: 'Contains a destructive or reverse-shell command',
    },
    {
      id: 'call-tool-imperative',
      pattern:
        /\b(?:call|invoke|execute|trigger)\b (?:the |your )?(?:\w+ ){0,2}?(?:function|tool|plugin|action)\b[^.\n]{0,40}?\b(?:with|using|passing)\b/,
      weight: 0.3,
      explain: 'Tells the model to call a tool with given arguments',
    },
  ],
});
