# 0001. Normalize into views before detecting

Status: accepted

## Context

Keyword rules and n-gram models both fail on text that a human reads one way and a program sees another way: `ig​nore` with a zero-width space, `іgnоrе` with Cyrillic letters, `1gn0r3`, `i g n o r e`, or the whole instruction in base64. Each detector could defend itself, but then every rule author has to remember every trick, and the classifier would need training data for each.

## Decision

Normalization runs once, before any detector, and produces a list of views. The primary view is the input with invisible code points removed. Each payload that a decoder recovers (base64, hex, percent, entities, escapes, tag characters, rot13, reversal) becomes another view, recursively up to depth 3 and 16 views. Every view has a skeleton: NFKC, confusables mapped to Latin, lowercase, combining marks removed, leetspeak decoded inside words, spaced letters joined. Detectors and the classifier only read skeletons. What normalization removed or decoded is reported as evasion signals, which feed a separate obfuscation detector.

## Consequences

Rules are written once against plain lowercase Latin text and automatically cover the disguised forms. Hiding is itself evidence, scored separately, so an attacker who hides text gains less than they lose.

The skeleton is lossy. Diacritics are removed, so Vietnamese rules are written without them, and words joined only by a zero-width character become one word. Decoders can produce false views from text that happens to decode; requiring valid, mostly printable UTF-8 and a rise in English-likeness for rot13 and reversal keeps that rare, at the cost of missing payloads that decode to short or non-English text. Every input is processed several times, which the benchmarks bound at a few milliseconds for 20,000 characters.
