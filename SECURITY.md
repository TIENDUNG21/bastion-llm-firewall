# Security

## Reporting

Report a vulnerability in Bastion itself (a crash, an unbounded regular expression, a way to make the middleware pass traffic it should inspect, a redaction that leaves the original value in the response) by opening an issue that says you have a security report, without the details, and a private channel will be arranged.

A prompt that gets past the detectors is not a vulnerability in this sense; Bastion is a heuristic filter and will always miss some attacks. Open a normal issue with the prompt, and it may become a test case.

## What Bastion protects against

Bastion inspects text at two points: the user's prompt before it reaches the model, and the model's response before it reaches the user. It can block prompts that resemble known injection and jailbreak techniques, including disguised ones, and it can redact or withhold responses that contain personal data, credentials, a canary token or a large part of the system prompt.

## What it does not protect against

- Attacks it does not recognize. Paraphrases, other languages and novel techniques get through at a rate that depends on how far they are from the rules and the training data. See [docs/EVALUATION.md](docs/EVALUATION.md).
- Indirect injection through content the model reads (documents, web pages, tool results) unless the application passes that content through `inspectInput`.
- Anything the model does with tools. Bastion does not see or authorize tool calls; give tools the least privilege they need and confirm consequential actions with a person.
- Streamed responses written with `res.write` or server-sent events, which the Express middleware does not inspect.
- Personal data that has no fixed format, such as names and postal addresses.

## Deployment notes

- Keep the default `failMode: 'closed'` unless availability matters more than the filter for that endpoint.
- Generate a new canary with `createCanary()` per deployment or per session, and keep it out of logs.
- `onDecision` events include the findings, which can contain matched user text. Treat them as user data in your logs.
