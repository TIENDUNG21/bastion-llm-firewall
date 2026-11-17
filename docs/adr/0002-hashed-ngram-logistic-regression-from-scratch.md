# 0002. A hashed n-gram logistic regression, trained from scratch

Status: accepted

## Context

The rules are precise but only catch the phrasings they name; on the held-out split they find 58.5% of injections. A learned model is needed for recall. The options were a fine-tuned transformer (DeBERTa-class prompt-injection classifiers exist), an embedding model with a linear head, or a linear model over sparse features.

The constraints: the core has no runtime dependencies and runs in the browser playground, a decision must be explainable term by term, inference must take well under a millisecond for a typical prompt, and the model must be reproducible from public data by `npm run train`.

## Decision

Logistic regression over feature-hashed (Weinberger et al., 2009) character 3- to 5-grams of the skeleton and word unigrams and bigrams, 2¹⁶ signed buckets, log-scaled counts, L2 normalization. It is implemented in TypeScript and trained with AdaGrad (Duchi et al., 2011), L2 regularization and balanced class weights. Learning rate, L2 strength, epochs and the threshold are picked by grid search on a validation slice. Only the 24,000 largest weights are kept, in a 318 KB JSON file that is validated when loaded.

## Consequences

The model runs everywhere the core runs, scores a 200-character prompt in well under a millisecond, and every score can be explained by the terms that moved it. Training is deterministic, so a reviewer can rebuild `model.json` and diff it.

A bag of n-grams has no notion of meaning or word order beyond bigrams. It learns the surface of the two training datasets, including their biases: long instruction-style prompts look like jailbreaks to it, and its recall on deepset's short and partly German prompts is 86.8%. A transformer would likely generalize further, and that comparison is not measured here.
