import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, parsePolicyConfig, resolvePolicy } from '../../src/policy/index.js';

describe('parsePolicyConfig', () => {
  it('accepts an empty object and a full config', () => {
    expect(parsePolicyConfig({})).toEqual({});
    const config = parsePolicyConfig({
      default: { input: { flagAt: 0.4, blockAt: 0.7 }, output: { pii: 'flag' } },
      routes: [
        { match: '/admin/**', policy: { input: { blockAt: 0.6 } } },
        { match: '/public/*', policy: { output: { piiKinds: ['email'], redaction: 'mask' } } },
      ],
    });
    expect(config.routes).toHaveLength(2);
  });

  it.each([
    [null, /^policy: expected an object/],
    [{ routes: {} }, /^policy.routes: expected an array/],
    [
      { default: { input: { flagAt: 2 } } },
      /^policy.default.input.flagAt: expected a number in \[0, 1\]/,
    ],
    [{ default: { input: { flagAt: 0.9, blockAt: 0.5 } } }, /flagAt must not exceed blockAt/],
    [
      { default: { output: { pii: 'delete' } } },
      /^policy.default.output.pii: expected one of allow, flag, redact, block/,
    ],
    [
      { default: { output: { piiKinds: ['email', 'ssn'] } } },
      /^policy.default.output.piiKinds\[1\]: expected one of/,
    ],
    [{ default: { input: { flagat: 0.5 } } }, /^policy.default.input.flagat: unknown key/],
    [
      { routes: [{ match: '', policy: {} }] },
      /^policy.routes\[0\].match: expected a path pattern starting with \//,
    ],
    [
      { routes: [{ match: '/a', policy: { input: { detectors: { 'role-play': 'no' } } } }] },
      /detectors.role-play: expected a boolean/,
    ],
    [{ extra: true }, /^policy.extra: unknown key/],
  ])('rejects malformed config %#', (input, message) => {
    expect(() => parsePolicyConfig(input)).toThrow(message);
  });
});

describe('resolvePolicy', () => {
  const config = parsePolicyConfig({
    default: { input: { flagAt: 0.4 } },
    routes: [
      { match: '/api/**', policy: { input: { blockAt: 0.7 } } },
      { match: '/api/chat/*', policy: { input: { blockAt: 0.6 } } },
      {
        match: '/api/chat/support',
        policy: { input: { blockAt: 0.5, detectors: { 'role-play': false } } },
      },
    ],
  });

  it('starts from the defaults', () => {
    expect(resolvePolicy({}, '/')).toEqual(DEFAULT_POLICY);
    expect(DEFAULT_POLICY.input).toMatchObject({ flagAt: 0.5, blockAt: 0.8, classifier: true });
    expect(DEFAULT_POLICY.output).toMatchObject({
      pii: 'redact',
      secrets: 'block',
      canary: 'block',
    });
  });

  it('applies the config default to every route', () => {
    expect(resolvePolicy(config, '/other').input.flagAt).toBe(0.4);
  });

  it('prefers an exact match, then the most specific glob', () => {
    expect(resolvePolicy(config, '/api/chat/support').input.blockAt).toBe(0.5);
    expect(resolvePolicy(config, '/api/chat/sales').input.blockAt).toBe(0.6);
    expect(resolvePolicy(config, '/api/chat/sales/x').input.blockAt).toBe(0.7);
    expect(resolvePolicy(config, '/api').input.blockAt).toBe(0.8);
  });

  it('merges detector switches instead of replacing them', () => {
    const p = resolvePolicy(config, '/api/chat/support');
    expect(p.input.detectors).toEqual({ 'role-play': false });
    expect(p.input.flagAt).toBe(0.4);
  });

  it('ignores the query string and trailing slash', () => {
    expect(resolvePolicy(config, '/api/chat/support/?x=1').input.blockAt).toBe(0.5);
  });
});
