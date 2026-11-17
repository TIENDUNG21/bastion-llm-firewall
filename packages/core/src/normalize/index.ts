export { normalize } from './normalize.js';
export { skeleton, skeletonWithStats } from './skeleton.js';
export { foldWithMap } from './fold.js';
export type { FoldResult } from './fold.js';
export { stripInvisible, decodeTagPayload, isInvisible } from './invisible.js';
export { mapConfusables, countMixedScriptWords } from './confusables.js';
export {
  decodeBase64,
  findBase64Payloads,
  findHexPayloads,
  findEscapedPayloads,
  findRot13Segments,
  findReversedSegments,
  rot13,
} from './decoders.js';
export type {
  EvasionKind,
  EvasionSignal,
  NormalizedInput,
  NormalizedView,
  NormalizeOptions,
  ViewSource,
} from './types.js';
