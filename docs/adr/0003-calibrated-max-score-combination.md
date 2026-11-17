# 0003. Combine rules and classifier by maximum after calibration

Status: accepted

## Context

The rules produce a noisy-OR score in [0, 1] whose weights were set by hand. The classifier produces a probability whose useful threshold, found on validation data, is not 0.5. The policy has one pair of thresholds per route (`flagAt`, `blockAt`), so the two scores must be put on one scale and combined into one number that an operator can reason about.

Alternatives: a weighted average (a confident rule match would be diluted by an unsure classifier), noisy-OR of the two (treats them as independent, which they are not: both fire on the same obvious attacks), or a stacked model trained on both (needs more labelled data than exists here, and hides why a decision was made).

## Decision

Shift the classifier's logit by `logit(threshold)` so that its chosen threshold maps to 0.5, then take `max(rules, classifier)`.

## Consequences

Either scorer alone can block, which matches how they fail: the rules are precise on what they know, the classifier covers paraphrases. The operator sees both component scores in every decision and can tell which one acted. Turning the classifier off in a policy leaves the rules' semantics unchanged.

Max combination inherits the false positives of both scorers. On the current test split the rules raised none, so the combined numbers equal the classifier's; a broader rule set would add its false alarms directly. The 0.5 point is calibrated only in the sense of matching the validation threshold; the scores are not probabilities.
