# 0004. The middleware fails closed

Status: accepted

## Context

Inspection can throw: a malformed policy loaded at runtime, a bug in a detector, a body the extractor does not expect. The middleware then has to answer the request somehow. Passing the traffic through keeps the application available but silently removes the protection, and an attacker who finds an input that makes inspection throw has a bypass.

## Decision

By default, an exception during inspection answers 503 with a JSON error, on the input side before the route runs and on the output side instead of the model's response. `failMode: 'open'` passes the request or response through unchanged. Either way, `onDecision` receives an `error` event so the failure is visible in logs and metrics.

## Consequences

A bug in Bastion becomes an outage of the protected endpoint instead of a hole in it. Operators who prefer availability opt in explicitly per middleware instance. Inspection is synchronous and bounded (input is truncated at `maxLength`, every regular expression has bounded repetition and a timing test), which keeps exceptions and timeouts rare. Policy files are validated when the firewall is created, so configuration errors surface at startup rather than as 503s.
