# Changelog

## 1.0.0 (2026-11-17)

First release.

### @bastion/core

- Normalization into views: invisible code points and Unicode tag characters removed, NFKC and confusables folded to a Latin skeleton, leetspeak and spaced letters decoded, and base64, hex, percent, HTML entity, `\u` escape, rot13 and reversed payloads decoded to depth 3. Evasion signals report what was removed or decoded.
- Rule detectors for instruction override (English, German, French, Spanish, Vietnamese), persona and mode jailbreaks, delimiter and chat-template injection, tool-call smuggling and exfiltration links, and system-prompt extraction, plus an obfuscation detector. Noisy-OR scoring with evidence per match.
- Hashed n-gram logistic regression trained on deepset/prompt-injections and jackhhao/jailbreak-classification, calibrated so its validation threshold sits at 0.5, with per-term explanations. Held-out F1 95.0%, ROC-AUC 0.992.
- Output scanning for e-mail addresses, Vietnamese and international phone numbers, Luhn-checked card numbers, IPv4 addresses, Vietnamese citizen IDs, vendor API keys, JWTs, PEM keys, URL passwords, secret assignments and high-entropy tokens, on an offset-preserving fold of the text. Redaction with labels or masks.
- Canary tokens with folded, reversed and base64 matching, and shingle-based system-prompt leak detection.
- Per-route policies with glob matching, strict validation and path-specific error messages.
- Precision, recall, F1, confusion matrix and rank-based ROC-AUC, and a seeded stratified split with conflict-aware de-duplication.

### @bastion/express

- `bastion()`, `bastionInput()` and `bastionOutput()` middleware: 403 for blocked prompts, redaction or 502 for responses, `X-Bastion-*` headers, decisions on `res.locals`, fail-closed 503 by default.

### @bastion/cli

- `bastion scan`, `bastion redact` and `bastion eval`, with exit codes for use in CI.

### Playground

- Browser playground on GitHub Pages showing every detector, the classifier's terms and output redaction, with `connect-src 'none'` checked in CI.
